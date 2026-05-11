/**
 * Composer seed for phase closeout + release (operator dashboard shortcut).
 * Canonical steps: `.ai/playbooks/phase-closeout-and-release.md` (after queue drain:
 * `.ai/playbooks/task-to-phase-branch.md`, maintainer delivery loop).
 */

export type PhaseCompleteReleasePromptOptions = {
  /**
   * Phase key from the task store / dashboard (e.g. `"64"`). When set, the prompt
   * names a concrete integration branch `release/phase-<key>`.
   */
  phaseKey?: string;
};

function phaseIntegrationBranchLabel(phaseKey: string | undefined): string {
  const pk = phaseKey?.trim();
  if (pk && pk.length > 0) {
    return "**`release/phase-" + pk + "`**";
  }
  return "**`release/phase-<N>`** (resolve **<N>** from operator context, **`dashboard-summary`**, **`get-next-actions`**, or task **`phaseKey`**)";
}

function mergePhaseToMainPhrase(phaseKey: string | undefined): string {
  const pk = phaseKey?.trim();
  if (pk && pk.length > 0) {
    return "**`release/phase-" + pk + "`** → **`main`**";
  }
  return "**`release/phase-<N>`** → **`main`**";
}

export function buildPhaseCompleteReleaseChatPrompt(
  phasePhrase: string,
  options?: PhaseCompleteReleasePromptOptions
): string {
  const note =
    phasePhrase.trim().length > 0
      ? "The operator added this context: **" + phasePhrase.trim() + "**\n\n"
      : "";
  const pk = options?.phaseKey?.trim();
  const branch = phaseIntegrationBranchLabel(pk);
  const mergeLine = mergePhaseToMainPhrase(pk);

  return (
    note +
    "**Mission:** In this chat, finish **all** remaining phase-scoped execution work on the phase integration branch, then run **full phase closeout and release** per machine canon (one continuous operator intent from the dashboard).\n\n" +
    "**Attach and keep in context:** `@.ai/playbooks/phase-closeout-and-release.md`, `@.ai/playbooks/task-to-phase-branch.md`, and `@.ai/MACHINE-PLAYBOOKS.md`.\n\n" +
    "### Stage A — Finish remaining phase work (phase-closeout **§2**)\n\n" +
    "Until **every** execution task that belongs on " +
    branch +
    " is **`completed`** in the configured task store (or explicitly handled per the playbook), drive each **`T###`** through the **maintainer delivery loop**:\n\n" +
    "- Branch a **task branch** from that line; follow **`.cursor/rules/branching-tagging-strategy.mdc`** when creating or updating the phase branch from **`main`**.\n" +
    "- **`workspace-kit run run-transition`** **`start`** with JSON **`policyApproval`** before the first implementation commit when the task is still **`ready`**.\n" +
    "- Implement, validate, open **PR with base = the phase integration branch** (not **`main`**) when **`workspace-kit run resolve-maintainer-delivery-policy`** implies GitHub-style delivery; iterate review; merge into the phase branch.\n" +
    "- **`run-transition`** **`complete`** with **`policyApproval`** and evidence after merge.\n\n" +
    "Ordered detail: **`.ai/playbooks/task-to-phase-branch.md`** (playbook id **`task-to-phase-branch`**) and **`.ai/MACHINE-PLAYBOOKS.md`** → *Single task → phase integration branch*. Treat **`.cursor/rules/maintainer-delivery-loop.mdc`** as binding. Attach **`.cursor/rules/playbook-task-to-phase-branch.mdc`** for Stage A.\n\n" +
    "Bootstrap reads (do **not** infer **`status`** from chat): **`pnpm exec wk doctor`**, **`pnpm exec wk run get-next-actions '{}'`**, **`pnpm exec wk run list-tasks`** filtered by **`phaseKey`** / phase scope.\n\n" +
    "**Hard gate:** Do **not** begin phase-closeout **§3** (preflight / merge prep) until **§2** exit criteria in **`.ai/playbooks/phase-closeout-and-release.md`** are satisfied.\n\n" +
    "### Stage B — Closeout, merge to `main`, release (phase-closeout **§0–§7** after §2)\n\n" +
    "Then execute **`.ai/playbooks/phase-closeout-and-release.md`** (playbook id **`phase-closeout-and-release`**) in order — **`phase-delivery-preflight`**, **`release-evidence-manifest`**, validations on the phase tip, " +
    mergeLine +
    ", and **`.ai/RELEASING.md`**. Attach **`.cursor/rules/playbook-phase-closeout.mdc`** for Stage B.\n\n" +
    "Operator entrypoint: Workflow Cannon dashboard **Complete & Release** chat. " +
    "Publish/tag/npm still require explicit human authorization after **`main`** merge; without that approval, stop before publish automation (**`.ai/RELEASING.md`**, playbook §4).\n\n" +
    "**Chat expresses intent only.** Tier A/B **`workspace-kit run`** still requires JSON **`policyApproval`** on the **third** CLI argument (**`.ai/POLICY-APPROVAL.md`**, **`.ai/AGENT-CLI-MAP.md`**).\n\n" +
    "At **§7 Phase delivery summary**, paste the template with **every** token expanded — evidence rules: **`{featureMarkdownBullets}`**, **`{optionalNotesBlockOrEmpty}`** (no stale **`{feature}`** placeholders).\n\n" +
    "If you cannot finish every **`T###`** in one session, end with a **handoff**: remaining task ids, current branch names, last validation or CLI evidence, and the next concrete Stage A or B step."
  );
}
