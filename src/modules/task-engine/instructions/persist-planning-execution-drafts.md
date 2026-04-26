# persist-planning-execution-drafts

Materialize multiple **proposed** execution tasks in **one** SQLite transaction. Each row in `tasks` uses the same shape as **`convert-wishlist`** `tasks[]` (see **`buildTaskFromConversionPayload`**): `id` (`T###`), `title`, `phase`, `approach`, non-empty `technicalScope`, non-empty `acceptanceCriteria`, optional `type`, `priority`, `dependsOn`, `unblocks`.

Typical flow: `build-plan` with `outputMode:"tasks"`, `finalize:true`, and `executionTaskDrafts` → response code `planning-multi-task-decomposition-preview` → this command with `tasks` copied from `data.taskOutputs` (and **`expectedPlanningGeneration`** when `tasks.planningGenerationPolicy` is `require`).

## Usage

```bash
workspace-kit run persist-planning-execution-drafts '{"tasks":[...],"expectedPlanningGeneration":<n>}'
```

Optional: `planRef`, `planningType` (merged into each task’s `metadata` / `planningProvenance`), `actor`, `clientMutationId` (per-task idempotency key `clientMutationId::<taskId>` on `create-task` mutation log). **Idempotent replay** requires the same `tasks` rows **and** the same optional `planRef` / `planningType` so payload digests match.

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `tasks` | Yes | Non-empty array of convert-wishlist-compatible task objects. |
| `expectedPlanningGeneration` | When policy is `require` | Same optimistic concurrency token as other mutators. |
| `planRef` | No | Stored on each task `metadata.planRef` when set. |
| `planningType` | No | Stored under `metadata.planningProvenance.planningType` with `source: persist-planning-execution-drafts`. |
| `clientMutationId` | No | Enables idempotent replay when all tasks were already created with the same composed keys and payload digests. |
| `actor` | No | Mutation log actor. |

## Response codes

- `planning-execution-drafts-persisted`: success; `data.createdTasks`, `data.count`.
- `planning-execution-drafts-idempotent-replay`: replay with same `clientMutationId` and matching per-task digests.
- `planning-execution-drafts-partial-idempotency`: mixed idempotency state (some tasks replayable, some not).
- `idempotency-key-conflict`: composed `clientMutationId` reused with different payload for a task id.
- `duplicate-task-id`: a task id already exists without matching idempotency replay.
- `strict-task-validation-failed` / `invalid-task-schema`: validation errors.
