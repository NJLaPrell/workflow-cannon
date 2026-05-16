# `.ai/` subtree routing (agents)

**Audience:** coding agents. **Do not** use this file to replace **`.ai/agent-source-of-truth-order.md`** — that list is the **precedence** contract; this file is **navigation** only.

Pick **one** row, open **one** linked hub or README, then stop browsing. Prefer **CLI JSON** (`pnpm exec wk run …`, `pnpm exec wk doctor`) over reading prose when the command already answers the question.

## Lifecycle legend (how to treat files here)

| Tag | Meaning |
| --- | --- |
| **active** | Current machine canon; safe default for routing. |
| **generated** | Emitted or keyed by the documentation module / generators — edit **sources** (`templates/`, keyed `.ai/README.md` records), then regenerate per **`src/modules/documentation/RULES.md`**. |
| **historical** | Superseded narrative kept for provenance — do not treat as live queue or policy unless cross-linked from an **active** doc. |
| **mirror** | Human render may exist under **`docs/maintainers/`** — agents still prefer **`.ai/`** sources when both exist (see **`.cursor/rules/agent-doc-routing.mdc`**). |

## Subtree entrypoints (symptom → one door)

| Need | Entry | Lifecycle |
| --- | --- | --- |
| Numbered precedence / governance stack | [`.ai/agent-source-of-truth-order.md`](./agent-source-of-truth-order.md) | **active** |
| Meta rules + CAE / CLI refs (machine rows) | [`.ai/AGENTS.md`](./AGENTS.md) | **active** |
| CLI tiers, policy, compact recap | [`.ai/machine-cli-policy.md`](./machine-cli-policy.md) + [`.ai/AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md) | **active** |
| Copy-paste argv JSON per command | [`.ai/agent-cli-snippets/INDEX.json`](./agent-cli-snippets/INDEX.json) | **active** |
| CAE (registry, dashboard, traces) | [`.ai/cae/HUB.md`](./cae/HUB.md) | **active** |
| Runbooks (install, SQLite, transcripts, …) | [`.ai/runbooks/HUB.md`](./runbooks/HUB.md) | **active** |
| ADRs (architecture decisions) | [`.ai/adrs/HUB.md`](./adrs/HUB.md) | **active** + **mirror** rows |
| Maintainer-style playbooks (ordered procedures) | [`.ai/playbooks/README.md`](./playbooks/README.md) | **active** |
| Workbooks (case drills, shorter than playbooks) | [`.ai/workbooks/README.md`](./workbooks/README.md) | **active** |
| Cross-cutting plans (not yet task-scoped) | [`.ai/plans/README.md`](./plans/README.md) | **active** |
| Delivery / improvement one-pagers | [`.ai/MACHINE-PLAYBOOKS.md`](./MACHINE-PLAYBOOKS.md) | **active** |
| Session / roadmap pointers (avoid `docs/` queue prose) | [`.ai/WORKSPACE-KIT-SESSION.md`](./WORKSPACE-KIT-SESSION.md) | **active** |
| Terminology + machine index | [`.ai/TERMS.md`](./TERMS.md), [`.ai/TERMS.index.json`](./TERMS.index.json) | **active** |
| Product README keyed records + chat guides | [`.ai/README.md`](./README.md) | **generated** / **active** keys |

## Routing hubs (avoid directory slurping)

Use the three first-class hubs after you have a rough **topic** from the table above:

1. [`.ai/cae/HUB.md`](./cae/HUB.md)
2. [`.ai/runbooks/HUB.md`](./runbooks/HUB.md)
3. [`.ai/adrs/HUB.md`](./adrs/HUB.md)

## Maintainer prose (humans)

Routine agent work **does not** start under **`docs/maintainers/`** — see **`.cursor/rules/agent-doc-routing.mdc`**. When a maintainer twin is the **only** copy of an artifact, that rule names the narrow exception (read **one** file, then stop).
