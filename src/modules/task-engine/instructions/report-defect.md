<!--
agentCapsule|v=1|command=report-defect|module=task-engine|schema_only=pnpm exec wk run report-defect --schema-only '{}'
-->

# report-defect

Create a **`type: improvement`** task in **`proposed`** status with the required intake fields pre-filled — a thin, shell-safe wrapper over **`create-task`**.

## Usage

```
pnpm exec wk run report-defect '{"title":"CLI parse failure","summary":"wk run args mangled in zsh","evidence":"exit 2 invalid-run-args; see terminal log","policyApproval":{"confirmed":true,"rationale":"file in-loop defect"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | `string` | yes | Short defect title. |
| `summary` | `string` | yes | Problem statement (stored as `metadata.issue` and task `summary`). |
| `evidence` | `string` | yes | Supporting reasoning / citations (stored as `metadata.supportingReasoning`). |
| `severity` | `string` | no | Maps to priority: `P1`/`HIGH`/`CRITICAL` → P1; `P2`/`MEDIUM` → P2; `P3`/`LOW` → P3. |
| `features` | `string[]` | no | Feature taxonomy slugs (same as `create-task`). |
| `relatedTaskId` | `string` | no | Recorded in `metadata.relatedTaskId` when set. |
| `phaseKey` | `string` | no | Optional phase key on the new task. |
| `phase` | `string` | no | Optional human phase label. |
| `allocateId` | — | — | Always uses server-side id allocation (`allocateId: true`). |
| `clientMutationId` | `string` | no | Idempotency key (forwarded to `create-task`). |
| `expectedPlanningGeneration` | `integer` or `string` | no | When `tasks.planningGenerationPolicy` is `require`. |
| `actor` | `string` | no | Actor on mutation evidence. |
| `policyApproval` | `object` | yes (policy) | JSON approval on the run argv object. |

## Defaults

The command sets:

- `technicalScope`: `Investigate symptom`, `Reproduce`, `Propose fix`
- `acceptanceCriteria`: `Root cause documented`, `Fix landed or follow-up tasks filed`

## Returns

- **`report-defect-created`** — new improvement task in `data.task` (same shape as `create-task`).
- **`report-defect-idempotent-replay`** — same `clientMutationId` and payload as a prior create.

Validation failures from improvement intake match **`create-task`** (`invalid-task-type-requirements`, etc.).
