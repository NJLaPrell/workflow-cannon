/**
 * Composer seed text for maintainer playbooks (Cursor `deeplink.prompt.prefill` path).
 * Avoid exfil-ish patterns that Cursor's deeplink validator rejects.
 */

import { buildWishlistIntakeAgentPrompt } from "./wishlist-chat-prompt.js";

/** Same playbook as wishlist intake → execution; seeded from `/generate-features` or the dashboard Generate Features control. */
export function buildGenerateFeaturesPrompt(options?: { wishlistId?: string }): string {
  return (
    "The operator ran **Generate Features** (Cursor slash **`/generate-features`**).\n\n" +
    buildWishlistIntakeAgentPrompt(options)
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

export function buildTaskToPhaseBranchPrompt(options?: { taskId?: string }): string {
  const id = options?.taskId?.trim();
  const focus =
    id && id.length > 0
      ? `Deliver execution task **${id}** into **\`release/phase-<N>\`** using the maintainer delivery loop (PR base = phase branch, not the main line).\n\n`
      : "Pick one **`workspace-kit`** execution task from **`ready`** (or clarify scope first).\n\n";

  return (
    "Follow **`docs/maintainers/playbooks/task-to-phase-branch.md`** (playbook id **`task-to-phase-branch`**).\n\n" +
    focus +
    "Phase branch → task branch → implement → validate → PR into **`release/phase-<N>`** → merge → **`workspace-kit run run-transition`** **`complete`** with **`policyApproval`** per **`docs/maintainers/POLICY-APPROVAL.md`**.\n\n" +
    "Optional: **`.cursor/rules/playbook-task-to-phase-branch.mdc`**."
  );
}
