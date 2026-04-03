/**
 * Prompt text for driving wishlist intake → execution in Cursor chat (Composer).
 * Kept free of `.env` / exfil-ish substrings — Cursor's deeplink validator rejects those.
 */

export function buildWishlistIntakeAgentPrompt(options?: { wishlistId?: string }): string {
  const id = options?.wishlistId?.trim();
  const focus =
    id && id.length > 0
      ? `Start with wishlist intake task **${id}**: run \`workspace-kit run get-wishlist '{"wishlistId":"${id}"}'\` and use that row as the primary candidate (still apply the playbook rubric if it should not win).\n\n`
      : "Inventory open wishlist rows with `workspace-kit run list-wishlist '{\"status\":\"open\"}'` and pick a primary candidate per the playbook rubric.\n\n";

  return (
    "Run the **wishlist intake → execution** playbook for this workspace.\n\n" +
    focus +
    "Attach and follow **`docs/maintainers/playbooks/wishlist-intake-to-execution.md`** (and optionally **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**).\n\n" +
    "Use **`docs/maintainers/AGENT-CLI-MAP.md`** and **`docs/maintainers/POLICY-APPROVAL.md`** for CLI tiers; persist only via **`workspace-kit run`** (e.g. **`convert-wishlist`**) with correct **`policyApproval`** / **`expectedPlanningGeneration`** when required.\n\n" +
    "Do not hand-edit kit-owned stores for lifecycle or conversion."
  );
}
