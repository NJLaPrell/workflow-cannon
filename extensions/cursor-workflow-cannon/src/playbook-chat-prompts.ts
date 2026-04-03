/**
 * Composer seed text for maintainer playbooks (Cursor `deeplink.prompt.prefill` path).
 * Avoid exfil-ish patterns that Cursor's deeplink validator rejects.
 */

export function buildImprovementTriagePrompt(options?: { taskId?: string }): string {
  const id = options?.taskId?.trim();
  const focus =
    id && id.length > 0
      ? `Focus on proposed improvement **${id}**: run \`workspace-kit run get-task '{"taskId":"${id}"}'\` first.\n\n`
      : "List proposed improvements with `workspace-kit run list-tasks '{\"status\":\"proposed\",\"type\":\"improvement\"}'` and pick at most three per the playbook rubric.\n\n";

  return (
    "Run **Improvement triage (top three)** for this workspace.\n\n" +
    focus +
    "Attach **`docs/maintainers/playbooks/improvement-triage-top-three.md`** (playbook id **`improvement-triage-top-three`**).\n\n" +
    "Use **`docs/maintainers/AGENT-CLI-MAP.md`** for **`run-transition`** **`accept`** with JSON **`policyApproval`** when promoting tasks.\n\n" +
    "Do not hand-edit kit-owned stores for lifecycle transitions."
  );
}

export function buildTaskToMainPrompt(options?: { taskId?: string }): string {
  const id = options?.taskId?.trim();
  const focus =
    id && id.length > 0
      ? `Deliver execution task **${id}** to **main** using the maintainer delivery loop.\n\n`
      : "Pick one **`workspace-kit`** execution task from **`ready`** (or clarify scope first).\n\n";

  return (
    "Follow **`docs/maintainers/playbooks/task-to-main.md`** (playbook id **`task-to-main`**).\n\n" +
    focus +
    "Branch → implement → validate → PR → merge → **`workspace-kit run run-transition`** **`complete`** with **`policyApproval`** per **`docs/maintainers/POLICY-APPROVAL.md`**.\n\n" +
    "Optional: **`.cursor/rules/playbook-task-to-main.mdc`**."
  );
}
