agentCapsule|v=1|command=update-idea-planning-session|module=ideas|schema_only=pnpm exec wk run update-idea-planning-session --schema-only '{}'

# update-idea-planning-session

Update durable planning session state for an idea. Owns session transitions through the approved state machine and returns dashboard-ready session data.

Session `currentPlanRef` / `currentPlanVersion` refer to the **unified IdeaPlan document** (`plan-artifact:<planId>`) and its monotonic version — not a separate standalone artifact file. Per-state agent contracts live under [`schemas/ideas/states/`](../../../schemas/ideas/states/); planning-state behavior: [`schemas/ideas/states/planning.schema.json`](../../../schemas/ideas/states/planning.schema.json).

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.
- `sessionId` — session id from `start-idea-planning` (`data.planningChatSession.sessionId`).
- `status` — one of `draft_ready`, `needs_revision`, `approval_ready`, `completed`, `abandoned`, or `superseded`.

## Optional args

- `currentPlanRef` — unified IdeaPlan `planRef` (e.g. `plan-artifact:<planId>`) for the active draft or reviewed plan.
- `currentPlanVersion` — positive integer document version.
- `summary` — short operator-facing session summary.
- `clientMutationId` — idempotency key for repeated updates.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args. When `tasks.planningGenerationPolicy` is `require`, include `expectedPlanningGeneration` from a prior read.

```bash
pnpm exec wk run update-idea-planning-session '{"ideaId":"I001","sessionId":"pcs-...","status":"draft_ready","currentPlanRef":"plan-artifact:my-plan","currentPlanVersion":1,"summary":"Draft saved","expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"move session to draft_ready"}}'
```

Returns `data.planningChatSession` with `status`, `summary`, `currentPlanRef`, `currentPlanVersion`, and timestamps suitable for dashboard rendering.
