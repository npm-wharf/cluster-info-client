# cluster-info-client

A JavaScript API for securely fetching information about groups of clusters.

It can store and fetch non-sensitive information in Redis, and secret information in Vault.

It also manages grouping clusters into "channels". Channels are free-form, and a cluster can be placed into any number of channels.  Example uses for channels are deployment groups, environments, zones, or any other grouping of clusters you would want to perform concurrent operations on as a set.

This is intended for use inside fabrik8, kubeform, command hub, support hub, and others.


## Usage

```js
const createClusterInfoClient = require('@npm_wharf/cluster-info-client')

const client = createClusterInfoClient({
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
    vaultAddress: process.env.VAULT_ADDR || 'http://localhost:8200',
    vaultToken: process.env.VAULT_TOKEN
})

const clusters = await client.listClusters()
```

## Configuration

|name|description|default value|
|---|---|---|
|redisUrl|the url of the redis server holding basic cluster information|`'redis://localhost:6379'`|
|vaultAddress|the address, including protocol, to the vault server|`'http://localhost:8200'`|
|vaultToken|a Vault authentication token with read/write access to cluster data| |

## Backends

### Redis

Redis will have:

- a series of `cluster:${clusterName}` hashes for arbitrary, non-sensitive cluster info
- a `channels` set of `[...channelNames]` enumerating all the channel names
- the `cluster:${clusterName}` hash has a `channels` key of all of its channels, comma separated, e.g. `[...channelNames].join()`
- a series of `channels:${channelName}` sets of `[...clusterNames]`, that enumerates all clusters within a given channel

### Vault

TBD

## API

All `client` methods are async and return Promises.

### getCluster(name)

Gets all information about a single cluster.

```js
const cluster = await client.getCluster('some-cluster')

assert.eql(cluster, {
    name: 'some-cluster',
    props: {
        key: 'arbitrary'
    },
    secretProps: {
        password: 'hunter2'
    }
    channels: ['production', 'p100']
})
```

### listClusters()

Lists the names of all registered clusters.

```js
const clusters = await client.listClusters()

assert.eql(clusters, [
    'some-cluster',
    'another-cluster'
])
```

### registerCluster(name, props, [secretProps], [channels])

Registers a single cluster in the system.  `props` go in Redis, `secretProps` go in vault.  You can also optionally list the channels the cluster should be in.  An error will be thrown if any of the channels do not exist.

```js
await client.addCluster('some-cluster', {key: 'arbitrary'}, {password: 'hunter2'}, ['production'])
```

### updateCluster(name, newProps, [newSecretProps])

Modify an existing cluster, replacing the existing `props` and `secretProps` with new sets. It is best to `getCluster` beforehand.

```js
await client.updateCluster('some-cluster', {key: 'arbitrary'}, {password: 'hunter3'})
```

### unregisterCluster(name)

Un-register a cluster with the system.  Channel associations will also be removed.

```js
await client.removeCluster('some-cluster')
```

### listChannels()

List all the registered channels.

```js
const channels = await client.listChannels()
assert.eql(channels, [
    'production',
    'staging',
    'p100',
    'p200',
    'p300'
])
```

### createChannel(channel)

Create a channel, so clusters can be added to it.

```js
await client.createChannel('integration')
```

### removeChannel(channel)

Removes a channel.  Channel must have no clusters associated with it, otherwise an error is thrown.

```js
await client.removeChannel('integration')
```

### addClusterToChannel(name, channel)

Adds a cluster to a channel.  The cluster and channel must exist, otherwise an error is thrown.

```js
await client.addClusterToChannel('some-cluster', 'production')
```

### removeClusterFromChannel(name, channel)

Removes a cluster to from a channel.

```js
await client.removeClusterFromChannel('some-cluster', 'integration')
```

### listClustersByChannel(channel)

Lists the names of all clusters within the specified cluster.

```js
const clusters = await listClustersByChannel('production')

assert.eql(clusters, [
    'some-cluster',
    'another-cluster'
])
```

### addServiceAccount(jsonServiceAccountKey)

### getServiceAccount(serviceAccountAddress)

### removeServiceAccount(serviceAccountAddress)

### listServiceAccounts()

### close()

Closes the client and any associated connections to backends.
