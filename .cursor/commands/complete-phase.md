---
description: Phase closeout — finish release/phase-<N>, merge to main, optional publish (human-gated)
---

The user invoked **complete-phase**. Expected shape: **`/complete-phase <N> [approve-release]`** — **`<N>`** is the workspace-kit phase number (e.g. **`65`**). Add the token **`approve-release`** only when the human explicitly authorizes publish / tag / npm **after** **`release/phase-<N>`** is merged to **`main`**. **Without `approve-release`, stop before any publish automation** (see **`.ai/playbooks/phase-closeout-and-release.md`** §4 and **`.ai/RELEASING.md`**).

Context: GitHub **#84** (phase closeout operator ergonomics).

1. Follow **`.ai/playbooks/phase-closeout-and-release.md`** (playbook id **`phase-closeout-and-release`**). Machine canon lives under **`.ai/`**; **`docs/maintainers/playbooks/`** mirrors are for humans — see **`AGENTS.md`** routing.
2. `pnpm exec wk doctor` and `pnpm exec wk run get-next-actions '{}'`.
3. `pnpm exec wk run list-tasks` with filters as needed (e.g. **`phaseKey`** **`<N>`**); deliver remaining execution work via **`release/phase-<N>`** using **`.ai/playbooks/task-to-phase-branch.md`** (PR base = phase branch, not **`main`**).
4. On **`release/phase-<N>`** tip: `pnpm run build`, `pnpm run check`, `pnpm run test`, `pnpm run parity`, plus maintainer gates named in **`.ai/RELEASING.md`**.
5. Merge **`release/phase-<N>`** → **`main`** through a normal reviewed PR when validation is green.
6. **Publish / tag / npm:** run only if **`approve-release`** was present in the slash args **and** the human confirmation path in **`.ai/RELEASING.md`** is satisfied. **Slash text and chat are not JSON `policyApproval`.** Tier A/B **`pnpm exec wk run …`** still needs **`policyApproval`** in the **third** argv object (**`.ai/POLICY-APPROVAL.md`**).
7. At playbook **§7 Phase delivery summary**, paste the wrap-up template with evidence-backed values (**`{featureMarkdownBullets}`**, **`{optionalNotesBlockOrEmpty}`**, counts — no unfilled **`{…}`** placeholders).

Optional: **`.cursor/rules/playbook-phase-closeout.mdc`**.
