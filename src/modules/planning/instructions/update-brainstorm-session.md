agentCapsule|v=1|command=update-brainstorm-session|module=ideas|schema_only=pnpm exec wk run update-brainstorm-session --schema-only '{}'

# update-brainstorm-session

Merge partial fields into a brainstorm session at the given `sessionIndex`. Computes session scores when all 13 scoring sub-inputs are present. Recomputes `brainstorm.synthesis` after each update.

## Required args

- `planRef` — `plan-artifact:<planId>` for the unified IdeaPlan document.
- `sessionIndex` — zero-based index into `brainstorm.sessions` (from `start-brainstorm-session`).

## Optional args

- `inputs` — partial session record (scoring sub-inputs, context text fields).
- `completedAt` — ISO timestamp when this guided brainstorm session record is finished. This does **not** transition the IdeaPlan to planning.
- `notes` — free-form session notes.
- `ideaId` — when provided, must match the document `ideaId`.
- `clientMutationId` — idempotency key.

At least one of `inputs`, `completedAt`, or `notes` is required.

After the agent fills inputs, computes scores, and sets `completedAt`, stop and summarize the session for the operator. Do not call `complete-brainstorm` unless the operator explicitly says brainstorming as a whole is finished and wants to start planning.

## Policy

Policy-sensitive artifact write. Pass `policyApproval` and `expectedPlanningGeneration` when required.

```bash
pnpm exec wk run update-brainstorm-session '{"planRef":"plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60","sessionIndex":0,"inputs":{"valueImpact":8},"expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"update brainstorm session"}}'
```
