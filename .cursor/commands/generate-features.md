---
description: Wishlist / feature intake → execution — rank, clarify scope, convert-wishlist
---

The user invoked **generate-features** (Generate Features). Follow **`.ai/playbooks/wishlist-intake-to-execution.md`** (id **`wishlist-intake-to-execution`**). Optional: **`.cursor/rules/playbook-wishlist-intake-to-execution.mdc`**.

1. Discover candidates and persist conversions per that playbook using **`workspace-kit run`**. Wishlist mutations (including **`convert-wishlist`**) are **Tier C** by default; use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for tiers and JSON **`policyApproval`** / **`expectedPlanningGeneration`** when policy requires it.
2. Do not hand-edit kit-owned stores for wishlist conversion or task lifecycle.

Maintainer-rendered mirror (not the agent bootstrap path): `docs/maintainers/playbooks/wishlist-intake-to-execution.md`.
