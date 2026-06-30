<!-- GENERATED FROM .ai/playbooks/planner-chat.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: planner-chat idea to plan artifact

**Playbook id:** `planner-chat`  
**Use when:** An operator clicks **Plan this** for an Ideas row, asks to turn an idea into a plan, or resumes a planning-chat session. Guide the conversation from idea context to a persisted PlanArtifact, review, acceptance, phase proposal, and executable tasks without exposing raw CLI choreography in user-facing chat.

**Tone:** Calm product-planner collaborator. Ask one useful question at a time, name tradeoffs plainly, and keep the operator focused on decisions. User-facing text should talk about plans, scope, risks, and next steps; do not show command names, JSON payloads, policy tiers, or internal ids unless the operator asks for power-user detail.

**Does not replace:** [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md), [`PLANNER_COMMANDS.md`](../../PLANNER_COMMANDS.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md), or task-engine delivery playbooks. This playbook sequences the chat workflow and points at the canonical command instructions.

## 0) Bootstrap

1. Prefer **`start-idea-planning`** when the dashboard has not already supplied canonical context. It loads the Ideas row, detects or resumes the active session, generates the compact chat prompt, and returns `planningChatSession`, plan lineage, and dashboard-ready fields. Command contract: [`src/modules/ideas/instructions/start-idea-planning.md`](../../src/modules/ideas/instructions/start-idea-planning.md).
2. When the prompt or dashboard already includes `ideaId`, `planningChatSession.sessionId`, and plan lineage, continue from that durable state instead of starting a competing session.
3. If context is incomplete, use **`get-idea`** before asking the operator to restate data that already exists. Command contract: [`src/modules/ideas/instructions/get-idea.md`](../../src/modules/ideas/instructions/get-idea.md).
4. On resume, treat the last durable plan draft, review result, or session row as the source of truth — not chat memory.
5. Keep Ideas provenance attached through the whole workflow:
   - PlanArtifact `provenance.sourceIdeaId` is the Ideas row id.
   - PlanArtifact `provenance.source` is `"planner-chat"` for chat-originated plans.
   - PlanArtifact `provenance.previousPlanArtifacts` carries prior plan artifact refs for the same idea.
   - When a new artifact supersedes or advances the idea, update the Ideas row with `linkedPlanArtifact` and `previousPlanArtifacts` as appropriate.

## 1) Frame The Planning Session

Open with a compact recap:

```markdown
I'll turn this idea into a draft plan. I have: **{title}**.
```

If the note adds meaningful scope, add one short sentence. Then ask the first missing decision only. Typical first questions are:

1. What outcome should this plan optimize for?
2. What is explicitly out of scope?
3. Who or what system is affected first?
4. Is this a new feature, fix, migration, release task, or research spike?

Stop after each question. Do not stack a survey unless the operator asks for a fast form.

## 2) Draft PlanArtifact

1. Build a PlanArtifact v1 object that satisfies [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md). Prefer the smallest coherent plan that can become executable work.
2. **Default planning profile:** `minimal`. Set `identity.planningType` to `"minimal"` when unspecified. The agent may recommend `refactor` or `full-feature`; the operator may override before acceptance.
3. Include provenance:
   - `source: "planner-chat"` for chat-originated drafts.
   - `sourceIdeaId: "<ideaId>"` when planning from an Ideas row (required for idea-originated drafts).
   - `previousPlanArtifacts: [...]` when the idea already has prior artifact refs.
4. **WBS v1 rules:** each WBS row should include `wbsId`, `path`, `title`, approach, technical scope, acceptance criteria, testing/verification, dependencies, recommended phase/order, sizing confidence, risk notes, and enough payload to materialize one focused execution task. Size rows for one agent/coding session where possible.
5. Run **`draft-plan-artifact`** first as validate-only (`persist: false`) while the plan is still being shaped, then persist once the operator agrees the draft is worth saving. Command contract: [`src/modules/planning/instructions/draft-plan-artifact.md`](../../src/modules/planning/instructions/draft-plan-artifact.md).
6. After a persisted draft is linked as `activeDraftPlanArtifact`, call **`update-idea-planning-session`** with `status: "draft_ready"`, the `sessionId` from bootstrap, and `currentPlanRef` / `currentPlanVersion` when known. Command contract: [`src/modules/ideas/instructions/update-idea-planning-session.md`](../../src/modules/ideas/instructions/update-idea-planning-session.md).
7. **Do not** move the session to `completed` after draft persistence alone. Draft persistence means `draft_ready`, not that planning is done.
8. When persistence is enabled and the planning generation policy requires a token, use the latest `planningGeneration` from the preceding read or command response.

## 3) Review Loop

1. Run **`review-plan-artifact`** after a draft is valid or persisted. Command contract: [`src/modules/planning/instructions/review-plan-artifact.md`](../../src/modules/planning/instructions/review-plan-artifact.md).
2. Summarize review output as decisions, not diagnostic noise:
   - what is ready;
   - what needs operator choice;
   - what is risky or underspecified.
3. **Warnings do not block acceptance.** Low sizing confidence, minor test gaps, optional polish gaps, and visible-but-nonblocking risks are warnings — surface them plainly, but do not treat them as approval blockers.
4. Map review outcomes to session state via **`update-idea-planning-session`**:
   - **Blockers or unresolved critical questions** → `status: "needs_revision"`. Keep the Ideas row in `planning`, preserve the session row, and ask the next specific repair question.
   - **Review passed or warning-only** → `status: "approval_ready"`. Ask whether to accept now or revise first; warnings alone are not a reason to stay in `needs_revision`.
5. If review rejects the artifact, do not call **`accept-plan-artifact`** until blockers are resolved.

## 4) Accept (Separate From Finalize)

Acceptance pins the reviewed plan. Finalization materializes tasks. Keep these steps separate.

1. When the operator explicitly approves the reviewed plan, run **`accept-plan-artifact`**. It requires a reviewed version, no blockers, resolved/deferred open questions, and allows warnings. Command contract: [`src/modules/planning/instructions/accept-plan-artifact.md`](../../src/modules/planning/instructions/accept-plan-artifact.md).
2. After acceptance succeeds, call **`update-idea-planning-session`** with `status: "completed"`. Only now is the brainstorming session complete.
3. Update the Ideas row so `linkedPlanArtifact` reflects the accepted artifact and prior refs are preserved. Command contract: [`src/modules/ideas/instructions/update-idea.md`](../../src/modules/ideas/instructions/update-idea.md).
4. Summarize what was accepted and what remains optional (warnings, polish, deferred questions).

## 5) Finalize To Phase Tasks (Separate Confirmation)

1. **`finalize-plan-to-phase`** requires an **accepted** plan. Approval and finalization are separate operator decisions. Command contract: [`src/modules/planning/instructions/finalize-plan-to-phase.md`](../../src/modules/planning/instructions/finalize-plan-to-phase.md).
2. **Dry-run first:** call with `"dryRun": true` to preview task drafts, dependency mapping, and blockers. v1 maps **one WBS row to one task draft**. Block subset finalization when selected WBS rows depend on unselected rows.
3. Show the operator a short human plan: task titles, boundaries, dependency intent, target phase, and any blockers. **Require separate explicit confirmation** before persist.
4. Persist only after confirmation with `"dryRun": false` and JSON **`policyApproval`** when required. Include `expectedPlanningGeneration` when policy is `require`.
5. Generated task metadata should carry plan/WBS provenance (`planRef`, `planningProvenance.wbsId`, `planningProvenance.sourceIdeaId`, `source: "finalize-plan-to-phase"`).
6. Default the target phase from dashboard or task-engine context when available. If multiple plausible phases exist, ask the operator to choose.
7. After tasks are created, confirm the Ideas row and plan status reflect the finalized batch.

## 6) Session State Machine

Durable session state is owned by **`start-idea-planning`** (bootstrap/resume) and **`update-idea-planning-session`** (transitions). User-facing chat should describe these states in plain language; use the command layer for writes.

| Status | Meaning | Typical next step |
| --- | --- | --- |
| `active` | Planning chat started; no saved draft yet | Continue brainstorming |
| `draft_ready` | Draft PlanArtifact exists and is linked as `activeDraftPlanArtifact` | Run review; do **not** mark `completed` |
| `needs_revision` | Review found blockers or unresolved critical questions | Repair draft and re-review |
| `approval_ready` | Review passed or is warning-only; explicit user approval still needed | Accept plan or revise first |
| `completed` | Operator approved; **`accept-plan-artifact`** pinned the accepted version | Offer finalize preview (separate confirmation) |

Allowed transitions are enforced by **`update-idea-planning-session`**. Do not skip from `draft_ready` directly to `completed`.

On resume, continue from the latest durable state and summarize only the current decision needed. Clear or close the session only after the idea has linked to an accepted artifact/tasks, been explicitly abandoned (`abandoned`), superseded (`superseded`), or returned to `open` by operator choice.

## 7) Error Recovery

1. **Schema invalid:** quote the shortest useful field path and ask for the missing decision; do not paste full AJV output into chat.
2. **Planning generation mismatch:** re-read the relevant task/dashboard/planning state, then retry once with the fresh token.
3. **Policy approval required:** explain the user-visible action and request explicit confirmation. Do not imply approval from silence.
4. **Review rejection:** keep the idea in `planning`, move the session to `needs_revision`, and turn findings into the next edit question.
5. **Task creation conflict:** preserve the accepted artifact, do not duplicate tasks, and ask whether to target another phase or revise dependencies.
6. **Unexpected CLI failure:** stop mutation attempts, summarize what is already persisted, and keep enough session state for manual recovery.

## 8) Completion

A planner-chat run is complete when:

1. the operator has an **accepted** PlanArtifact with complete WBS, or explicitly abandons the attempt;
2. the session row is `completed` only after acceptance — not after draft persistence;
3. the Ideas row reflects the current status and artifact linkage;
4. any generated execution tasks were created only after a separate finalize confirmation;
5. the chat transcript gives the operator a plain-language summary of what changed and what remains.

## Related

- Ideas commands: [`src/modules/ideas/instructions`](../../src/modules/ideas/instructions)
- PlanArtifact schema: [`PLANNER_SCHEMA.md`](../../PLANNER_SCHEMA.md)
- Planner commands: [`PLANNER_COMMANDS.md`](../../PLANNER_COMMANDS.md)
- Delivery loop for generated execution tasks: [`task-to-phase-branch.md`](./task-to-phase-branch.md)
