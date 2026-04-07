import test from "node:test";
import assert from "node:assert/strict";
import { buildWishlistIntakeAgentPrompt } from "../dist/wishlist-chat-prompt.js";

test("buildWishlistIntakeAgentPrompt includes playbook path", () => {
  const p = buildWishlistIntakeAgentPrompt();
  assert.match(p, /\.ai\/playbooks\/wishlist-intake-to-execution\.md/);
  assert.match(p, /list-wishlist/);
  assert.match(p, /AGENT-CLI-MAP\.md/);
});

test("buildWishlistIntakeAgentPrompt focuses id when provided", () => {
  const p = buildWishlistIntakeAgentPrompt({ wishlistId: "T501" });
  assert.match(p, /\*\*T501\*\*/);
  assert.match(p, /get-wishlist/);
});
