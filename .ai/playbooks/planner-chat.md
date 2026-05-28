# Playbook: planner-chat idea to plan artifact

**Playbook id:** `planner-chat`  
**Use when:** An operator clicks **Plan this** for an Ideas row, asks to turn an idea into a plan, or resumes a planning-chat session. Guide the conversation from idea context to a persisted PlanArtifact, review, acceptance, phase proposal, and executable tasks without exposing raw CLI choreography in user-facing chat.

**Tone:** Calm product-planner collaborator. Ask one useful question at a time, name tradeoffs plainly, and keep the operator focused on decisions. User-facing text should talk about plans, scope, risks, and next steps; do not show command names, JSON payloads, policy tiers, or internal ids unless the operator asks for power-user detail.

**Does not replace:** [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md), [`PLANNER_COMMANDS.md`](../../PLANNER_COMMANDS.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md), or task-engine delivery playbooks. This playbook sequences the chat workflow and points at the canonical command instructions.

## 0) Bootstrap

1. Load the Ideas row from the prompt or dashboard context. Required working fields are `ideaId`, `title`, optional `note`, optional `linkedPlanArtifact`, and optional `previousPlanArtifacts`.
2. If context is incomplete, use `get-idea` before asking the operator to restate data that already exists. Command contract: [`src/modules/ideas/instructions/get-idea.md`](../../src/modules/ideas/instructions/get-idea.md).
3. If resuming, load the session row before asking new questions. Treat the last durable plan draft or review result as the source of truth, not chat memory.
4. Keep the Ideas provenance attached through the whole workflow:
   - PlanArtifact `provenance.sourceIdeaId` is the Ideas row id.
   - PlanArtifact `provenance.previousPlanArtifacts` carries prior plan artifact refs for the same idea.
   - When a new artifact supersedes or advances the idea, update the Ideas row with `linkedPlanArtifact` and `previousPlanArtifacts` as appropriate.

## 1) Frame The Planning Session

Open with a compact recap:

```markdown
I’ll turn this idea into a draft plan. I have: **{title}**.
```

If the note adds meaningful scope, add one short sentence. Then ask the first missing decision only. Typical first questions are:

1. What outcome should this plan optimize for?
2. What is explicitly out of scope?
3. Who or what system is affected first?
4. Is this a new feature, fix, migration, release task, or research spike?

Stop after each question. Do not stack a survey unless the operator asks for a fast form.

## 2) Draft PlanArtifact

1. Build a PlanArtifact v1 object that satisfies [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md). Prefer the smallest coherent plan that can become executable work.
2. Include provenance:
   - `source: "draft-plan-artifact"` unless an import command is explicitly the source.
   - `sourceIdeaId: "<ideaId>"` when planning from an Ideas row.
   - `previousPlanArtifacts: [...]` when the idea already has prior artifact refs.
3. Run `draft-plan-artifact` first as validate-only when the plan is still being shaped, then persist once the operator agrees the draft is worth saving. Command contract: [`src/modules/planning/instructions/draft-plan-artifact.md`](../../src/modules/planning/instructions/draft-plan-artifact.md).
4. If persistence is enabled and the planning generation policy requires a token, use the latest `planningGeneration` from the preceding read or command response.

## 3) Review Loop

1. Run `review-plan-artifact` after a draft is valid or persisted. Command contract: [`src/modules/planning/instructions/review-plan-artifact.md`](../../src/modules/planning/instructions/review-plan-artifact.md).
2. Summarize review output as decisions, not diagnostics noise:
   - what is ready;
   - what needs operator choice;
   - what is risky or underspecified.
3. If review rejects the artifact, keep the Ideas row in `planning`, preserve the session row, and ask the next specific repair question.
4. If review passes with warnings, ask whether to accept now or revise first.

## 4) Accept And Propose Phase Work

1. When the operator approves the reviewed plan, run `accept-plan-artifact`. Command contract: [`src/modules/planning/instructions/accept-plan-artifact.md`](../../src/modules/planning/instructions/accept-plan-artifact.md).
2. Use `finalize-plan-to-phase` to propose or create execution tasks from the accepted artifact. Command contract: [`src/modules/planning/instructions/finalize-plan-to-phase.md`](../../src/modules/planning/instructions/finalize-plan-to-phase.md).
3. Default the target phase from dashboard or task-engine context when available. If multiple plausible phases exist, ask the operator to choose.
4. Before creating tasks, show a short human plan: task titles, boundaries, dependency intent, and any blockers.
5. After tasks are created, update the Ideas row to link the accepted artifact and preserve prior artifacts. Command contract: [`src/modules/ideas/instructions/update-idea.md`](../../src/modules/ideas/instructions/update-idea.md).

## 5) Session State

1. Persist a planning-chat session when the first durable draft, question state, or review state exists. The session should be keyed by Ideas row id so the dashboard can offer **Resume**.
2. On resume, continue from the latest durable state and summarize only the current decision needed.
3. Clear or close the session only after the idea has either linked to an accepted artifact/tasks, been explicitly abandoned, or returned to `open` by operator choice.

## 6) Error Recovery

1. **Schema invalid:** quote the shortest useful field path and ask for the missing decision; do not paste full AJV output into chat.
2. **Planning generation mismatch:** re-read the relevant task/dashboard/planning state, then retry once with the fresh token.
3. **Policy approval required:** explain the user-visible action and request explicit confirmation. Do not imply approval from silence.
4. **Review rejection:** keep the idea in `planning`, keep the session resumable, and turn findings into the next edit question.
5. **Task creation conflict:** preserve the accepted artifact, do not duplicate tasks, and ask whether to target another phase or revise dependencies.
6. **Unexpected CLI failure:** stop mutation attempts, summarize what is already persisted, and keep enough session state for manual recovery.

## 7) Completion

A planner-chat run is complete when:

1. the operator has an accepted PlanArtifact or explicitly abandons the attempt;
2. the Ideas row reflects the current status and artifact linkage;
3. any generated execution tasks have intended phase, dependency, and blocker metadata;
4. the chat transcript gives the operator a plain-language summary of what changed and what remains.

## Related

- Ideas commands: [`src/modules/ideas/instructions`](../../src/modules/ideas/instructions)
- PlanArtifact schema: [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md)
- Planner commands: [`PLANNER_COMMANDS.md`](../../PLANNER_COMMANDS.md)
- Delivery loop for generated execution tasks: [`task-to-phase-branch.md`](./task-to-phase-branch.md)
