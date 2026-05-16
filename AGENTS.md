# AGENTS

**Agents:** Use **`.ai/AGENTS.md`** (meta rules), **`.ai/agent-source-of-truth-order.md`** (numbered precedence), **`.ai/machine-cli-policy.md`**, **`.ai/WORKSPACE-KIT-SESSION.md`**, **`.ai/MACHINE-PLAYBOOKS.md`**, and **`src/modules/*/instructions/*.md`**. Prefer **`pnpm run wk`** / CLI JSON output over opening anything under **`docs/`** for routine execution (see **`.cursor/rules/agent-doc-routing.mdc`**). Defects and execution backlog for **this** repository belong in the SQLite task store via **`workspace-kit run create-task`** (and improvement pipelines where applicable), not GitHub Issues — GitHub remains for PRs, review, and merge per maintainer delivery.

**Maintainers:** Human-oriented index and rendered playbooks live in **`docs/maintainers/AGENTS.md`** — not the agent entry path.

- **`.ai/AGENT-CLI-MAP.md`** — tier table and copy-paste JSON for agents.
- **`.ai/POLICY-APPROVAL.md`** — approval lanes (JSON vs env) for agents.
- **`list-approval-queue`** — read-only discovery for the improvement **`review-item`** queue and policy artifact paths; copy-paste in **`.ai/AGENT-CLI-MAP.md`** (Tier C block).
- **`docs/maintainers/AGENT-CLI-MAP.md`** — maintainer-depth companion (humans editing the repo).
- **`docs/maintainers/DOCUMENTATION-LIFECYCLE.md`** — taxonomy and metadata for active, generated, historical, archive, and delete-candidate docs (maintainers; see **`.cursor/rules/agent-doc-routing.mdc`** before bulk `docs/` reads).
