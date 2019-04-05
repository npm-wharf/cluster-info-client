const tap = require('tap')
const nock = require('nock')
const Redis = require('ioredis')
const createInfoClient = require('../')

const createClient = () => createInfoClient({
  vaultHost: 'http://vault.dev:8200',
  vaultToken: 's.deadb33f'
})

tap.test('check redis', async t => {
  const redis = new Redis({ maxRetriesPerRequest: 0 })
  try {
    await redis.keys('*')
  } catch (e) {
    throw new Error('redis-server must be running locally')
  } finally {
    redis.disconnect()
  }
})

tap.test('empty redis', async t => {
  const redis = new Redis()
  await redis.del('channels')
  const clusters = await redis.keys('cluster:*')
  await Promise.all(clusters.map(cl => redis.del(cl)))
  const channels = await redis.keys('channels:*')
  await Promise.all(channels.map(chan => redis.del(chan)))

  redis.disconnect()
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
  const redis = new Redis()

  t.test('createChannel', async t => {
    await client.createChannel('default')
    t.same(await redis.smembers('channels'), ['default'])

    await client.createChannel('other')
    t.same((await redis.smembers('channels')).sort(), ['default', 'other'])

    await client.createChannel('default')
    t.same((await redis.smembers('channels')).sort(), ['default', 'other'])
  })

  t.test('listChannels', async t => {
    await client.createChannel('production')
    const channels = await client.listChannels()
    t.same(channels, ['default', 'other', 'production'])
  })

  t.test('deleteChannel', async t => {
    await client.deleteChannel('other')
    t.same(await client.listChannels(), ['default', 'production'])
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('registerCluster', async t => {
  const client = createClient()
  const redis = new Redis()
  const badClient = createInfoClient({
    vaultHost: 'http://vault.dev:8200', vaultToken: 's.bad'
  })

  t.test('setup', async t => {
    await client.createChannel('default')
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/kv/data/clusters/production/my-cluster', {
        data: { value: '{"password":"hunter2"}' }
      })
      .reply(200)
    await client.registerCluster('my-cluster', { foo: 'bar' }, { password: 'hunter2' }, ['default'])

    const hash = await redis.hgetall('cluster:my-cluster')
    t.same(hash, { foo: 'bar', channels: 'default' })
    const channels = await redis.smembers('channels:default')
    t.same(channels, ['my-cluster'])
    vaultMock.done()
  })

  t.test('works with default params', async t => {
    const vaultMock = nock('http://vault.dev:8200')
    await client.registerCluster('my-cluster2', { foo: 'bar' })

    const hash = await redis.hgetall('cluster:my-cluster2')
    t.same(hash, { foo: 'bar' })
    vaultMock.done()
  })

  t.test('fails if channel doesnt exist', async t => {
    await t.rejects(client.registerCluster('lolfail', { foo: 'bar' }, {}, ['bogus']))
  })

  /* t.test('fails if vault has issues', async t => {
    const badClient = createInfoClient({
      vaultHost: 'http://vault.dev:8200', vaultToken: 's.bad'
    })
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/kv/data/clusters/production/lolfail2', {
        data: { value: '{"password":"hunter2"}' }
      })
      .reply(500)
    await t.rejects(badClient.registerCluster('lolfail2', { foo: 'bar' }, { password: 'hunter2' }))
    badClient.close()
    vaultMock.done()
  }) */

  t.test('cleanup', async () => {
    client.close()
    badClient.close()
    redis.disconnect()
  })
})

tap.test('updateCluster', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/kv/data/clusters/production/my-cluster', {
        data: { value: '{"password":"letmein"}' }
      })
      .reply({})

    await client.updateCluster('my-cluster', { baz: 1 }, { password: 'letmein' })

    const hash = await redis.hgetall('cluster:my-cluster')
    t.same(hash, { baz: 1, channels: 'default' })
    vaultMock.done()
  })

  t.test('works with defaults', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .delete('/v1/kv/data/clusters/production/my-cluster')
      .reply(200)

    await client.updateCluster('my-cluster', { baz: 1 })

    const hash = await redis.hgetall('cluster:my-cluster')
    t.same(hash, { baz: 1, channels: 'default' })
    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    await t.rejects(client.updateCluster('nope', { asdf: 'jkl;' }))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('unregisterCluster', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
    await client.registerCluster('todelete', { deleted: 'very yes' }, {}, ['default'])
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .delete('/v1/kv/data/clusters/production/todelete')
      .reply({})

    await client.unregisterCluster('todelete')

    t.equal(await redis.exists('cluster:todelete'), 0)
    t.equal(await redis.sismember('channels:default', 'todelete'), 0)
    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    await t.rejects(client.unregisterCluster('nope'))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('listClusters', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
    await client.registerCluster('my-cluster4', { foo: 1 }, {}, ['default'])
    await client.registerCluster('my-cluster3', { foo: 1 }, {}, ['default'])
  })

  t.test('works', async t => {
    const clusters = await client.listClusters()
    t.same(clusters, ['my-cluster', 'my-cluster2', 'my-cluster3', 'my-cluster4'])
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('getCluster', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster')
      .reply(200, { data: { data: { value: '{"password":"letmein"}' } } })
      .get('/v1/kv/data/clusters/production/my-cluster2')
      .reply(404)

    const cluster = await client.getCluster('my-cluster')
    t.same(cluster, {
      name: 'my-cluster',
      channels: ['default'],
      baz: 1,
      secretProps: { password: 'letmein' }
    })

    const cluster2 = await client.getCluster('my-cluster2')
    t.same(cluster2, {
      name: 'my-cluster2',
      foo: 'bar',
      secretProps: null
    })
    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    await t.rejects(client.getCluster('bogus'))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('addClusterToChannel', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster3')
      .reply(200, { data: { data: { value: '{"password":"letmein"}' } } })
    await client.addClusterToChannel('my-cluster3', 'production')

    const cluster = await client.getCluster('my-cluster3')
    t.same(cluster.channels, ['default', 'production'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster3'])
    vaultMock.done()
  })

  t.test('works with no channels', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster2')
      .reply(404)
    await client.addClusterToChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, ['production'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster2', 'my-cluster3'])
    vaultMock.done()
  })

  t.test('fails if cluster does not exist', async t => {
    await t.rejects(client.addClusterToChannel('bogus', 'production'))
  })

  t.test('fails if channel does not exist', async t => {
    await t.rejects(client.addClusterToChannel('my-cluster', 'bogus'))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('removeClusterFromChannel', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster3')
      .reply(404)
    await client.removeClusterFromChannel('my-cluster3', 'production')

    const cluster = await client.getCluster('my-cluster3')
    t.same(cluster.channels, ['default'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster2'])
    vaultMock.done()
  })

  t.test('works with one channel', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster2')
      .reply(404)
    await client.removeClusterFromChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, undefined)
    t.same((await redis.smembers('channels:production')).sort(), [])
    vaultMock.done()
  })

  t.test('works with no channel', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/clusters/production/my-cluster2')
      .reply(404)
    await client.removeClusterFromChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, undefined)
    t.same((await redis.smembers('channels:production')).sort(), [])
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
    redis.disconnect()
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
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200)

    await client.addServiceAccount(SA_1)

    vaultMock.done()
  })

  t.test('failts if missing client_email', async t => {
    t.rejects(() => client.addServiceAccount(BAD_SA))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('getServiceAccount', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .get('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200, { data: { data: { value: JSON.stringify(SA_1) } } })

    const result = await client.getServiceAccount('my-sa1@my-project.iam.gserviceaccount.com')

    t.same(result, SA_1)

    vaultMock.done()
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('removeServiceAccount', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
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
    redis.disconnect()
  })
})

tap.test('listServiceAccounts', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('setup', async t => {
  })

  t.test('works', async t => {
    const vaultMock = nock('http://vault.dev:8200')
      .put('/v1/kv/data/credentials/google/my-sa1@my-project.iam.gserviceaccount.com')
      .reply(200)
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
    redis.disconnect()
  })
})

tap.test('prevent client re-use after close', async t => {
  const client = createClient()
  client.close()
  t.rejects(async () => client.listClusters())
})
