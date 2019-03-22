const Redis = require('ioredis')
const CLUSTER_PREFIX = 'cluster:'
const CHANNELS_PREFIX = 'channels:'
const CHANNELS_KEY = 'channels'

module.exports = function createClient (options = {}) {
  const {
    redisUrl = 'redis://localhost:6379'
  } = options

  const redis = new Redis(redisUrl)

  return {
    createChannel,
    deleteChannel,
    listChannels,

    registerCluster,
    updateCluster,
    unregisterCluster,
    listClusters,
    getCluster,

    addClusterToChannel,
    removeClusterFromChannel,

    close
  }

  async function registerCluster (name, props, secretProps = {}, channels = []) {
    await _ensureChannelsExist(channels)

    let txn = _setClusterProps(redis.multi(), name, props)

    if (channels.length > 0) {
      txn = txn.hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels.join(','))
      channels.forEach(chan => {
        txn = txn.sadd(CHANNELS_PREFIX + chan, name)
      })
    }

    await txn.exec()
  }

  async function updateCluster (name, props, secretProps = {}) {
    await _ensureClusterExists(name)

    const channels = await redis.hget(CLUSTER_PREFIX + name, CHANNELS_KEY)

    let txn = redis.multi()
      .del(CLUSTER_PREFIX + name)
      .hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels)

    txn = _setClusterProps(txn, name, props)

    await txn.exec()
  }

  async function unregisterCluster (name) {
    await _ensureClusterExists(name)

    const channels = await redis.hget(CLUSTER_PREFIX + name, CHANNELS_KEY)

    let txn = redis.multi()

    // un-associate the cluster from channels
    txn = channels
      .split(',')
      .reduce((tx, chan) => tx.srem(CHANNELS_PREFIX + chan, name), txn)

    txn = txn.del(CLUSTER_PREFIX + name)

    await txn.exec()
  }

  async function listClusters () {
    const keys = await redis.keys(CLUSTER_PREFIX + '*')
    return keys.map(key => key.split(CLUSTER_PREFIX)[1]).sort()
  }

  async function getCluster (name) {
    await _ensureClusterExists(name)
    const props = await redis.hgetall(CLUSTER_PREFIX + name)
    if (props[CHANNELS_KEY]) props[CHANNELS_KEY] = props[CHANNELS_KEY].split(',')
    props.name = name
    return props
  }

  async function createChannel (channel) {
    await redis.sadd(CHANNELS_KEY, channel)
  }

  async function deleteChannel (channel) {
    await redis.srem(CHANNELS_KEY, channel)
  }

  async function listChannels () {
    return (await redis.smembers(CHANNELS_KEY)).sort()
  }

  async function addClusterToChannel (name, channel) {
    await Promise.all([
      _ensureClusterExists(name),
      _ensureChannelsExist([channel])
    ])

    const rawChannels = await redis.hget(CLUSTER_PREFIX + name, CHANNELS_KEY)
    let channels = []
    if (rawChannels) {
      channels = rawChannels.split(',')
    }
    channels.push(channel)

    await redis.multi()
      .hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels.sort().join(','))
      .sadd(CHANNELS_PREFIX + channel, name)
      .exec()
  }

  async function removeClusterFromChannel (name, channel) {
    await Promise.all([
      _ensureClusterExists(name),
      _ensureChannelsExist([channel])
    ])

    const rawChannels = await redis.hget(CLUSTER_PREFIX + name, CHANNELS_KEY)
    let channels = []
    if (rawChannels) {
      channels = rawChannels.split(',')
    }
    channels = channels.filter(chan => chan !== channel)

    let txn = redis.multi()
      .srem(CHANNELS_PREFIX + channel, name)

    if (channels.length === 0) {
      txn = txn.hdel(CLUSTER_PREFIX + name, CHANNELS_KEY)
    } else {
      txn = txn.hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels.join(','))
    }
    await txn.exec()
  }

  function close () {
    redis.disconnect()
  }

  function _setClusterProps (txn, name, props) {
    return Object.keys(props).reduce((tx, key) => {
      return tx.hset(CLUSTER_PREFIX + name, key, props[key])
    }, txn)
  }

  async function _ensureClusterExists (name) {
    const exists = await redis.exists(CLUSTER_PREFIX + name)
    if (!exists) throw new Error(`cluster '${name}' does not exist`)
  }

  async function _ensureChannelsExist (channels) {
    let txn = redis.multi()
    channels.forEach(chan => {
      txn = txn.sismember(CHANNELS_KEY, chan)
    })

    const flags = await txn.exec()

    flags.forEach(([_, flag], idx) => {
      if (!flag) throw new Error(`channel '${channels[idx]}' must exist`)
    })
  }
}
