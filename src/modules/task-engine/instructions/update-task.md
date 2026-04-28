# update-task

Update mutable task fields without changing lifecycle state.

## Usage

```
workspace-kit run update-task '{"taskId":"T400","updates":{"title":"Updated title"}}'
```

## Arguments

<!-- workspace-kit:generated task-engine-instruction-contract command=update-task section=args start -->
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | `string` | yes | Task id. |
| `updates` | `object` | yes | Mutable task field patch. |
| `clientMutationId` | `string` | no | Retry/idempotency key. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optimistic concurrency token from a prior read response. |
| `actor` | `string` | no | Actor recorded on transition evidence or task mutation metadata. |
| `config` | `object` | no | Invocation-local config override. |
<!-- workspace-kit:generated task-engine-instruction-contract command=update-task section=args end -->

Mutable task fields include `title`, `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `phaseKey`, `metadata`, `ownership`, `approach`, `summary`, `description`, `risk`, `technicalScope`, `acceptanceCriteria`, and `features`.

Immutable fields (`id`, `createdAt`, `status`) are rejected.

Known type guardrails:

- Updates are validated against known type requirements after patch merge.
- For `type: "improvement"`, non-empty `acceptanceCriteria` and `technicalScope` are required, plus non-empty **`metadata.issue`** and **`metadata.supportingReasoning`** (except legacy **`imp-<hex>`** ids, which may omit **`metadata.supportingReasoning`** until updated). Shallow-merge **`updates.metadata`** replaces the whole metadata object—send the full merged map.
- Violations return stable error code `invalid-task-type-requirements`.

Idempotency behavior:

- Reusing the same `clientMutationId` with the same patch/result returns replay success (`task-update-idempotent-replay`).
- Reusing the same `clientMutationId` with a different payload returns `idempotency-key-conflict`.
