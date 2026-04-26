# cae-list-acks

List persisted **CAE acknowledgement satisfaction** rows from kit planning SQLite.

## Usage

```
workspace-kit run cae-list-acks '{"schemaVersion":1}'
workspace-kit run cae-list-acks '{"schemaVersion":1,"traceId":"cae.trace.example"}'
workspace-kit run cae-list-acks '{"schemaVersion":1,"activationId":"cae.activation.policy.phase70-playbook","limit":25}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | no | Filter to one persisted trace. |
| `activationId` | string | no | Filter to one activation. |
| `limit` | number | no | Max rows, 1-200. Defaults to 50. |

## Returns

`cae-list-acks-ok`; **`data.rows[]`** includes `traceId`, `activationId`, `ackToken`, `satisfiedAt`, and `actor`.
