# AGENTS

**Agents:** Use **`.ai/AGENTS.md`** (meta rules), **`.ai/agent-source-of-truth-order.md`** (numbered precedence), **`.ai/machine-cli-policy.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`**, **`.ai/MACHINE-PLAYBOOKS.md`**, and **`src/modules/*/instructions/*.md`**. Prefer **`pnpm run wk`** / CLI JSON output over opening anything under **`docs/`** for routine execution (see **`.cursor/rules/agent-doc-routing.mdc`**). Defects and execution backlog for **this** repository belong in the SQLite task store via **`workspace-kit run create-task`** (and improvement pipelines where applicable), not GitHub Issues — GitHub remains for PRs, review, and merge per maintainer delivery.

**Maintainers:** Human-oriented index and rendered playbooks live in **`docs/maintainers/AGENTS.md`** — not the agent entry path.

- **`.ai/AGENT-CLI-MAP.md`** — tier table and copy-paste JSON for agents.
- **`.ai/POLICY-APPROVAL.md`** — approval lanes (JSON vs env) for agents.
- **`list-approval-queue`** — read-only discovery for the improvement **`review-item`** queue and policy artifact paths; copy-paste in **`.ai/AGENT-CLI-MAP.md`** (Tier C block).
- **`docs/maintainers/AGENT-CLI-MAP.md`** — maintainer-depth companion (humans editing the repo).

## Cursor Cloud specific instructions

Runtime: Node 22.x + pnpm 10 (already on the VM). Startup runs `pnpm install` only; you must **build before the CLI runs** (see below).

- **Build first, always.** The bins (`node dist/cli.js`, `pnpm run wk`) do not exist until `pnpm run build` (tsc → `dist/`). Right after `pnpm install`, the `.bin/workspace-kit` warnings are expected and go away once built. Extension work needs `pnpm run ext:compile` (or `pnpm run ui:prepare` = build + ext compile).
- **Tests are self-contained but slow.** `pnpm test` runs `pnpm run ui:prepare` first (build + extension compile) then `node --test` over `test/**/*.test.mjs` (~1650 subtests, roughly 3 minutes). No external services/DB — the task store is embedded `better-sqlite3`.
- **`wk doctor` against THIS repo currently FAILS** with a `phase-projection-count-regression` (SQLite vs git task-state drift). That is live repo *data* drift, not an environment problem — do not "fix" your env over it. Doctor passes cleanly in a fresh `wk init` workspace.
- **Mutations need policy approval.** Use inline `"policyApproval":{"confirmed":true,"rationale":"..."}` in the run JSON, or set env `WORKSPACE_KIT_POLICY_APPROVAL` (see `.env.example`) for `init`/`upgrade`/`config`. Standard build/test/check/run commands live in `package.json` scripts and `CONTRIBUTING.md`.
- **Native SQLite:** if `better-sqlite3` binding complains after a runtime change, run `pnpm run rebuild-sqlite`. `postinstall` already runs the arch/smoke checks.
