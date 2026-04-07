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
    "Treat **`release/phase-<N>`** as the phase integration branch; phase closeout merges that train to **`main`** and cuts a release per **`.ai/RELEASING.md`** (human depth: **`docs/maintainers/RELEASING.md`** when editing policy).\n\n" +
    "Use JSON **`policyApproval`** on policy-sensitive **`workspace-kit run`** commands (**`.ai/POLICY-APPROVAL.md`**).\n\n" +
    "At **§7 Phase delivery summary**, paste the template with **every** token expanded from CLI / task-store / maintainer evidence — no literal **`{feature}`**-style leftovers (see playbook evidence rules for **`{featureMarkdownBullets}`** and **`{optionalNotesBlockOrEmpty}`**).\n\n" +
    "Optional: **`.cursor/rules/playbook-phase-closeout.mdc`**."
  );
}
