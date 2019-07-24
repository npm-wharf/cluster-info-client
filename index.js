'use strict'

const createVault = require('node-vault')
const rpn = require('request-promise-native')
const equal = require('fast-deep-equal')
const SA_PATH = 'credentials/google/'

module.exports = function createClient (options = {}) {
  const {
    vaultHost = 'http://localhost:8200',
    vaultToken = process.env.VAULT_TOKEN,
    vaultRoleId = process.env.VAULT_ROLE_ID,
    vaultSecretId = process.env.VAULT_SECRET_ID,
    vaultPrefix = process.env.VAULT_SECRET_PREFIX || 'kv/'
  } = options

  let vault = createVault({
    endpoint: vaultHost,
    token: vaultToken,
    // workaround for https://github.com/kr1sp1n/node-vault/issues/80
    'request-promise': rpn
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
        token: auth.client_token,
        'request-promise': rpn
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

    issueCertificate,

    close
  }

  async function registerCluster (slug, environment, secretProps, channels = []) {
    if (typeof environment !== 'string') throw new Error('`environment` must be a string')
    await vaultAuth
    await _ensureChannelsExist(channels)

    const props = {
      environment,
      value: secretProps
    }

    await _saveClusterData(props, slug, environment)

    for (const chan of channels) {
      await addClusterToChannel(slug, chan)
    }

    const { value = {} } = await _readVault(_allClustersPath())
    const path = _secretPath(slug, environment)
    if (value[slug] === path) return
    value[slug] = path
    await vault.write(_allClustersPath(), { data: { value: JSON.stringify(value, null, 2) } })
  }

  async function updateCluster (slug, environment, secretProps) {
    await vaultAuth
    await _ensureClusterExists(slug)

    const props = {
      value: secretProps,
      environment
    }

    await _saveClusterData(props, slug, environment)
  }

  async function unregisterCluster (slug) {
    await vaultAuth
    await _ensureClusterExists(slug)

    const { channels, environment } = await getCluster(slug)

    // un-associate the cluster from channels
    await Promise.all(channels.map(channel => _removeClusterFromChannel(slug, channel)))

    const { value: allClusters } = await _readVault(_allClustersPath())
    delete allClusters[slug]
    await vault.write(_allClustersPath(), { data: { value: JSON.stringify(allClusters, null, 2) } })

    await _deleteSecret(slug, environment)
  }

  async function listClusters () {
    const { value } = await _readVault(_allClustersPath())
    return Object.keys(value).sort()
  }

  async function getCluster (slug) {
    await _ensureClusterExists(slug)
    const { value: clusterMap } = await _readVault(_allClustersPath())
    const environment = /clusters\/([^/]+)\//.exec(clusterMap[slug])[1]
    return _getSecret(slug, environment)
  }

  async function createChannel (channel) {
    if (channel === 'all') return

    const list = await listChannels()
    if (list.includes(channel)) return
    list.push(channel)
    list.sort()

    await vault.write(_channelPath('all'), {
      data: { value: JSON.stringify(list, null, 2) }
    })

    await vault.write(_channelPath(channel), {
      data: { value: '[]' }
    })
  }

  async function deleteChannel (channel) {
    const list = await listChannels()
    const newList = list.filter(c => c !== channel)

    await vault.write(`${vaultPrefix}data/channels/all`, {
      data: { value: JSON.stringify(newList, null, 2) }
    })

    await vault.delete(`${vaultPrefix}data/channels/${channel}`)
  }

  async function listChannels () {
    await vaultAuth
    const { value = [] } = await _readVault(`${vaultPrefix}data/channels/all`)
    return value
  }

  async function addClusterToChannel (slug, channel) {
    await vaultAuth
    const [ cluster ] = await Promise.all([
      getCluster(slug),
      _ensureChannelsExist([channel])
    ])

    let { channels = [], environment } = cluster

    if (!channels.includes(channel)) {
      channels.push(channel)
      channels.sort()
    }

    await Promise.all([
      _addClusterToChannel(slug, channel),
      _saveClusterData({ channels }, slug, environment)
    ])
  }

  async function removeClusterFromChannel (slug, channel) {
    await vaultAuth
    const [ cluster ] = await Promise.all([
      getCluster(slug),
      _ensureChannelsExist([channel])
    ])

    let { channels, environment } = cluster

    channels = channels.filter(chan => chan !== channel)

    await Promise.all([
      _removeClusterFromChannel(slug, channel),
      _saveClusterData({ channels }, slug, environment)
    ])
  }

  async function listClustersByChannel (channel) {
    await vaultAuth
    const { value } = await _readVault(_channelPath(channel))
    return value
  }

  async function addServiceAccount (jsonServiceAccountKey) {
    const addr = jsonServiceAccountKey['client_email']
    if (!addr) throw new Error('service account key must have a `client_email` property')
    await vaultAuth
    const exisiting = await getServiceAccount(addr)

    if (equal(exisiting, jsonServiceAccountKey)) return

    await vault.write(_secretSAPath(addr), { data: { value: JSON.stringify(jsonServiceAccountKey, null, 2) } })
  }

  async function getServiceAccount (serviceAccountAddress) {
    const resp = await _readVault(_secretSAPath(serviceAccountAddress))
    return resp.value
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
    return (await _readVault(`${vaultPrefix}data/clusters/common/${provider.toLowerCase()}`)).value
  }

  async function issueCertificate (role, domain, ttl = 5 * 60) {
    await vaultAuth
    const resp = await vault.write(`pki/issue/${role}`, { common_name: domain, ttl: ttl })
    return resp.data
  }

  function close () {
  }

  async function _ensureClusterExists (slug) {
    await vaultAuth
    const resp = await vault.read(`${vaultPrefix}data/clusters/all`)
    const map = JSON.parse(resp.data.data.value)
    if (!map[slug]) throw new Error(`cluster '${slug}' does not exist`)
  }

  async function _ensureChannelsExist (channels) {
    const list = await listChannels()

    channels.forEach(channel => {
      if (!list.includes(channel)) {
        throw new Error(`channel '${channel}' must exist`)
      }
    })
  }

  async function _addClusterToChannel (slug, channel) {
    const { value: clusters } = await _readVault(_channelPath(channel))

    if (clusters.includes(slug)) return

    clusters.push(slug)
    clusters.sort()
    await vault.write(_channelPath(channel), { data: { value: JSON.stringify(clusters, null, 2) } })
  }

  async function _removeClusterFromChannel (slug, channel) {
    const { value: clusters } = await _readVault(_channelPath(channel))

    const newClusters = clusters.filter(cl => cl !== slug)

    if (newClusters.length === clusters.length) return

    await vault.write(_channelPath(channel), { data: { value: JSON.stringify(newClusters, null, 2) } })
  }

  async function _saveClusterData (props, slug, environment) {
    const previous = await _readVault(_secretPath(slug, environment))

    // only update if a key has changed
    const needsUpdate = Object.keys(props).some(key => {
      if ((typeof props[key] === 'string') && previous[key] !== props[key]) return true
      if (!equal(previous[key], props[key])) return true
    })

    if (!needsUpdate) return

    await vault.write(_secretPath(slug, environment), {
      data: mapValues({ ...previous, ...props }, val => {
        if (typeof val === 'string') return val
        return JSON.stringify(val, null, 2)
      })
    })
  }

  async function _getSecret (slug, environment) {
    return _readVault(_secretPath(slug, environment))
  }

  async function _readVault (path) {
    await vaultAuth
    try {
      var resp = await vault.read(path)
    } catch (err) {
      // istanbul ignore next
      if (err.response && err.response.statusCode === 404) return {}
      // istanbul ignore next
      throw err
    }
    const result = mapValues(resp.data.data, val => {
      let parsed = val
      try {
        parsed = JSON.parse(val)
      } catch (e) {}
      return parsed
    })
    return result
  }

  async function _deleteSecret (name, environment) {
    await vaultAuth
    await vault.delete(_secretPath(name, environment))
  }

  function _secretPath (name, environment) {
    return `${vaultPrefix}data/clusters/${environment}/${name}`
  }

  function _allClustersPath () {
    return `${vaultPrefix}data/clusters/all`
  }

  function _secretSAPath (addr) {
    return `${vaultPrefix}data/${SA_PATH}${addr}`
  }

  function _channelPath (channel) {
    return `${vaultPrefix}data/channels/${channel}`
  }
}

function mapValues (obj, fn) {
  const newObj = {}
  Object.keys(obj).forEach(key => {
    newObj[key] = fn(obj[key])
  })
  return newObj
}
