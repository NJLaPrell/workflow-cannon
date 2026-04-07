/**
 * Composer seed text for maintainer playbooks (Cursor `deeplink.prompt.prefill` path).
 * Avoid exfil-ish patterns that Cursor's deeplink validator rejects.
 */

import { buildWishlistIntakeAgentPrompt } from "./wishlist-chat-prompt.js";

/** Same text the operator would type for slash **`/generate-features`** (dashboard button prefills this in a new chat). */
export const GENERATE_FEATURES_SLASH_TEXT = "/generate-features";

/** Same text the operator would type for slash **`/research-churn`** (dashboard / command palette can prefill the full playbook prompt instead). */
export const RESEARCH_CHURN_SLASH_TEXT = "/research-churn";

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
    "Run **Transcript churn research** for this workspace (Workflow Cannon dashboard, command palette, or Cursor slash **`" +
    RESEARCH_CHURN_SLASH_TEXT +
    "`**).\n\n" +
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
    "Run **Improvement triage (top three)** for this workspace (Cursor slash **`/process-proposed-improvements`** when invoked that way).\n\n" +
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
    "Follow **`docs/maintainers/playbooks/task-to-phase-branch.md`** (playbook id **`task-to-phase-branch`**).\n\n" +
    body +
    "Phase branch → task branch → implement → validate → PR into **`release/phase-<N>`** → merge → **`workspace-kit run run-transition`** **`complete`** with **`policyApproval`** per **`docs/maintainers/POLICY-APPROVAL.md`**.\n\n" +
    "Optional: **`.cursor/rules/playbook-task-to-phase-branch.mdc`**."
  );
}

/** Dashboard **New Plan** — guided `build-plan` interview (planning module). */
export function buildPlanningInterviewPrompt(): string {
  return (
    "The operator clicked **New Plan** on the Workflow Cannon dashboard — run the **planning module interview**.\n\n" +
    "Follow **`.ai/runbooks/planning-workflow.md`**.\n\n" +
    "1. Run **`pnpm run wk run list-planning-types '{}'`** and choose a **`planningType`** (or use the type the user names).\n" +
    "2. Iterate **`pnpm run wk run build-plan`** with **`answers`** from **`data.nextQuestions`** until you can **`finalize`**.\n" +
    "3. When **`tasks.planningGenerationPolicy`** is **`require`**, pass **`expectedPlanningGeneration`** from your latest read (`dashboard-summary`, **`get-next-actions`**, or prior **`build-plan`** response).\n" +
    "4. When the user wants a persisted handoff, use **`finalize:true`** and **`createWishlist:true`** per the runbook.\n\n" +
    "Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for gated mutators — chat-only approval does not replace JSON **`policyApproval`** where required."
  );
}
