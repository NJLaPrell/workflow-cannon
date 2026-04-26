# cae-record-shadow-feedback

Record whether one CAE shadow observation was useful or noisy. This is feedback for registry curation and enforcement readiness; it does **not** satisfy CAE acknowledgement and does **not** replace Tier A/B `policyApproval`.

## Usage

```
workspace-kit run cae-record-shadow-feedback '{"schemaVersion":1,"traceId":"cae.trace.example","activationId":"cae.activation.policy.phase70-playbook","commandName":"get-next-actions","signal":"useful","actor":"agent@example","policyApproval":{"confirmed":true,"rationale":"record CAE shadow feedback"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | yes | Trace that produced the shadow observation. |
| `activationId` | string | yes | Activation being rated. |
| `commandName` | string | yes | `workspace-kit run` command name that produced the observation. |
| `signal` | string | yes | `useful` or `noisy`. |
| `actor` | string | yes | Operator or agent recording feedback. |
| `note` | string | no | Short operator note. |
| `policyApproval` | object | yes | Tier B JSON policy approval for feedback persistence. |

## Returns

`cae-record-shadow-feedback-ok`; **`data.feedback`** echoes the saved row and **`data.summary`** includes useful/noisy totals.
