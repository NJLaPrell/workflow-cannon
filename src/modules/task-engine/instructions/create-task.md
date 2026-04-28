# create-task

Create a task record through the Task Engine persistence path.

## Usage

```
workspace-kit run create-task '{"id":"T400","title":"My task","status":"proposed"}'
```

## Arguments

<!-- workspace-kit:generated task-engine-instruction-contract command=create-task section=args start -->
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Task id. |
| `title` | `string` | yes | Task title. |
| `status` | string (`proposed`, `ready`) | no | Initial task status. |
| `clientMutationId` | `string` | no | Retry/idempotency key. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optimistic concurrency token from a prior read response. |
| `actor` | `string` | no | Actor recorded on transition evidence or task mutation metadata. |
| `config` | `object` | no | Invocation-local config override. |
<!-- workspace-kit:generated task-engine-instruction-contract command=create-task section=args end -->

The schema permits additional task fields; common fields include `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `phaseKey`, `metadata`, `ownership`, `approach`, `summary`, `description`, `risk`, `technicalScope`, `acceptanceCriteria`, and `features` (taxonomy slugs from `feature-taxonomy.json`; unknown slugs produce advisory warnings).

Known type guardrails:

- For `type: "improvement"`, Task Engine validates non-empty `acceptanceCriteria` and `technicalScope`, plus non-empty **`metadata.issue`** (problem statement) and **`metadata.supportingReasoning`** (why this is the issue; cite evidence refs). Legacy rows whose id matches **`imp-<hex>`** may omit **`metadata.supportingReasoning`** until updated.
- Violations return stable error code `invalid-task-type-requirements`.

Idempotency behavior:

- Reusing the same `clientMutationId` with the same payload returns a replay success (`task-create-idempotent-replay`).
- Reusing the same `clientMutationId` with a different payload returns `idempotency-key-conflict`.
