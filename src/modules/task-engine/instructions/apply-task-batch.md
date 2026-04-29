<!--
agentCapsule|v=1|command=apply-task-batch|module=task-engine|schema_only=pnpm exec wk run apply-task-batch --schema-only '{}'
-->

# apply-task-batch

Apply multiple **`create-task`** and **`update-task`** operations in **one** SQLite transaction (single planning generation bump).

## Example

```bash
pnpm exec wk run apply-task-batch '{"expectedPlanningGeneration":123,"ops":[{"kind":"create-task","payload":{"allocateId":true,"title":"Batch A","status":"proposed"}},{"kind":"update-task","payload":{"taskId":"T001","updates":{"summary":"hi"}}}]}'
```

## Args

| Field | Required | Notes |
|-------|----------|--------|
| `ops` | yes | Non-empty array of `{ kind, payload }`. |
| `expectedPlanningGeneration` | when policy `require` | Same as other mutators. |
| `dryRun` | no | Validate and stage only; no persistence. |

### `create-task` op

`payload` matches **`create-task`** (`allocateId`, `title`, `status`, `features`, …). Batch applies mutations in order; server-allocated ids use the current virtual task set so multiple **`allocateId:true`** creates are monotonic within the batch.

### `update-task` op

`payload` has `taskId` and `updates` as in **`update-task`**. Updates run after earlier staged creates in the same batch cannot target those new ids in this v1 implementation—update only tasks that already exist before the batch starts, or chain multiple batches.

<!-- workspace-kit:generated task-engine-instruction-contract command=apply-task-batch section=args start -->
<!-- workspace-kit:generated task-engine-instruction-contract command=apply-task-batch section=args end -->
