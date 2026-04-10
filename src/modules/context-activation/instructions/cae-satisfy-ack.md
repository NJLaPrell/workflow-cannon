# cae-satisfy-ack

Insert a **CAE acknowledgement satisfaction** row into kit planning SQLite (**`cae_ack_satisfaction`**). Requires effective **`kit.cae.persistence`** **`true`** and a writable planning DB (post v11 migration).

Before writing SQLite, the handler **reloads the CAE registry** via **`loadCaeRegistry`** (fail-closed on loader errors), checks **`activationId`** exists, requires a registry **`acknowledgement.token`**, verifies **`ackToken`** matches it, and requires a **persisted** row in **`cae_trace_snapshots`** for **`traceId`**.

**Tier A** — JSON **`policyApproval`** on the `wk run` path (see **`.ai/POLICY-APPROVAL.md`**). Registry / activation **bodies** remain **git + PR** only — see **`.ai/cae/mutation-governance.md`**.

## Usage

```
workspace-kit run cae-satisfy-ack '{"schemaVersion":1,"traceId":"<id>","ackToken":"<token>","activationId":"<id>","actor":"<who>","policyApproval":{"confirmed":true,"rationale":"record ack"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | **1**. |
| `traceId` | string | yes | Trace id from evaluation / preflight. |
| `ackToken` | string | yes | Token from activation **`acknowledgement`** (registry). |
| `activationId` | string | yes | Activation id that issued the acknowledgement. |
| `actor` | string | yes | Operator / agent id string for audit. |
| `policyApproval` | object | yes | Tier A approval payload. |

## Returns

`cae-satisfy-ack-ok` with echoed ids. Other stable codes include **`cae-persistence-disabled`**, **`cae-registry-read-error`** / **`cae-registry-invalid-json`** / schema codes from the loader, **`cae-activation-not-found`**, **`cae-ack-not-applicable`**, **`cae-ack-token-mismatch`**, **`cae-trace-not-found`**, **`cae-kit-sqlite-unavailable`**, **`invalid-args`**.
