<!-- GENERATED FROM .ai/runbooks/principal-architectural-review-themes.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Principal architectural review themes (agent index)

**Audience:** operators and agents doing cold-start architecture reads.  
**Source:** Distilled from a full-repo review (schemas, modularity, docs, agent/human gaps); this file is the **stable pointer layer**—not a transcript dump.

## How to use this runbook

1. Read **precedence** in [`.ai/agent-source-of-truth-order.md`](../agent-source-of-truth-order.md).
2. Use the ranked themes below when deciding where to look before changing CLI behavior, contracts, or the Cursor extension.

## Ranked themes (highest leverage first)

### 1) Contract and schema surfaces run in parallel

Multiple sources define or validate JSON shapes: packaged **contracts** (`package.json` → `exports`), **`schemas/`** (including pilot run-args snapshots), and **module instruction** markdown under `src/modules/*/instructions/`. No single “one file” validates everything end-to-end.

**Anchors**

- [`schemas/pilot-run-args.snapshot.json`](../../schemas/pilot-run-args.snapshot.json) — CLI argv validation spine for task-engine commands.
- [`schemas/task-engine-run-contracts.schema.json`](../../schemas/task-engine-run-contracts.schema.json) — run-contract const / schema pairing.
- `src/modules/*/instructions/*.md` — payload shapes agents must follow for `wk run`.
- [`.ai/AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) — tier table, approval lanes, copy-paste invocations.

**Operational habit:** Prefer `pnpm exec wk run <cmd> --schema-only` when unsure of JSON fields; re-read `data.planningGeneration` when policy is `require`.

### 2) Task-engine module concentration (“gravity well”)

Most queue lifecycle, planning generation, dashboard/next-actions composition, and SQLite persistence paths run through the **task-engine** module. Cross-cutting changes there ripple to doctor output, the Cursor extension, and consumer installs.

**Anchors**

- `src/modules/task-engine/` — implementation.
- [`.ai/runbooks/task-persistence-operator.md`](./task-persistence-operator.md) — persistence and recovery.
- [`.ai/runbooks/planning-workflow.md`](./planning-workflow.md) — planning generation expectations.

**Operational habit:** Treat task-engine edits as high-blast-radius; run full `pnpm run check` / `pnpm run test` / `pnpm run parity` before release.

### 3) Cursor extension is a thin client; drift is a consumer hazard

The VS Code extension should stay aligned with **published** workspace-kit **contract** subpaths and JSON shapes (e.g. `dashboard-summary`, `agent-session-snapshot`). Forking field names or duplicating validation logic invites silent drift.

**Anchors**

- [`extensions/cursor-workflow-cannon/README.md`](../../extensions/cursor-workflow-cannon/README.md) — extension ↔ package contract notes.
- `@workflow-cannon/workspace-kit/contracts/*` — TypeScript-shaped entrypoints for dashboard and snapshot payloads.

**Operational habit:** When changing a `wk run` success payload, update contracts and extension consumers in the **same** change set when feasible.

## Broader layout (not repeated here)

- [`.ai/ARCHITECTURE.md`](../ARCHITECTURE.md) — repository layout and boundaries.
- [`.ai/module-build.md`](../module-build.md) — module packaging and peers.
- [`.ai/AGENTS.md`](../AGENTS.md) — agent meta rules and references.
- [`.ai/WORKSPACE-KIT-SESSION.md`](../WORKSPACE-KIT-SESSION.md) — session bootstrap (`doctor`, `agent-session-snapshot`, planning generation).

## Related

- [`.ai/runbooks/agent-task-engine-ergonomics.md`](./agent-task-engine-ergonomics.md) — natural-language intent → `wk run` exemplars.
