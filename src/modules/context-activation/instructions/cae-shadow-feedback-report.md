# cae-shadow-feedback-report

Summarize CAE shadow usefulness feedback recorded by `cae-record-shadow-feedback`.

## Usage

```
workspace-kit run cae-shadow-feedback-report '{"schemaVersion":1}'
workspace-kit run cae-shadow-feedback-report '{"schemaVersion":1,"activationId":"cae.activation.policy.phase70-playbook"}'
workspace-kit run cae-shadow-feedback-report '{"schemaVersion":1,"signal":"noisy","limit":25}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `activationId` | string | no | Filter report to one activation. |
| `commandName` | string | no | Filter report to one command. |
| `signal` | string | no | `useful` or `noisy`. |
| `limit` | number | no | Max rows returned, 1-200. Defaults to 50. |

## Returns

`cae-shadow-feedback-report-ok`; **`data.summary`** includes useful/noisy totals and per-activation counts. **`data.rows[]`** returns recent matching feedback rows for evidence review.
