const tap = require('tap')
const nock = require('nock')
const createInfoClient = require('../')

nock.disableNetConnect()

function mapValues (obj, fn) {
  const newObj = {}
  Object.keys(obj).forEach(key => {
    newObj[key] = fn(obj[key])
  })
  return newObj
}

const stringify = val => (typeof val === 'string')
  ? val
  : JSON.stringify(val, null, 2)

const kvGet = (obj) => ({ data: { data: mapValues(obj, stringify) } })
const kvPut = (obj) => ({ data: mapValues(obj, stringify) })

const createClient = () => createInfoClient({
  vaultHost: process.env.VAULT_ADDR || 'http://vault.dev:8200',
  vaultToken: process.env.VAULT_TOKEN || 's.deadb33f',
  vaultPrefix: process.env.VAULT_PREFIX || 'kv/'
})

tap.test('create and close a client', async t => {
  const client = createClient()
  client.close()
})

tap.test('create and close a client w/ defaults', async t => {
  const client = createInfoClient()
  client.close()
})

tap.test('channels', async t => {
  const client = createClient()

  t.test('createChannel', async t => {
    t.test('add one', async t => {
      const vaultMock = nock('http://vault.dev:8200/')
        .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["dummy"]' }))
        .put('/v1/kv/data/channels/all', kvPut({ value: ['default', 'dummy'] })).reply(200)
        .put('/v1/kv/data/channels/default', kvPut({ value: '[]' })).reply(200)

      console.log('add default')
      await client.createChannel('default')
      vaultMock.done()
    })

    t.test('add another', async t => {
      const vaultMock = nock('http://vault.dev:8200/')
        .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default","dummy"]' }))
        .put('/v1/kv/data/channels/all', kvPut({ value: ['default', 'dummy', 'other'] })).reply(200)
        .put('/v1/kv/data/channels/other', { data: { value: '[]' } }).reply(200)

      console.log('add other')
      await client.createChannel('other')
      vaultMock.done()
    })

    t.test('add existing', async t => {
      const vaultMock = nock('http://vault.dev:8200/')
        .get('/v1/kv/data/channels/all')
        .reply(200, kvGet({ value: '["default","dummy","other"]' }))

      console.log('add default')
      await client.createChannel('default')

      vaultMock.done()
      nock.cleanAll()
    })
  })

  t.test('listChannels', async t => {
    const vaultMock = nock('http://vault.dev:8200/')
      .get('/v1/kv/data/channels/all')
      .reply(200, kvGet({ value: '["default","dummy","other"]' }))

    const channels = await client.listChannels()
    t.same(channels, ['default', 'dummy', 'other'])
    vaultMock.done()
  })

  t.test('deleteChannel', async t => {
    const vaultMock = nock('http://vault.dev:8200/')
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default","dummy","other"]' }))
      .put('/v1/kv/data/channels/all', kvPut({ value: ['default', 'dummy'] })).reply(200)
      .delete('/v1/kv/data/channels/other').reply(200)
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default","dummy"]' }))

    await client.deleteChannel('other')

    t.same(await client.listChannels(), ['default', 'dummy'])

    vaultMock.done()
    nock.cleanAll()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('registerCluster', async t => {
  const client = createClient()

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200/')
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default"]' }))
      .get('/v1/kv/data/clusters/production/my-cluster').reply(404)
      .get('/v1/kv/data/channels/default').reply(200, kvGet({ value: '[]' }))
      .put('/v1/kv/data/channels/default', kvPut({ value: ['my-cluster'] })).reply(200)
      .put('/v1/kv/data/clusters/production/my-cluster', kvPut({
        value: { password: 'hunter2' },
        environment: 'production',
        channels: ['default']
      })).reply(200)
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {} }))
      .put('/v1/kv/data/clusters/all', kvPut({
        value: { 'my-cluster': 'kv/data/clusters/production/my-cluster' }
      })).reply(200)

    await client.registerCluster('my-cluster', 'production', { password: 'hunter2' }, ['default'])

    vaultMock.done()
  })

  t.test('fails if channel doesnt exist', async t => {
    const vaultMock = nock('http://vault.dev:8200/')
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default"]' }))

    await t.rejects(
      client.registerCluster('lolfail', 'production', {}, ['bogus']))

    vaultMock.done()
  })

  process.env.NOCK_OFF || t.test('fails if vault has issues', async t => {
    const badClient = createInfoClient({
      vaultHost: 'http://vault.dev:8200', vaultToken: 's.bad'
    })
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: '["default"]' }))
      .get('/v1/kv/data/clusters/production/lolfail2').reply(404)
      .put('/v1/kv/data/clusters/production/lolfail2', kvPut({
        channels: [],
        environment: 'production',
        value: { password: 'hunter2' }
      })).reply(500)

    await t.rejects(badClient.registerCluster('lolfail2', 'production', { password: 'hunter2' }))
    badClient.close()
    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('updateCluster', async t => {
  const client = createClient()

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: { 'my-cluster': 'clusters/production/my-cluster' } }))
      .get('/v1/kv/data/clusters/production/my-cluster').reply(200, kvGet({
        value: { password: 'hunter2' },
        environment: 'production'
      }))
      .put('/v1/kv/data/clusters/production/my-cluster', kvPut({ value: { password: 'letmein' } })).reply({})

    await client.updateCluster('my-cluster', 'production', { password: 'letmein' })

    vaultMock.done()
  })

  t.test('noop if data is the same', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: { 'my-cluster': 'clusters/production/my-cluster' } }))
      .get('/v1/kv/data/clusters/production/my-cluster').reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production'
      }))

    await client.updateCluster('my-cluster', 'production', { password: 'letmein' })

    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: { 'my-cluster': 'clusters/production/my-cluster' } }))

    await t.rejects(client.updateCluster('nope', 'production', { asdf: 'jkl;' }))

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('unregisterCluster', async t => {
  const client = createClient()

  process.env.NOCK_OFF && t.test('setup', async t => {
    await client.registerCluster('todelete', 'production', { deleted: 'very yes' }, ['default'])
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(3).reply(200, kvGet({ value: {
        'my-cluster': 'clusters/production/my-cluster',
        'todelete': 'clusters/production/todelete'
      } }))
      .delete('/v1/kv/data/clusters/production/todelete').reply({})
      .get('/v1/kv/data/clusters/production/todelete').reply(200, kvGet({
        value: { deleted: 'very yes' },
        environment: 'production',
        channels: ['default']
      }))
      .get('/v1/kv/data/channels/default').reply(200, kvGet({ value: ['todelete', 'my-cluster'] }))
      .put('/v1/kv/data/channels/default', kvPut({ value: ['my-cluster'] })).reply(200)

    await client.unregisterCluster('todelete')

    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {
        'my-cluster': 'clusters/production/my-cluster',
        'todelete': 'clusters/production/todelete'
      } }))

    await t.rejects(client.unregisterCluster('nope'), Error, `cluster 'nope' does not exist`)
    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    nock.cleanAll()
  })
})

tap.test('listClusters', async t => {
  const client = createClient()

  process.env.NOCK_OFF && t.test('setup', async t => {
    await client.registerCluster('my-cluster4', { foo: 1 }, {}, ['default'])
    await client.registerCluster('my-cluster3', { foo: 1 }, {}, ['default'])
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {
        'my-cluster': 'clusters/production/my-cluster',
        'my-cluster2': 'clusters/production/my-cluster2',
        'my-cluster3': 'clusters/production/my-cluster3',
        'my-cluster4': 'clusters/production/my-cluster4'
      } }))

    const clusters = await client.listClusters()
    t.same(clusters, ['my-cluster', 'my-cluster2', 'my-cluster3', 'my-cluster4'])

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    nock.cleanAll()
  })
})

tap.test('getCluster', async t => {
  const client = createClient()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster': 'clusters/production/my-cluster'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster').reply(200, kvGet({
        environment: 'production',
        channels: ['default'],
        value: { password: 'letmein' }
      }))

    const cluster = await client.getCluster('my-cluster')
    t.same(cluster, {
      channels: ['default'],
      environment: 'production',
      value: { password: 'letmein' }
    })

    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {
        'my-cluster': 'clusters/production/my-cluster'
      } }))

    await t.rejects(client.getCluster('bogus'))
    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    nock.cleanAll()
  })
})

tap.test('addClusterToChannel', async t => {
  const client = createClient()

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster3': 'clusters/production/my-cluster3'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster3').times(2).reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production',
        channels: ['default']
      }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default', 'production'] }))
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: [] }))
      .put('/v1/kv/data/channels/production', kvPut({ value: ['my-cluster3'] })).reply(200)
      .put('/v1/kv/data/clusters/production/my-cluster3', kvPut({ channels: ['default', 'production'] })).reply(200)

    await client.addClusterToChannel('my-cluster3', 'production')

    vaultMock.done()
  })

  t.test('works with no channels', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster2': 'clusters/production/my-cluster2'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster2').times(2).reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production',
        channels: []
      }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default', 'production'] }))
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: [] }))
      .put('/v1/kv/data/channels/production', kvPut({ value: ['my-cluster2'] })).reply(200)
      .put('/v1/kv/data/clusters/production/my-cluster2', kvPut({ channels: ['production'] })).reply(200)

    await client.addClusterToChannel('my-cluster2', 'production')

    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {
        'my-cluster3': 'clusters/production/my-cluster3'
      } }))
    await t.rejects(client.addClusterToChannel('bogus', 'production'))
    vaultMock.done()
  })

  t.test('fails if channel does not exist', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').reply(200, kvGet({ value: {
        'my-cluster3': 'clusters/production/my-cluster3'
      } }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default'] }))
    await t.rejects(client.addClusterToChannel('my-cluster', 'bogus'))
    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    nock.cleanAll()
  })
})

tap.test('removeClusterFromChannel', async t => {
  const client = createClient()

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster3': 'clusters/production/my-cluster3'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster3').times(2).reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production',
        channels: ['default', 'production']
      }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default', 'production'] }))
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: ['my-cluster3'] }))
      .put('/v1/kv/data/channels/production', kvPut({ value: [] })).reply(200)
      .put('/v1/kv/data/clusters/production/my-cluster3', kvPut({ channels: ['default'] })).reply(200)

    await client.removeClusterFromChannel('my-cluster3', 'production')

    vaultMock.done()
  })

  t.test('works with one channel', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster2': 'clusters/production/my-cluster2'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster2').times(2).reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production',
        channels: ['production']
      }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default', 'production'] }))
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: ['my-cluster2'] }))
      .put('/v1/kv/data/channels/production', kvPut({ value: [] })).reply(200)
      .put('/v1/kv/data/clusters/production/my-cluster2', kvPut({ channels: [] })).reply(200)

    await client.removeClusterFromChannel('my-cluster2', 'production')

    vaultMock.done()
  })

  t.test('works with no channel', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: {
        'my-cluster2': 'clusters/production/my-cluster2'
      } }))
      .get('/v1/kv/data/clusters/production/my-cluster2').times(2).reply(200, kvGet({
        value: { password: 'letmein' },
        environment: 'production',
        channels: []
      }))
      .get('/v1/kv/data/channels/all').reply(200, kvGet({ value: ['default', 'production'] }))
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: [] }))

    await client.removeClusterFromChannel('my-cluster2', 'production')

    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    await t.rejects(client.removeClusterFromChannel('bogus', 'production'))
  })

  t.test('fails if channel does not exist', async t => {
    await t.rejects(client.removeClusterFromChannel('my-cluster', 'bogus'))
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('listClustersByChannel', async t => {
  const client = createClient()

  process.env.NOCK_OFF && t.test('setup', async t => {
    await client.addClusterToChannel('my-cluster', 'production')
    await client.addClusterToChannel('my-cluster2', 'production')
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/channels/production').reply(200, kvGet({ value: ['my-cluster', 'my-cluster2'] }))

    const results = await client.listClustersByChannel('production')

    t.same(results, ['my-cluster', 'my-cluster2'])

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    nock.cleanAll()
  })
})

const SA_1 = {
  'type': 'service_account',
  'project_id': 'my-project',
  'private_key_id': 'cccaedf234c3a4de25fce3adf245cfae352d4',
  'private_key': '-----BEGIN PRIVATE KEY-----\ndeadb33f\n-----END PRIVATE KEY-----\n',
  'client_email': 'my-sa1@my-project.iam.gserviceaccount.com',
  'client_id': '22349780582375098234759',
  'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
  'token_uri': 'https://oauth2.googleapis.com/token',
  'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs',
  'client_x509_cert_url': 'https://www.googleapis.com/robot/v1/metadata/x509/my-sa1%40my-project.iam.gserviceaccount.com'
}
const SA_2 = {
  'type': 'service_account',
  'project_id': 'my-project',
  'private_key_id': 'cade3f45543cef5ac34ef453caef',
  'private_key': '-----BEGIN PRIVATE KEY-----\ndeade2b33f\n-----END PRIVATE KEY-----\n',
  'client_email': 'my-sa2@my-project.iam.gserviceaccount.com',
  'client_id': '293465902347580',
  'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
  'token_uri': 'https://oauth2.googleapis.com/token',
  'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs',
  'client_x509_cert_url': 'https://www.googleapis.com/robot/v1/metadata/x509/my-sa2%40my-project.iam.gserviceaccount.com'
}
const BAD_SA = {
  'type': 'service_account',
  'project_id': 'my-project',
  'private_key_id': 'cade3f45543cef5ac34ef453caef',
  'private_key': '-----BEGIN PRIVATE KEY-----\ndeade2b33f\n-----END PRIVATE KEY-----\n',
  'client_id': '293465902347580',
  'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
  'token_uri': 'https://oauth2.googleapis.com/token',
  'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs',
  'client_x509_cert_url': 'https://www.googleapis.com/robot/v1/metadata/x509/my-sa2%40my-project.iam.gserviceaccount.com'
}

tap.test('addServiceAccount', async t => {
  const client = createClient()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(404)
      .put('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200)

    await client.addServiceAccount(SA_1)

    vaultMock.done()
    nock.cleanAll()
  })

  t.test('fails if missing client_email', async t => {
    t.rejects(() => client.addServiceAccount(BAD_SA))
  })

  t.test('should be idempotent', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200, kvGet({ value: JSON.stringify(SA_1, null, 2) }))

    await client.addServiceAccount(SA_1)
    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('getServiceAccount', async t => {
  const client = createClient()
  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200, kvGet({ value: JSON.stringify(SA_1, null, 2) }))

    const result = await client.getServiceAccount('my-sa1@my-project.iam.gserviceaccount.com')

    t.same(result, SA_1)

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('removeServiceAccount', async t => {
  const client = createClient()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa2@my-project.iam.gserviceaccount.com')
      .reply(404)
      .put('/v1/kv/data/credentials/google/my-sa2@my-project.iam.gserviceaccount.com')
      .reply(200)
      .delete('/v1/kv/data/credentials/google/my-sa2@my-project.iam.gserviceaccount.com')
      .reply(200)

    await client.addServiceAccount(SA_2)

    await client.removeServiceAccount('my-sa2@my-project.iam.gserviceaccount.com')

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('listServiceAccounts', async t => {
  const client = createClient()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(404)
      .put('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200)
      .get('/v1/kv/data/credentials/google/my-sa2@my-project.iam.gserviceaccount.com')
      .reply(404)
      .put('/v1/kv/data/credentials/google/my-sa2@my-project.iam.gserviceaccount.com')
      .reply(200)
      .intercept('/v1/kv/metadata/credentials/google/', 'LIST')
      .reply(200, {
        data: {
          keys: [
            'my-sa2@my-project.iam.gserviceaccount.com',
            'my-sa1@my-project.iam.gserviceaccount.com'
          ]
        }
      })

    await client.addServiceAccount(SA_1)
    await client.addServiceAccount(SA_2)

    const keys = await client.listServiceAccounts()

    t.same(keys, [
      'my-sa1@my-project.iam.gserviceaccount.com',
      'my-sa2@my-project.iam.gserviceaccount.com'
    ])

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('getCommon', async t => {
  const client = createClient()
  const commonData = { cluster: { default: true } }
  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/common/gke')
      .reply(200, {
        data: {
          data: {
            value: JSON.stringify(commonData, null, 2)
          }
        }
      })

    const result = await client.getCommon()

    t.same(result, commonData)

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})

tap.test('create client with AppRole', async t => {
  const vaultMock = nock('http://vault.dev:8200')
    .post('/v1/auth/approle/login', {
      role_id: '1234-1234-1243',
      secret_id: 'abcd-abcd-abcd'
    })
    .reply(200, {
      auth: { client_token: 's.somet0k3n' }
    })
    .get('/v1/kv/data/clusters/all').times(2).reply(200, kvGet({ value: { 'my-cluster': 'clusters/production/asdf' } }))
    .get('/v1/kv/data/clusters/production/my-cluster').reply(200, kvGet({ value: '{"password":"letmein"}' }))

  const client = createInfoClient({
    vaultHost: process.env.VAULT_HOST || 'http://vault.dev:8200',
    vaultRoleId: '1234-1234-1243',
    vaultSecretId: 'abcd-abcd-abcd'
  })
  await client.getCluster('my-cluster')
  client.close()
  vaultMock.done()
})

tap.test('prevent client re-use after close', async t => {
  const client = createClient()
  client.close()
  t.rejects(async () => client.listClusters())
})

tap.test('issueCertificate', async t => {
  const client = createClient()
  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/pki/issue/support-hub', { common_name: 'yolo.npme.io', ttl: 9000 })
      .reply(200, {
        data: {
          certificate: '-----BEGIN CERTIFICATE-----weknowwearebasicallytestingamock',
          expiration: Date.now() + 9000,
          issuing_ca: '-----BEGIN CERTIFICATE-----theresprobablybetterwaystotestthis',
          private_key: '"-----BEGIN RSA PRIVATE KEY-----thiswilldofornow',
          private_key_type: 'rsa',
          serial_number: 'ab:cd:ef:gh:ij:00:kl:mn:op:qr:st:03:uv:wx:yz'
        }
      })

    await client.issueCertificate('support-hub', 'yolo.npme.io', 9000)

    vaultMock.done()
  })

  t.test('ttl has default value of 300 when none is provided', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/pki/issue/support-hub', { common_name: 'yolo.npme.io', ttl: 300 })
      .reply(200, {
        data: {
          certificate: '-----BEGIN CERTIFICATE-----weknowwearebasicallytestingamock',
          expiration: Date.now() + 300,
          issuing_ca: '-----BEGIN CERTIFICATE-----theresprobablybetterwaystotestthis',
          private_key: '"-----BEGIN RSA PRIVATE KEY-----thiswilldofornow',
          private_key_type: 'rsa',
          serial_number: 'ab:cd:ef:gh:ij:00:kl:mn:op:qr:st:03:uv:wx:yz'
        }
      })

    await client.issueCertificate('support-hub', 'yolo.npme.io')

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
  })
})
