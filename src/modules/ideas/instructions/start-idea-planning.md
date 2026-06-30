agentCapsule|v=1|command=start-idea-planning|module=ideas|schema_only=pnpm exec wk run start-idea-planning --schema-only '{}'

# start-idea-planning

Start or resume a planner-chat session for an Ideas row. Loads canonical idea context, detects an active session, generates a compact planner-chat prompt, persists session state, and returns dashboard-ready planning data.

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

## Optional args

- `clientMutationId` — retry/idempotency key. Same key + same `ideaId` replays with `start-idea-planning-idempotent-replay`.
- `policyApproval` — required when git-canonical ideas publish is active and the idea status must transition to `planning`.
- `expectedPlanningGeneration` — optimistic concurrency token when planning generation policy requires it.

```bash
pnpm exec wk run start-idea-planning '{"ideaId":"I001","policyApproval":{"confirmed":true,"rationale":"begin planner chat for idea"}}'
```

## Result

Returns `data` with:

- `ideaId`, `status: "planning"`, `mode: "started" | "resumed"`
- `planningChatPrompt` — compact prompt for Cursor chat
- `planningChatSession` — `sessionId`, `status`, `startedAt`, `updatedAt`, `resumePrompt`
- `linkedPlanArtifact`, `activeDraftPlanArtifact`, `previousPlanArtifacts` — plan lineage from the canonical idea row

## Errors

| Code | When |
|------|------|
| `invalid-args` | Missing or malformed `ideaId` |
| `idea-not-found` | No row for the given id |
| `idempotency-key-conflict` | Reused `clientMutationId` with a different `ideaId` |
