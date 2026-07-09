---
name: Workflow Cannon planner chat
description: Use when an Ideas row should become a PlanArtifact draft and phased execution tasks with planning generation hygiene.
tags: workflow-cannon, ideas, planning, task-type:workspace-kit
---

# wc-planner-chat

## When to use

- An operator clicks **Plan this** on an Ideas row or asks to turn an idea into a plan.
- Resuming a planning-chat session with `ideaId`, `planningChatSession`, or plan lineage from the dashboard.
- Drafting, reviewing, accepting, or finalizing a PlanArtifact on the unified IdeaPlan document.
- You need bounded planner context via MCP read tools instead of slurping schemas or maintainer docs.

## Canon (read first)

- `.ai/playbooks/planner-chat.md` — primary checklist (bootstrap → draft → review → accept → finalize)
- `.ai/AGENT-CLI-MAP.md` — Tier B planner mutations (`start-idea-planning`, `draft-plan-artifact`, `accept-plan-artifact`, `finalize-plan-to-phase`)
- `.ai/POLICY-APPROVAL.md` — JSON `policyApproval` on Tier B `wk run` (chat approval is not enough)

**Suggested skillIds:** `wc-planner-chat`, `wc-task-author`

## MCP-first read tools (v1)

Prefer Workflow Cannon MCP when fresh. Fall back to the CLI column when MCP is unavailable, stale, or over budget. **v1 planner MCP tools are read-only** — mutations use Tier B CLI with `policyApproval` when required.

| MCP tool | Purpose | CLI fallback |
| --- | --- | --- |
| `workflow-cannon.planner-packet` | Bootstrap packet: idea, session, `agentDirective`, truncated `wbsPreview`, `recommendedNextCommand` | `pnpm exec wk run get-planner-flow-status '{"ideaId":"<idea>"}'` |
| `workflow-cannon.list-ideas` | Lightweight Ideas inventory in `sortOrder` (optional `status` filter) | `pnpm exec wk run list-ideas '{}'` |
| `workflow-cannon.get-plan-artifact` | PlanArtifact version history, lineage, bounded artifact body | `pnpm exec wk run get-plan-artifact '{"planId":"<uuid>"}'` |
| `workflow-cannon.plan-review-packet` | Rubric review packet: blockers, warnings, coverage preview (no `recordReview`) | `pnpm exec wk run review-plan-artifact '{"planId":"<uuid>","profile":"minimal"}'` |
| `workflow-cannon.finalize-preview-packet` | Finalize dry-run task draft preview (`dryRun` forced true; no persist) | `pnpm exec wk run finalize-plan-to-phase '{"planId":"<uuid>","dryRun":true}'` |

**Planner workflow pointer** (from `agent_start` / capabilities): `pnpm exec wk run get-planner-flow-status '{"ideaId":"<idea>"}'`

### MCP common mistakes

- Treating MCP planner tools as mutation paths — use `recommendedNextCommand.readyRun` + CLI `policyApproval` for Tier B writes.
- Passing `recordReview`, `dryRun:false`, or `policyApproval` through MCP — those belong on CLI only.
- Treating a prior MCP result as current state — re-invoke; results are live at call time.
- Expecting unbounded artifact bodies within MCP byte budgets — use `includeArtifact:false` or CLI for full reads when needed.

## Steps (summary)

Echo of `.ai/playbooks/planner-chat.md`. User-facing chat stays product-planner tone; use kit commands for durable writes.

### 0) Bootstrap

1. Prefer **`workflow-cannon.planner-packet`** with `ideaId` when the dashboard has not already supplied canonical context. On MCP miss: `get-planner-flow-status`.
2. When context already includes `ideaId`, `planningChatSession.sessionId`, and plan lineage, continue from durable state — do not start a competing session.
3. If inventory context is needed first, call **`workflow-cannon.list-ideas`** (optional `status`: `open` \| `planning` \| `planned`).
4. If context is still incomplete, use **`get-idea`** via CLI before asking the operator to restate existing data.
5. On resume, treat the last durable plan draft, review result, or session row as truth — not chat memory.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"explore","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 1) Frame the planning session

1. Open with a compact recap of the idea title and one scope sentence when useful.
2. Ask one missing decision at a time (outcome, out-of-scope, affected system, planning type).
3. Do not stack a survey unless the operator asks for a fast form.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 2) Draft plan content

1. Build plan-section content per `plan-artifact.v1` schema; default `identity.planningType` to `minimal`.
2. Attach provenance: `source: "planner-chat"`, `sourceIdeaId`, `previousPlanArtifacts` when applicable.
3. Run **`draft-plan-artifact`** validate-only (`persist: false`) while shaping; persist once the operator agrees.
4. After persist, read back with **`workflow-cannon.get-plan-artifact`**; call **`update-idea-planning-session`** → `draft_ready` (not `completed`).
5. Carry `expectedPlanningGeneration` from the latest read or command response on writes.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 3) Review loop

1. Run **`workflow-cannon.plan-review-packet`** after a valid or persisted draft (MCP miss: `review-plan-artifact`).
2. Summarize as decisions: what is ready, what needs operator choice, what is risky.
3. Warnings do not block acceptance — surface plainly, do not treat as blockers.
4. Map outcomes via **`update-idea-planning-session`**: blockers → `needs_revision`; pass or warning-only → `approval_ready`.
5. Do not call **`accept-plan-artifact`** while review blockers remain.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 4) Accept (separate from finalize)

1. On explicit operator approval, run **`accept-plan-artifact`** (Tier B + `policyApproval` when required).
2. After acceptance, **`update-idea-planning-session`** → `completed`.
3. Update Ideas row `linkedPlanArtifact` and preserve prior refs via **`update-idea`**.
4. Summarize what was accepted and what remains optional (warnings, deferred questions).

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 5) Finalize to phase tasks (separate confirmation)

1. Requires an **accepted** plan — approval and finalization are separate decisions.
2. Preview with **`workflow-cannon.finalize-preview-packet`** (MCP miss: `finalize-plan-to-phase` with `"dryRun": true`).
3. Show task titles, boundaries, dependency intent, target phase, and blockers; require explicit confirmation before persist.
4. Persist only after confirmation with `"dryRun": false` and JSON **`policyApproval`**; include `expectedPlanningGeneration` when policy is `require`.
5. Confirm Ideas row and plan status reflect the finalized batch.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 6) Session state machine

| Status | Meaning | Next step |
| --- | --- | --- |
| `active` | Chat started; no saved draft | Continue framing |
| `draft_ready` | Draft linked as `activeDraftPlanArtifact` | Review; do not mark `completed` |
| `needs_revision` | Review blockers or critical open questions | Repair and re-review |
| `approval_ready` | Pass or warning-only; approval still needed | Accept or revise |
| `completed` | Accepted plan pinned | Offer finalize preview (separate confirmation) |

On resume, re-read **`workflow-cannon.planner-packet`** or **`workflow-cannon.get-plan-artifact`** and summarize only the current decision.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"explore","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 7) Error recovery

1. Schema invalid — quote the shortest useful field path; ask for the missing decision.
2. Planning generation mismatch — re-read state, retry once with fresh token.
3. Policy approval required — explain the user-visible action; do not imply approval from silence.
4. Review rejection — keep idea in `planning`, session `needs_revision`, next edit question.
5. Task creation conflict — preserve accepted artifact; ask about phase or dependency revision.
6. Unexpected CLI failure — stop mutations; summarize what is persisted; preserve session for recovery.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

### 8) Completion

Done when: accepted plan on the unified IdeaPlan document (or explicit abandon); session `completed` only after acceptance; Ideas row reflects status and linkage; tasks created only after separate finalize confirmation; operator gets a plain-language summary.

**Subagent dispatch:** `pnpm exec wk run recommend-model '{"subagentType":"generalPurpose","complexity":"low","risk":"low","scopeBreadth":"low"}'` — expect `composer-2.5` (`cheap_fast`).

## Kit commands

- Discover: `pnpm exec wk run list-skills '{}'`
- Apply body: `pnpm exec wk run apply-skill '{"skillId":"wc-planner-chat"}'` (preview default)
- Attach to task: `metadata.skillIds: ["wc-planner-chat","wc-task-author"]`
- Model tier before subagent dispatch: `pnpm exec wk run recommend-model '{"subagentType":"explore","complexity":"low","risk":"low","scopeBreadth":"low"}'`

## Verify checklist

- [ ] `workflow-cannon.planner-packet` returns `recommendedNextCommand` for a known `ideaId`
- [ ] `workflow-cannon.list-ideas` lists Ideas rows (try `status: "planning"`)
- [ ] `workflow-cannon.get-plan-artifact` returns lineage for a linked `planId`
- [ ] `workflow-cannon.plan-review-packet` returns blockers/warnings without `recordReview`
- [ ] `workflow-cannon.finalize-preview-packet` returns task drafts with `dryRun` semantics only
- [ ] Each CLI fallback above matches MCP output shape for the same args

## Do not

- Hand-edit `.workspace-kit/tasks/workspace-kit.db` for lifecycle.
- Treat chat approval as `policyApproval` on `wk run`.
- Mark the planning session `completed` after draft persistence alone.
- Finalize tasks without a separate operator confirmation after accept.
- Read `docs/maintainers/` playbooks for routine planner execution — use `.ai/playbooks/planner-chat.md` and MCP/CLI instead.
