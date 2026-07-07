agentCapsule|v=1|command=complete-brainstorm|module=ideas|schema_only=pnpm exec wk run complete-brainstorm --schema-only '{}'

# complete-brainstorm

Validate the brainstorm section and transition a unified IdeaPlan document from `brainstorming` to `planning`.

## Required args

- `planRef` — `plan-artifact:<planId>` for the unified IdeaPlan document.
- `operatorConfirmedBrainstormComplete` — must be `true` after the operator explicitly says brainstorming is finished and wants to start planning. Completing an individual session with `update-brainstorm-session.completedAt` is not enough.

## Optional args

- `ideaId` — when provided, must match the document `ideaId` (validation guard).
- `planTitle` — initial `plan.title` (defaults to the linked idea title when available).
- `planSummary` — initial `plan.summary` (defaults to a synthesis-grounded placeholder).
- `planningType` — optional `plan.planningType` seed.
- `clientMutationId` — idempotency key for repeated completion attempts.

## Validation

Rejects the transition when:

- `operatorConfirmedBrainstormComplete` is not `true`
- document `status` is not `brainstorming`
- `brainstorm.sessions` is empty
- any session is missing required context fields (`contextProblem`, `contextAudience`) or scoring sub-inputs
- any session is missing computed `scores`

On success, writes `brainstorm.synthesis` (60/40 recency when multiple scored sessions exist), attaches the planning-state `agentDirective`, and initializes the `plan` section.

## Policy

This command writes the IdeaPlan artifact file and is policy-sensitive. Pass JSON `policyApproval` in the command args. When `tasks.planningGenerationPolicy` is `require`, include `expectedPlanningGeneration` from a prior read.

```bash
pnpm exec wk run complete-brainstorm '{"planRef":"plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60","operatorConfirmedBrainstormComplete":true,"expectedPlanningGeneration":31,"policyApproval":{"confirmed":true,"rationale":"operator confirmed brainstorming is finished and planning should start"}}'
```

Returns `data.status` `planning`, `data.brainstorm` (sessions + synthesis), and `data.plan` (initialized title/summary).
