# cluster-info-client

A JavaScript API for securely fetching information about groups of clusters.

It stores all cluster information in Vault.

It also manages grouping clusters into "channels". Channels are free-form, and a cluster can be placed into any number of channels.  Example uses for channels are deployment groups, environments, zones, or any other grouping of clusters you would want to perform concurrent operations on as a set.

This is intended for use inside fabrik8, support hub, and other cluster automation tooling.


## Usage

```js
const createClusterInfoClient = require('@npm_wharf/cluster-info-client')

const client = createClusterInfoClient({
    vaultAddress: process.env.VAULT_ADDR || 'http://localhost:8200',
    vaultToken: process.env.VAULT_TOKEN
})

const clusters = await client.listClusters()
```

## Configuration

|name|description|default value|
|---|---|---|
|vaultHost|the address, including protocol, to the vault server|`'http://localhost:8200'`|
|vaultRoleId|a Vault AppRole Role ID with read/write access to cluster data| |
|vaultSecretId|a Vault AppRole Secret ID with read/write access to cluster data| |
|vaultToken|if not using AppRole, a Vault token can be used directly| |
|vaultPrefix|prefix to the Vault data path|`'kv/'`|

## Backend

### Vault

Vault will have:

- a map of Google service account keys at `/credentials/google/${serviceAccountEmail}`
- a map of AWS IAM keys at `/credentials/amazon/${accountName}`
- common provider specific data shared amongst clusters at `/clusters/common/${provider}`
- a `/clusters/all` record whose value is a map of all `clusterSlug`s to their path in Vault, eg `mycluster: '/clusters/production/mycluster'`
- a map of clusters `/clusters/${environment}/${clusterSlug}` containing all information specific to a single cluster.  The record will have
  + A `value` key with a JSON blob of general cluster info, as defined by the schema.
  + A `channels` key with a JSON array of all channels the cluster belongs to
- a `/channels/all` record whose `value` is a comma-separated list of all channels
- a series of `/channels/${channel}` record whose `value` is a JSON array of `clusterSlug`s, that enumerates all clusters within a given channel

## API

All `client` methods are async and return Promises.

### getCluster(name)

Gets all information about a single cluster.

```js
const cluster = await client.getCluster('some-cluster')

assert.eql(cluster, {
    name: 'some-cluster',
    environment: 'production',
    props: {
        password: 'hunter2'
    },
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

### registerCluster(slug, environment, props, [channels])

Registers a single cluster in the system.  `props` go in vault.  You can also optionally list the channels the cluster should be in.  An error will be thrown if any of the channels do not exist.

```js
await client.addCluster('some-cluster', 'staging', {password: 'hunter2'}, ['production'])
```

### updateCluster(slug, newEnvironment, newProps)

Modify an existing cluster, replacing the existing `environment` and/or `props` with new sets. It is best to `getCluster` beforehand.

```js
await client.updateCluster('some-cluster', 'dev', {password: 'hunter3'})
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

Store a Service Account private key.  Must be in JSON format.

```js
const key = {
  'type': 'service_account',
  'project_id': 'my-project',
  'private_key_id': 'cccaedf234c3a4de25fce3adf245cfae352d4',
  'private_key': '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
  'client_email': 'my-sa1@my-project.iam.gserviceaccount.com',
  'client_id': '22349780582375098234759',
  'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
  'token_uri': 'https://oauth2.googleapis.com/token',
  'auth_provider_x509_cert_url': 'https://www.googleapis.com/oauth2/v1/certs',
  'client_x509_cert_url': 'https://www.googleapis.com/robot/v1/metadata/x509/my-sa1%40my-project.iam.gserviceaccount.com'
}
await addServiceAccount(key)
```

### getServiceAccount(serviceAccountAddress)

Fetch a Service Account private  key, given a `client_email`

```js
const key = await getServiceAccount('my-sa1@my-project.iam.gserviceaccount.com')
```

### removeServiceAccount(serviceAccountAddress)

Delete a Service Account private  key, given a `client_email`

```js
await removeServiceAccount('my-sa1@my-project.iam.gserviceaccount.com')
```

### listServiceAccounts()

List the addresses of all stored Service Account keys.

```js
const list = await listServiceAccounts()

assert.eql(list, [
    'my-sa1@my-project.iam.gserviceaccount.com',
    'my-sa2@my-project.iam.gserviceaccount.com',
    ...
])
```

### getCommon(provider)

Get common defaults/values for all clusters for a given provider.  (Default: `'GKE'`)

```js
const data = await getCommon(provider)

assert.eql(data, {
  authAccount: 'resource-manager@iam.googleapis.com',
  billingAccount: 123412341234,
  organizationId: 678967896789,
  clusterDefaults: {
    //...
  }
  //...
})
```

### issueCertificate(role, domain, ttl = 5 * 60)

Issue a child certificate using Vault's PKI engine.

```js
const resp = await issueCertificate('support-hub', 'my-cluster.npme.io')

assert.eql(resp, {
  certificate: '---- {PEM string}...',
  expiration: 1559166104,
  issuing_ca: '---- {PEM string}...',
  private_key: '---- {key string}...',
  private_key_type: 'rsa',
  serial_number: '52:be:c0:65:33:fa:6e:aa:02:60:10:be:c5:f7:f6:f4:a1:2c:3c:dc'
})
```
### close()

Closes the client and any associated connections to backends.
