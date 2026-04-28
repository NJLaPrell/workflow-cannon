# persist-planning-execution-drafts

Materialize multiple execution tasks in **one** SQLite transaction. Each row in `tasks` uses the same shape as **`convert-wishlist`** `tasks[]` (see **`buildTaskFromConversionPayload`**): `id` (`T###`), `title`, `phase`, `approach`, non-empty `technicalScope`, non-empty `acceptanceCriteria`, optional `type`, `priority`, `dependsOn`, `unblocks`, `phaseKey`, and `status` (`proposed` or `ready`).

Typical flow: `build-plan` with `outputMode:"tasks"`, `finalize:true`, and `executionTaskDrafts` → response code `planning-multi-task-decomposition-preview` → **`review-planning-execution-drafts`** for UX/CAE batches → this command with `tasks` copied from `data.taskOutputs` (and **`expectedPlanningGeneration`** when `tasks.planningGenerationPolicy` is `require`).

## Usage

```bash
workspace-kit run persist-planning-execution-drafts '{"tasks":[...],"expectedPlanningGeneration":<n>}'
```

Optional: `planRef`, `planningType` (merged into each task’s `metadata` / `planningProvenance`), `targetPhaseKey`, `targetPhase`, `desiredStatus`, `actor`, `clientMutationId` (per-task idempotency key `clientMutationId::<taskId>` on `create-task` mutation log). **Idempotent replay** requires the same task payload, phase/status options, and optional `planRef` / `planningType` so payload digests match.

For UX/CAE batches, run **`review-planning-execution-drafts`** first. It uses the same normalization shape and returns machine-readable gaps without persisting rows.

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `tasks` | Yes | Non-empty array of convert-wishlist-compatible task objects. |
| `expectedPlanningGeneration` | When policy is `require` | Same optimistic concurrency token as other mutators. |
| `planRef` | No | Stored on each task `metadata.planRef` when set. |
| `planningType` | No | Stored under `metadata.planningProvenance.planningType` with `source: persist-planning-execution-drafts`. |
| `targetPhaseKey` | No | Overrides every created task’s `phaseKey` for explicit next-phase task creation. When present, rows may omit `phase`; the command normalizes them before final validation. |
| `targetPhase` | No | Label to pair with `targetPhaseKey`; defaults to `Phase <targetPhaseKey>` when omitted. Command-level `targetPhase` wins over row-level `phase` when `targetPhaseKey` is present. |
| `desiredStatus` | No | Overrides every created task’s initial status; must be `proposed` or `ready`. Row-level `status` is accepted only when no command-level override is provided. |
| `clientMutationId` | No | Enables idempotent replay when all tasks were already created with the same composed keys and payload digests. |
| `actor` | No | Mutation log actor. |

## Phase movement boundary

Use **`set-current-phase`** only to move the workspace-level phase snapshot. It never creates task rows. Use this command when the operator explicitly asks to open or draft tasks for a target phase:

```bash
workspace-kit run persist-planning-execution-drafts '{"targetPhaseKey":"73","targetPhase":"Phase 73","desiredStatus":"ready","planRef":"planning:new-feature:phase-73","tasks":[...],"expectedPlanningGeneration":<n>,"clientMutationId":"phase-73-task-open"}'
```

Minimal row shape with command-level phase/status defaults:

```bash
workspace-kit run persist-planning-execution-drafts '{"targetPhaseKey":"73","targetPhase":"Phase 73","desiredStatus":"ready","tasks":[{"id":"T900","title":"Draft follow-up","approach":"Implement the follow-up","technicalScope":["Wire the command path"],"acceptanceCriteria":["Batch persists without row-level phase"]}],"expectedPlanningGeneration":<n>}'
```

## Response codes

- `planning-execution-drafts-persisted`: success; `data.createdTasks`, `data.count`.
- `planning-execution-drafts-idempotent-replay`: replay with same `clientMutationId` and matching per-task digests.
- `planning-execution-drafts-partial-idempotency`: mixed idempotency state (some tasks replayable, some not).
- `idempotency-key-conflict`: composed `clientMutationId` reused with different payload for a task id.
- `duplicate-task-id`: a task id already exists without matching idempotency replay.
- `strict-task-validation-failed` / `invalid-task-schema`: validation errors.
