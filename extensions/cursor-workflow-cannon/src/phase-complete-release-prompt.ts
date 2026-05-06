/**
 * Composer seed for phase closeout + release (operator dashboard shortcut).
 * Canonical steps: `.ai/playbooks/phase-closeout-and-release.md`.
 */

export function buildPhaseCompleteReleaseChatPrompt(phasePhrase: string): string {
  const note =
    phasePhrase.trim().length > 0
      ? `The operator added this context: **${phasePhrase.trim()}**\n\n`
      : "";
  return (
    note +
    "Follow **`.ai/playbooks/phase-closeout-and-release.md`** (playbook id **`phase-closeout-and-release`**).\n\n" +
    "Operator entrypoint: Workflow Cannon dashboard **Complete & Release** chat. " +
    "Publish/tag/npm still require explicit human authorization after **`main`** merge; without that approval, stop before publish automation (**`.ai/RELEASING.md`**, playbook §4).\n\n" +
    "Treat **`release/phase-<N>`** as the phase integration branch; validate there, merge **`release/phase-<N>`** → **`main`**, then cut the release per **`.ai/RELEASING.md`**.\n\n" +
    "**Chat expresses intent only.** Tier A/B **`workspace-kit run`** still requires JSON **`policyApproval`** on the **third** CLI argument (**`.ai/POLICY-APPROVAL.md`**, **`.ai/AGENT-CLI-MAP.md`**).\n\n" +
    "At **§7 Phase delivery summary**, paste the template with **every** token expanded — evidence rules: **`{featureMarkdownBullets}`**, **`{optionalNotesBlockOrEmpty}`** (no stale **`{feature}`** placeholders).\n\n" +
    "Optional: **`.cursor/rules/playbook-phase-closeout.mdc`**."
  );
}
