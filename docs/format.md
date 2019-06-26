# cluster-info format

The data that does into Vault for each cluster is a JSON document.  This JSON document is described by a schema, which is accessible at `require('@npm-wharf/cluster-info-client/schema.json')`.

It has several main fields:

```json
{
    "common": {...}
    "cluster": {...}
    "tokens": {...},
    "spec": "...",
    "serviceAccounts": {...},
    "environment": {...},
    "channels":  [...]
}
```

## `cluster`

Properties that describe the cluster at-large, usually used when provisioning the cluster initially.

## `tokens`

These are properties that are used to tokenize the Hikaru spec for a cluster.

## `common`

These are properties that are "global" -- typically things that are common to both `cluster` and `tokens`, e.g. `name`, `slug`, `url`

## `spec`

A path or URI to a McGonagall spec for this cluster.

## `serviceAccounts`

A map of property names to service account emails.  The propertyName/email pair will be used to replace service account references in `common`, `cluster`, and `tokens` with their full object representations with private keys.

## `environment`

The broad enviroment this cluster belogs to, e.g. `production`

## `channels`

A set of channel names this cluster belongs to.  Typically the environment and a maintenance window ID.
