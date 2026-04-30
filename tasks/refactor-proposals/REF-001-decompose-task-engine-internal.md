# REF-001 — Decompose `task-engine-internal.ts`

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-001 |
| **Suggested `type`** | `improvement` (or execution `engineering` slice if phased as deliverables) |
| **Priority** | High |
| **Primary paths** | `src/modules/task-engine/task-engine-internal.ts`, `src/modules/task-engine/index.ts` |

---

## Problem statement (`metadata.issue`)

`task-engine-internal.ts` is a **megamodule** (~2.7k+ lines): it aggregates `WorkflowModule` wiring, mutations, snapshots, workspace-status delegation, doctor hooks, pagination, strict validation, queue/git alignment, and cross-cutting imports from core and other modules. This **raises defect risk**, **blocks parallel edits**, and **obscures** which command owns which invariant.

---

## Goals

1. **Modularity:** Replace one file with a **thin** `task-engine-internal.ts` (or rename to `task-engine-module.ts`) that only constructs `WorkflowModule` and delegates `onCommand` to **handler modules**.
2. **Maintainability:** Each command family lives in **one folder** (`commands/` or `on-command/`) so reviews map 1:1 to behavior.
3. **Reliability:** **No behavior change** to JSON contracts for `workspace-kit run …` commands; existing tests pass unchanged.
4. **Efficiency:** Faster IDE navigation and smaller merge conflicts on unrelated command work.

---

## Out of scope

- Changing **instruction markdown** payloads or **command names** (`src/modules/task-engine/instructions/*.md`).
- Schema or **policyApproval** semantics.
- Migrating SQLite schema (see REF-003).

---

## Implementation plan

1. **Inventory** exported `onCommand` branches and helpers inside `task-engine-internal.ts`; group into **clusters** (e.g. transitions & mutations, reads/snapshots, workspace status passthrough, wishlist bridge, persistence maintenance commands that stay in-task-engine, doctor contract aggregation).
2. **Extract pure helpers** first (anything with **no module closure**) into existing or new files under `task-engine/` (e.g. `task-engine/commands/agent-session-snapshot.ts`).
3. **Per cluster:** create `commands/<cluster>.ts` exporting `handleX(command, ctx)` or `registerTaskEngineCommands(registry)` depending on ergonomic fit.
4. **Central wire-up:** `task-engine-internal.ts` imports handlers and delegates in a **`switch`/map keyed by instruction name**, matching router behavior (`ModuleCommandRouter`).
5. **Tests:** Run full **`pnpm run test`**; add/adjust unit tests **only** if extracting surfaces new pure functions worth testing — avoid testing “same JSON” twice.

Suggested folder sketch (adjust to discovered clusters):

```
src/modules/task-engine/
  task-engine-internal.ts     # slim: module + dispatch only
  commands/
    ...
```

---

## Task links (`metadata` / refs)

| Link | Purpose |
| --- | --- |
| `REF-004` | If extraction reveals more sibling-module imports, fold into boundary port work |
| **`src/modules/task-engine/index.ts`** | Public exports stay stable unless intentionally versioned |

---

## Acceptance criteria

- [ ] `task-engine-internal.ts` (or successor) is **below an agreed line budget** (e.g. ≤200–300 lines dispatch + shared wiring only) unless maintainers waive with rationale in PR.
- [ ] **No intentional** semantic change: `pnpm run build` succeeds; **`pnpm run test`** passes.
- [ ] **`pnpm exec wk run list-tasks --schema-only`** and spot-check **`get-next-actions`**, **`run-transition`** (schema-only smoke) behave as before.
- [ ] New files follow existing **imports** style (`*.js` in TS sources); **no circular** import cycle introduced (TypeScript verifies).
- [ ] **`taskEngineModule`** export path unchanged (`./task-engine-internal.js` from `index.ts` or documented rename in same PR).

---

## create-task payload (starter)

Use after allocating a **`T###`** id:

```json
{
  "id": "T###",
  "title": "[REF-001] Decompose task-engine-internal megamodule",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Split src/modules/task-engine/task-engine-internal.ts into commands/* handlers.",
    "Keep WorkflowModule exports and CLI command behavior unchanged.",
    "Run pnpm run test and regression smoke on key wk run commands."
  ],
  "acceptanceCriteria": [
    "Task-engine dispatch file is intentionally small; clusters live under task-engine/commands/ (or agreed structure).",
    "Build + test green; no intentional JSON contract regressions.",
    "Document any export-path rename in changelog if user-visible."
  ],
  "metadata": {
    "issue": "task-engine-internal.ts concentrates entire onCommand surface; hard to maintain and risky to change.",
    "supportingReasoning": "Line count scan and import graph show monolithic coupling; decomposition matches src/README layering goals.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-001-decompose-task-engine-internal.md", "src/modules/task-engine/task-engine-internal.ts"],
    "links": { "dependsOnProposalIds": [], "blocksProposalIds": [] }
  }
}
```

---

## Risk & rollback

- **Risk:** Missed delegated branch ⇒ dead command path. Mitigate with **grep** for instruction names **after** refactor and **`wk run`** schema-only loops from CI/script if available.
- **Rollback:** Revert PR; decomposition should be single mergeable slice per cluster if phased.
