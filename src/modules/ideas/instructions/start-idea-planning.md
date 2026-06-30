agentCapsule|v=1|command=start-idea-planning|module=ideas|schema_only=pnpm exec wk run start-idea-planning --schema-only '{}'

# start-idea-planning

Start or resume a durable planner-chat session for a lightweight operator idea. Loads canonical idea context, detects an active session, generates a compact planner-chat prompt, persists session state, and returns dashboard-ready planning data.

## Required args

- `ideaId` — idea id such as `I001`. `id` is accepted as an alias.

## Optional args

- `clientMutationId` — idempotency key for repeated Plan this clicks.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args. When `tasks.planningGenerationPolicy` is `require`, include `expectedPlanningGeneration` from a prior read.

```bash
pnpm exec wk run start-idea-planning '{"ideaId":"I001","expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"start idea planning session"}}'
```

Returns `data.mode` of `started` or `resumed`, `data.planningChatPrompt`, `data.planningChatSession`, and plan lineage fields (`linkedPlanArtifact`, `activeDraftPlanArtifact`, `previousPlanArtifacts`).
