const Redis = require('ioredis')
const createVault = require('node-vault')
const CLUSTER_PREFIX = 'cluster:'
const CHANNELS_PREFIX = 'channels:'
const CHANNELS_KEY = 'channels'
const SA_PATH = 'credentials/google/'

module.exports = function createClient (options = {}) {
  const {
    redisUrl = 'redis://localhost:6379',
    vaultHost = 'http://localhost:8200',
    vaultToken = process.env.VAULT_TOKEN,
    vaultRoleId = process.env.VAULT_ROLE_ID,
    vaultSecretId = process.env.VAULT_SECRET_ID,
    vaultPrefix = 'kv/'
  } = options

  const redis = new Redis(redisUrl)
  let vault = createVault({
    endpoint: vaultHost,
    token: vaultToken
  })

  let vaultAuth

  if (vaultToken) {
    vaultAuth = Promise.resolve()
  } else if (vaultRoleId && vaultSecretId) {
    vaultAuth = vault.approleLogin({
      role_id: vaultRoleId,
      secret_id: vaultSecretId
    }).then(result => {
      const { auth } = result
      vault = createVault({
        endpoint: vaultHost,
        token: auth.client_token
      })
    })
  }

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
    listClustersByChannel,

    addServiceAccount,
    getServiceAccount,
    removeServiceAccount,
    listServiceAccounts,

    getCommon,

    close
  }

  async function registerCluster (name, props, secretProps = {}, channels = []) {
    const {
      environment = 'production'
    } = props
    await _ensureChannelsExist(channels)

    let txn = _setClusterProps(redis.multi(), name, props)

    if (channels.length > 0) {
      txn = txn.hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels.join(','))
      channels.forEach(chan => {
        txn = txn.sadd(CHANNELS_PREFIX + chan, name)
      })
    }

    if (Object.keys(secretProps).length > 0) {
      await _saveSecret(secretProps, name, environment)
    }

    await txn.exec()
  }

  async function updateCluster (name, props, secretProps = {}) {
    const {
      environment = 'production'
    } = props
    await _ensureClusterExists(name)

    const channels = await redis.hget(CLUSTER_PREFIX + name, CHANNELS_KEY)

    let txn = redis.multi()
      .del(CLUSTER_PREFIX + name)
      .hset(CLUSTER_PREFIX + name, CHANNELS_KEY, channels)

    txn = _setClusterProps(txn, name, props)

    if (Object.keys(secretProps).length > 0) {
      await _saveSecret(secretProps, name, environment)
    } else {
      await _deleteSecret(name, environment)
    }

    await txn.exec()
  }

  async function unregisterCluster (name) {
    await _ensureClusterExists(name)

    const props = await redis.hgetall(CLUSTER_PREFIX + name)
    const {
      [CHANNELS_KEY]: channels,
      environment = 'production'
    } = props

    let txn = redis.multi()

    // un-associate the cluster from channels
    txn = channels
      .split(',')
      .reduce((tx, chan) => tx.srem(CHANNELS_PREFIX + chan, name), txn)

    txn = txn.del(CLUSTER_PREFIX + name)

    await Promise.all([
      txn.exec(),
      _deleteSecret(name, environment)
    ])
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
    const {
      environment = 'production'
    } = props
    props.secretProps = await _getSecret(name, environment)
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

  async function listClustersByChannel (channel) {
    const list = await redis.smembers(CHANNELS_PREFIX + channel)
    return list.sort()
  }

  async function addServiceAccount (jsonServiceAccountKey) {
    const addr = jsonServiceAccountKey['client_email']
    if (!addr) throw new Error('service account key must have a `client_email` property')
    await vaultAuth
    await vault.write(_secretSAPath(addr), { data: { value: JSON.stringify(jsonServiceAccountKey, null, 2) } })
  }

  async function getServiceAccount (serviceAccountAddress) {
    return _readVault(_secretSAPath(serviceAccountAddress))
  }

  async function removeServiceAccount (serviceAccountAddress) {
    await vaultAuth
    await vault.delete(_secretSAPath(serviceAccountAddress))
  }

  async function listServiceAccounts () {
    await vaultAuth
    const resp = await vault.list(`${vaultPrefix}metadata/${SA_PATH}`)
    return resp.data.keys.sort()
  }

  async function getCommon (provider = 'GKE') {
    return _readVault(`${vaultPrefix}data/clusters/common/${provider.toLowerCase()}`)
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

  async function _saveSecret (props, name, environment) {
    const previous = await _readVault(_secretPath(name, environment))
    if (JSON.stringify(previous) === JSON.stringify(props)) return
    await vaultAuth
    await vault.write(_secretPath(name, environment), { data: { value: JSON.stringify(props, null, 2) } })
  }

  async function _getSecret (name, environment) {
    return _readVault(_secretPath(name, environment))
  }

  async function _readVault (path) {
    try {
      await vaultAuth
      var resp = await vault.read(path)
    } catch (err) {
      // istanbul ignore next
      if (err.response && err.response.statusCode === 404) return
      // istanbul ignore next
      throw err
    }
    return JSON.parse(resp.data.data.value)
  }

  async function _deleteSecret (name, environment) {
    await vaultAuth
    await vault.delete(_secretPath(name, environment))
  }

  function _secretPath (name, environment) {
    return `${vaultPrefix}data/clusters/${environment}/${name}`
  }

  function _secretSAPath (addr) {
    return `${vaultPrefix}data/${SA_PATH}${addr}`
  }
}
