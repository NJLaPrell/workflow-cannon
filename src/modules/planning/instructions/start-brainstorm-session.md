agentCapsule|v=1|command=start-brainstorm-session|module=ideas|schema_only=pnpm exec wk run start-brainstorm-session --schema-only '{}'

# start-brainstorm-session

Start or append a brainstorm session on a unified IdeaPlan artifact. On the first call when `status` is `idea`, transitions the document to `brainstorming` and appends session index `0`. On later calls (any non-`idea` status), appends a new session slot without changing `status`.

## Required args

- `planRef` — `plan-artifact:<planId>` for the unified IdeaPlan document.

## Optional args

- `ideaId` — when provided, must match the document `ideaId` (validation guard).
- `clientMutationId` — idempotency key for repeated session starts.

## Policy

This command writes the IdeaPlan artifact file and is policy-sensitive. Pass JSON `policyApproval` in the command args. When `tasks.planningGenerationPolicy` is `require`, include `expectedPlanningGeneration` from a prior read.

```bash
pnpm exec wk run start-brainstorm-session '{"planRef":"plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60","expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"start brainstorm session"}}'
```

Returns `data.sessionIndex`, `data.session` (`sessionId`, `startedAt`, `updatedAt`), `data.transitioned` (`true` when `idea` → `brainstorming`), and the persisted document identity (`planId`, `version`, `status`). Recomputes `brainstorm.synthesis` after appending the session slot.
