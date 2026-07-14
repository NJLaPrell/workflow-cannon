agentCapsule|v=1|command=create-idea|module=ideas|schema_only=pnpm exec wk run create-idea --schema-only '{}'

# create-idea

Create a lightweight operator idea row in kit SQLite (`workflow_ideas`). Ideas are not task-engine tasks; they are captured for later planner-chat and PlanArtifact workflows.

## Required args

- `title` — non-empty string.

## Optional args

- `note` — freeform detail.
- `status` — `open`, `planning`, or `planned`; defaults to `open`.
- `linkedPlanArtifact` — associated plan artifact id/ref when already known.
- `previousPlanArtifacts` — array of prior plan artifact ids/refs.
- `clientMutationId` — optional idempotency key; retries with the same key and matching title/note/status return the original idea (`idea-created-idempotent-replay`) instead of minting a duplicate.

## Policy

This command writes kit SQLite and is policy-sensitive. Pass JSON `policyApproval` in the command args.

```bash
pnpm exec wk run create-idea '{"title":"Try planner chat from Ideas","policyApproval":{"confirmed":true,"rationale":"capture operator idea"}}'
```

Returns `data.idea` shaped like `schemas/idea.schema.json` plus planning-generation metadata.