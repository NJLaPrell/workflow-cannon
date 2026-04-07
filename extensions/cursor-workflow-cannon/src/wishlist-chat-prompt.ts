/**
 * Prompt text for driving wishlist intake → execution in Cursor chat (Composer).
 * Kept free of `.env` / exfil-ish substrings — Cursor's deeplink validator rejects those.
 *
 * Behavioral checklist lives only in `.ai/playbooks/wishlist-intake-to-execution.md`; this file
 * adds dashboard context (optional **T###** focus) and canonical path pointers.
 */

export function buildWishlistIntakeAgentPrompt(options?: { wishlistId?: string }): string {
  const id = options?.wishlistId?.trim();
  const focus =
    id && id.length > 0
      ? `Start with wishlist intake **${id}**: run \`workspace-kit run get-wishlist '{"wishlistId":"${id}"}'\`, then continue **\`.ai/playbooks/wishlist-intake-to-execution.md\`** from §1 onward.\n\n`
      : "Open **\`.ai/playbooks/wishlist-intake-to-execution.md\`** at §0 (inventory — **`list-wishlist`** / **`get-wishlist`**).\n\n";

  return (
    "Run **wishlist intake → execution** for this workspace (playbook id **`wishlist-intake-to-execution`**).\n\n" +
    focus +
    "Attach that playbook; optional rule: **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**. Tiers and gates: **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**. Persist only via **`workspace-kit run`** — do not hand-edit kit stores."
  );
}
