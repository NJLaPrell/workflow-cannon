<!--
agentCapsule|v=1|command=clear-task-phase|module=task-engine|schema_only=pnpm exec wk run clear-task-phase --schema-only '{}'
-->

# clear-task-phase

Removes **`phase`** and **`phaseKey`** from a task (fields omitted on the persisted record).

## Usage

```
workspace-kit run clear-task-phase '<json>'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `taskId` | Yes | Task id. |
| `clientMutationId` | No | Idempotency key. |
| `actor` | No | Optional actor override. |

## Example

```bash
workspace-kit run clear-task-phase '{"taskId":"T900"}'
```

## See also

- **`assign-task-phase`** — set phase bucket fields
