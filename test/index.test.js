const tap = require('tap')
const Redis = require('ioredis')
const createClient = require('../')

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

  t.test('setup', async t => {
    await client.createChannel('default')
  })

  t.test('works', async t => {
    await client.registerCluster('my-cluster', { foo: 'bar' }, { password: 'hunter2' }, ['default'])

    const hash = await redis.hgetall('cluster:my-cluster')
    t.same(hash, { foo: 'bar', channels: 'default' })
    const channels = await redis.smembers('channels:default')
    t.same(channels, ['my-cluster'])
  })

  t.test('works with default params', async t => {
    await client.registerCluster('my-cluster2', { foo: 'bar' })

    const hash = await redis.hgetall('cluster:my-cluster2')
    t.same(hash, { foo: 'bar' })
  })

  t.test('fails if channel doesnt exist', async t => {
    await t.rejects(client.registerCluster('lolfail', { foo: 'bar' }, {}, ['bogus']))
  })

  t.test('cleanup', async () => {
    client.close()
    redis.disconnect()
  })
})

tap.test('updateCluster', async t => {
  const client = createClient()
  const redis = new Redis()

  t.test('works', async t => {
    await client.updateCluster('my-cluster', { baz: 1 })

    const hash = await redis.hgetall('cluster:my-cluster')
    t.same(hash, { baz: 1, channels: 'default' })
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
    await client.unregisterCluster('todelete')

    t.equal(await redis.exists('cluster:todelete'), 0)
    t.equal(await redis.sismember('channels:default', 'todelete'), 0)
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
    const cluster = await client.getCluster('my-cluster')
    t.same(cluster, {
      name: 'my-cluster',
      channels: ['default'],
      baz: 1
    })

    const cluster2 = await client.getCluster('my-cluster2')
    t.same(cluster2, {
      name: 'my-cluster2',
      foo: 'bar'
    })
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
    await client.addClusterToChannel('my-cluster3', 'production')

    const cluster = await client.getCluster('my-cluster3')
    t.same(cluster.channels, ['default', 'production'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster3'])
  })

  t.test('works with no channels', async t => {
    await client.addClusterToChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, ['production'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster2', 'my-cluster3'])
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
    await client.removeClusterFromChannel('my-cluster3', 'production')

    const cluster = await client.getCluster('my-cluster3')
    t.same(cluster.channels, ['default'])
    t.same((await redis.smembers('channels:production')).sort(), ['my-cluster2'])
  })

  t.test('works with one channels', async t => {
    await client.removeClusterFromChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, undefined)
    t.same((await redis.smembers('channels:production')).sort(), [])
  })

  t.test('works with no channel', async t => {
    await client.removeClusterFromChannel('my-cluster2', 'production')

    const cluster = await client.getCluster('my-cluster2')
    t.same(cluster.channels, undefined)
    t.same((await redis.smembers('channels:production')).sort(), [])
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

tap.test('prevent client re-use after close', async t => {
  const client = createClient()
  client.close()
  t.throws(() => client.listClusters())
})
