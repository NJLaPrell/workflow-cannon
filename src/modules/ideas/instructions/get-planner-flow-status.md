agentCapsule|v=1|command=get-planner-flow-status|module=ideas|schema_only=pnpm exec wk run get-planner-flow-status --schema-only '{}'

# get-planner-flow-status

Tier C read-only orchestration surface for the planner golden path. Returns the current **golden-path stage**, **blockers**, **session/document mismatches**, and a **recommendedNextCommand** with copy-paste **readyRun** argv — no `policyApproval` required on this read path.

## Optional args

- `ideaId` — target idea such as `I001`. When omitted and Ideas rows exist, the lowest `sortOrder` idea is used. When the inventory is empty, returns first-run guidance without error.

## Policy

Read-only. Mutating commands referenced in `data.recommendedNextCommand.readyRun` include placeholder `policyApproval` / `expectedPlanningGeneration` when the target command requires them.

```bash
pnpm exec wk run get-planner-flow-status '{}'
pnpm exec wk run get-planner-flow-status '{"ideaId":"I011"}'
```

## Response

- `data.goldenPathStage` — `first_run | idea | brainstorming | planning | reviewed | accepted | delivered`
- `data.blockers[]` — `{ code, message, severity }` operator/agent blockers for the current stage
- `data.mismatches[]` — unified IdeaPlan document vs durable planning-chat session alignment warnings
- `data.recommendedNextCommand` — `{ command, rationale, readyRun: { args, argv } }`
- `data.planningGeneration` / `data.planningGenerationPolicy` — pass `expectedPlanningGeneration` into Tier B follow-on commands when policy is `require`

## Errors

| Code | When |
|------|------|
| `invalid-args` | `ideaId` is present but not shaped like `I001` |
| `idea-not-found` | `ideaId` was provided but no matching Ideas row exists |
