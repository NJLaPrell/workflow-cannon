/**
 * Composer seed text for maintainer playbooks (Cursor `deeplink.prompt.prefill` path).
 * Avoid exfil-ish patterns that Cursor's deeplink validator rejects.
 */

import { buildWishlistIntakeAgentPrompt } from "./wishlist-chat-prompt.js";

/** Same text the operator would type for slash **`/generate-features`** (dashboard button prefills this in a new chat). */
export const GENERATE_FEATURES_SLASH_TEXT = "/generate-features";

/**
 * Operator banner + {@link buildWishlistIntakeAgentPrompt} (dashboard **Generate Features** uses {@link GENERATE_FEATURES_SLASH_TEXT} only).
 */
export function buildGenerateFeaturesPrompt(options?: { wishlistId?: string }): string {
  return (
    "The operator ran **Generate Features** (Cursor slash **`/generate-features`**).\n\n" +
    buildWishlistIntakeAgentPrompt(options)
  );
}

export function buildTranscriptChurnResearchPrompt(options?: { taskId?: string }): string {
  const id = options?.taskId?.trim();
  const focus =
    id && id.length > 0
      ? `Focus on transcript churn **${id}**: run \`pnpm exec wk run get-task '{"taskId":"${id}"}'\` and read evidence metadata before synthesizing.\n\n`
      : `List rows with \`pnpm exec wk run list-tasks '{"status":"research","type":"transcript_churn"}'\` and work them one at a time.\n\n`;

  return (
    "Run **Transcript churn research** for this workspace from the Workflow Cannon dashboard.\n\n" +
    focus +
    "Attach **`.ai/playbooks/transcript-churn-research.md`** (playbook id **`transcript-churn-research`**).\n\n" +
    "After investigation, promote with **`pnpm exec wk run synthesize-transcript-churn`** per **`.ai/AGENT-CLI-MAP.md`** (JSON **`policyApproval`** and **`expectedPlanningGeneration`** when policy **`require`**). " +
    "To abandon: **`run-transition`** **`reject`** from **`research`** → **`cancelled`**.\n\n" +
    "Do not hand-edit kit-owned stores for type/status promotion."
  );
}

export function buildImprovementTriagePrompt(options?: { taskId?: string }): string {
  const id = options?.taskId?.trim();
  const focus =
    id && id.length > 0
      ? `Focus on proposed improvement **${id}**: run \`workspace-kit run get-task '{"taskId":"${id}"}'\` first.\n\n`
      : "List proposed improvements with `workspace-kit run list-tasks '{\"status\":\"proposed\",\"type\":\"improvement\"}'` and pick at most three per the playbook rubric.\n\n";

  return (
    "Run **Improvement triage (top three)** for this workspace from the dashboard proposed-improvements flow.\n\n" +
    focus +
    "Attach **`docs/maintainers/playbooks/improvement-triage-top-three.md`** (playbook id **`improvement-triage-top-three`**).\n\n" +
    "Use **`docs/maintainers/AGENT-CLI-MAP.md`** for **`run-transition`** **`accept`** with JSON **`policyApproval`** when promoting tasks.\n\n" +
    "Do not hand-edit kit-owned stores for lifecycle transitions."
  );
}

export function buildTaskToPhaseBranchPrompt(options?: { taskId?: string; kitPhase?: string }): string {
  const id = options?.taskId?.trim();
  const kitPhase = options?.kitPhase?.trim();
  const phaseLead =
    kitPhase && kitPhase.length > 0
      ? `The operator clicked **Deliver** on the dashboard; maintainer snapshot **current_kit_phase** is **${kitPhase}**. Treat **\`release/phase-${kitPhase}\`** as the phase integration branch for PR bases (or the equivalent name your playbook uses).\n\n`
      : "The operator clicked **Deliver** on the dashboard. Resolve **current_kit_phase** from **\`dashboard-summary\`** / maintainer status, then use the matching **\`release/phase-<N>\`** branch.\n\n";

  const taskFocus =
    id && id.length > 0
      ? `Deliver execution task **${id}** into that phase branch using the maintainer delivery loop (PR base = phase branch, not the repo default branch / **main** line).\n\n`
      : "Pick one **`workspace-kit`** execution task from **`ready`** that belongs to this phase (or ask which **T###** to drive).\n\n";

  const body = phaseLead + taskFocus;

  return (
    "Follow **`.ai/playbooks/task-to-phase-branch.md`** (playbook id **`task-to-phase-branch`**).\n\n" +
    body +
    "Phase branch → task branch → implement → validate → PR into **`release/phase-<N>`** → merge → **`workspace-kit run run-transition`** **`complete`** with **`policyApproval`** per **`.ai/POLICY-APPROVAL.md`**.\n\n" +
    "Optional: **`.cursor/rules/playbook-task-to-phase-branch.mdc`**."
  );
}

/** Dashboard policy approval inbox — review-item queue without memorizing CLI names. */
export function buildPolicyApprovalInboxPrompt(): string {
  return (
    "The operator opened **Policy approval inbox** from the Workflow Cannon dashboard.\n\n" +
    "Help them work the improvement review queue (JSON **`policyApproval`** on sensitive runs per **`.ai/POLICY-APPROVAL.md`**):\n\n" +
    "- Read queue: `pnpm exec wk run list-approval-queue '{}'`\n" +
    "- Record decision: `review-item` with `decision` **`accept`**, **`decline`**, or **`accept_edited`** (requires `editedSummary`)\n" +
    "- Audit artifacts: `.workspace-kit/policy/traces.jsonl`, `.workspace-kit/policy/session-grants.json`, `kit_approval_decisions` (SQLite)\n\n" +
    "Prefer dashboard row actions when the operator is in the sidebar; decisions remain immutable in the approvals module."
  );
}

/** Dashboard task checkpoints — snapshot and rewind without memorizing CLI names. */
export function buildTaskCheckpointsRecoveryPrompt(): string {
  return (
    "The operator opened **Task checkpoints** from the Workflow Cannon dashboard.\n\n" +
    "Help them use task-linked git checkpoints safely (JSON **`policyApproval`** on Tier B mutators per **`.ai/POLICY-APPROVAL.md`**):\n\n" +
    "- Read: `pnpm exec wk run list-checkpoints '{}'` (optional `taskId` filter)\n" +
    "- Snapshot: `create-checkpoint` with `mode` **`head`** (pointer) or **`stash`** (dirty tree)\n" +
    "- Compare: `compare-checkpoint` (read-only diff vs current HEAD)\n" +
    "- Rewind: `rewind-to-checkpoint` — **destructive** (`git reset --hard` or `git stash apply`); may require `force:true` on dirty tree; refuses vendor/node_modules paths\n\n" +
    "Prefer dashboard drawer actions in the sidebar. Warn before rewind; do not hand-edit `kit_task_checkpoints`."
  );
}

/** Dashboard subagent registry — definitions and sessions without memorizing CLI names. */
export function buildSubagentRegistryPrompt(): string {
  return (
    "The operator opened **Subagent registry** from the Workflow Cannon dashboard.\n\n" +
    "Help them manage kit subagent definitions and sessions (JSON **`policyApproval`** and **`expectedPlanningGeneration`** when required per **`.ai/POLICY-APPROVAL.md`**):\n\n" +
    "- Read: `pnpm exec wk run list-subagents '{}'`, `pnpm exec wk run list-subagent-sessions '{}'`\n" +
    "- Register role: `register-subagent` (`subagentId`, `displayName`, non-empty `allowedCommands`)\n" +
    "- Start session: `spawn-subagent` (`subagentId`, optional `executionTaskId`, `hostHint`, `promptSummary`)\n" +
    "- Log handoff: `message-subagent` (`sessionId`, `direction`, `body`)\n" +
    "- Close session: `close-subagent-session` · Retire definition: `retire-subagent`\n\n" +
    "Prefer dashboard drawer actions in the sidebar; use CLI for automation. Do not hand-edit `kit_subagent_*` tables."
  );
}

/** Dashboard team execution — supervisor/worker assignment lifecycle without memorizing CLI names. */
export function buildTeamExecutionSupervisorPrompt(): string {
  return (
    "The operator opened **Team assignments** from the Workflow Cannon dashboard.\n\n" +
    "Help them run the supervisor/worker lifecycle using kit commands (JSON **`policyApproval`** and **`expectedPlanningGeneration`** when required per **`.ai/POLICY-APPROVAL.md`**):\n\n" +
    "- Read: `pnpm exec wk run list-assignments '{}'`\n" +
    "- Register: `register-assignment` (execution task id, supervisor id, worker id)\n" +
    "- Worker handoff: `submit-assignment-handoff` (`handoff.schemaVersion` 1, non-empty `summary`)\n" +
    "- Supervisor reconcile: `reconcile-assignment` (`checkpoint.schemaVersion` 1, `mergedSummary`)\n" +
    "- Block / cancel: `block-assignment`, `cancel-assignment`\n\n" +
    "Prefer the dashboard drawer actions when the operator is in the sidebar; use CLI for automation. Do not hand-edit `kit_team_assignments`."
  );
}

/** Dashboard / command palette — discover phase journal commands through chat without memorizing CLI names. */
export function buildPhaseNotesDiscoveryPrompt(): string {
  return (
    "The operator opened **Phase notes** discovery from Workflow Cannon. Help them inspect and act on the current phase journal without requiring memorized CLI commands.\n\n" +
    "Start with read-only context:\n" +
    "- `pnpm exec wk run list-phase-notes '{}'`\n" +
    "- `pnpm exec wk run get-phase-context '{}'`\n" +
    "- `pnpm exec wk run propose-tasks-from-phase-notes '{}'`\n\n" +
    "For operator-approved actions, use the supported kit commands: `add-phase-note`, `dismiss-phase-note`, `convert-phase-note-to-task`, and `propose-tasks-from-phase-notes` with `persist:true` when appropriate.\n\n" +
    "Keep summaries secret-safe. Chat intent does not replace JSON `policyApproval` for any sensitive `workspace-kit run` command; follow `.ai/POLICY-APPROVAL.md` and pass `expectedPlanningGeneration` when the command requires it."
  );
}

/** Dashboard **Start Interview** — guided `build-plan` interview (planning module). */
export function buildPlanningInterviewPrompt(): string {
  return (
    "The operator clicked **Start Interview** on the Workflow Cannon dashboard — run the **planning module interview**.\n\n" +
    "Follow **`.ai/runbooks/planning-workflow.md`**.\n\n" +
    "1. Run **`pnpm exec wk run list-planning-types '{}'`** and choose a **`planningType`** (or use the type the user names).\n" +
    "2. Iterate **`pnpm exec wk run build-plan`** with **`answers`** from **`data.nextQuestions`** until you can **`finalize`**.\n" +
    "3. When **`tasks.planningGenerationPolicy`** is **`require`**, pass **`expectedPlanningGeneration`** from your latest read (`dashboard-summary`, **`get-next-actions`**, or prior **`build-plan`** response).\n" +
    "4. When the user wants a persisted handoff, use **`finalize:true`** and **`createWishlist:true`** per the runbook so **`list-wishlist`** shows the new row.\n\n" +
    "Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for gated mutators — chat-only approval does not replace JSON **`policyApproval`** where required."
  );
}

/** Dashboard planning session resume — fresh Agent chat gets the exact saved resume command plus guardrails. */
export function buildPlanningInterviewResumePrompt(resumeCli: string): string {
  const cli = resumeCli.trim();
  return (
    "Resume the in-progress **Workflow Cannon Planning Interview**.\n\n" +
    "Run this saved resume command from the workspace root, then continue asking/answering the next planning questions until the interview is ready to finalize:\n\n" +
    "```bash\n" +
    cli +
    "\n```\n\n" +
    "Use **`.ai/runbooks/planning-workflow.md`**, **`.ai/AGENT-CLI-MAP.md`**, and **`.ai/POLICY-APPROVAL.md`**. If a mutating follow-up is required, chat intent still does not replace JSON **`policyApproval`**."
  );
}

/** Dashboard / README — collaboration profiles hub (chat + CLI); advisory-only. */
export function buildCollaborationProfilesHubPrompt(): string {
  return (
    "The operator opened **Collaboration profiles** from the Workflow Cannon dashboard.\n\n" +
    "**User chat entrypoints:** **`/onboarding`** and **`/behavior-interview`** tune advisory tone/depth only; they do **not** replace JSON **`policyApproval`** on Tier A/B **`wk run`**.\n\n" +
    "**CLI discovery (read-mostly):**\n" +
    "- `pnpm exec wk run resolve-behavior-profile '{}'`\n" +
    "- `pnpm exec wk run list-behavior-profiles '{}'`\n" +
    "- `pnpm exec wk run resolve-agent-guidance '{}'`\n" +
    "- `pnpm exec wk run sync-effective-behavior-cursor-rule '{}'` — refresh the generated **`.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`** after role/profile changes.\n\n" +
    "Canon: **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**, and the behavior playbooks under **`.ai/playbooks/`**."
  );
}
