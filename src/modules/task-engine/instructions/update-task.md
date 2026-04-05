# update-task

Update mutable task fields without changing lifecycle state.

## Usage

```
workspace-kit run update-task '{"taskId":"T400","updates":{"title":"Updated title"}}'
```

## Arguments

- `taskId` (string, required): task to update.
- `updates` (object, required): mutable fields only (`title`, `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `phaseKey`, `metadata`, `ownership`, `approach`, `summary`, `description`, `risk`, `technicalScope`, `acceptanceCriteria`, `features`).
- `actor` (string, optional): actor identifier.
- `clientMutationId` (string, optional): idempotency key for safe retries.

Immutable fields (`id`, `createdAt`, `status`) are rejected.

Known type guardrails:

- Updates are validated against known type requirements after patch merge.
- For `type: "improvement"`, non-empty `acceptanceCriteria` and `technicalScope` are required, plus non-empty **`metadata.issue`** and **`metadata.supportingReasoning`** (except legacy **`imp-<hex>`** ids, which may omit **`metadata.supportingReasoning`** until updated). Shallow-merge **`updates.metadata`** replaces the whole metadata object—send the full merged map.
- Violations return stable error code `invalid-task-type-requirements`.

Idempotency behavior:

- Reusing the same `clientMutationId` with the same patch/result returns replay success (`task-update-idempotent-replay`).
- Reusing the same `clientMutationId` with a different payload returns `idempotency-key-conflict`.
