<!--
agentCapsule|v=1|command=create-task-mutation-intent|module=task-engine|schema_only=pnpm exec wk run create-task-mutation-intent --schema-only '{}'
-->

# create-task-mutation-intent

Explicitly queue a worker-branch task mutation intent for later apply on an authority branch.

## Usage

```
workspace-kit run create-task-mutation-intent '{"requestedAction":"update-task","payload":{"taskId":"T400","summary":"worker draft"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `requestedAction` | `string` | yes | Target mutating command to run when the intent is applied (for example `update-task`, `create-task`). |
| `payload` | `object` | yes | Args object passed to the requested action on apply. |
| `intentId` | `string` | no | Optional stable id; must match `^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$`. Allocated when omitted. |
| `taskId` | `string` | no | Optional task id hint stored on the intent row. |
| `createdBy` | `string` | no | Operator or agent id recorded as creator. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Planning generation captured on the intent for optimistic concurrency on apply. |

Intents persist under `<git-common-dir>/workflow-cannon/intents/<intentId>.json`.
