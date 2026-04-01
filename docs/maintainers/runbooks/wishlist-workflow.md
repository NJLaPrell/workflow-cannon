# Wishlist workflow (Task Engine)

## Which id should I create?

| I want to… | Id / type | Command / surface |
| --- | --- | --- |
| Track **executable** work (`ready` queue, transitions, **`dependsOn`**) | **`T###`**, normal task types | **`create-task`**, **`run-transition`**, **`list-tasks`** |
| Capture **ideation** before scheduling (strict intake fields) | **`T###`** with **`type: "wishlist_intake"`** | **`create-wishlist`** (auto-allocates **`T###`**; optional legacy provenance id → **`metadata.legacyWishlistId`**) |
| Triage **transcript / enhancement** suggestions | **`imp-*`** (improvement tasks) | **`generate-recommendations`**, **`accept`** / **`reject`** transitions |

Glossary: **`docs/maintainers/TERMS.md`** (**Wishlist**, **Execution Task**, **Improvement Task**). ADR: **`docs/maintainers/ADR-unified-task-store-wishlist-and-improvement-state.md`**.

---

Wishlist **intake** captures high-level ideas before they become scheduled execution work. **New** intake is stored with the unified task store (default SQLite or JSON opt-out) as rows with **`type: "wishlist_intake"`** and **`T###`** ids. The standalone **`.workspace-kit/wishlist/state.json`** file is **legacy**; use **`migrate-wishlist-intake`** when upgrading old workspaces.

## Intake (strict fields)

Required on **`create-wishlist`**:

- `title`, `problemStatement`, `expectedOutcome`, `impact`, `constraints`, `successSignals`, `requestor`, `evidenceRef`

Optional:

- `id` — only when you need a **legacy `W###` provenance** key; stored as **`metadata.legacyWishlistId`**. Otherwise omit for auto **`T###`**.

Do **not** pass `phase` on wishlist intake tasks.

## Breaking into workable tasks

Use **`convert-wishlist`** when the idea is ready to become scheduled work:

1. Fill **`decomposition`** with non-empty strings:
   - `rationale` — why you are splitting the work this way
   - `boundaries` — what is explicitly in or out of this conversion slice
   - `dependencyIntent` — how new tasks should depend on each other (or “none”)
2. Provide a **`tasks`** array. Each entry must include workable task fields: `id` (`T###`), `title`, `phase`, `approach`, non-empty `technicalScope` and `acceptanceCriteria`, plus optional `priority`, `type`, `dependsOn`, `unblocks`.

The wishlist item is **auto-closed** as `converted` with `convertedToTaskIds` and stored decomposition metadata.

## Planning surfaces

- **`list-tasks`**, **`get-next-actions`**, **`get-ready-queue`** return **`scope: "tasks-only"`** — wishlist rows never appear there.
- Use **`list-wishlist`** / **`get-wishlist`** for ideation inventory.
- **`dashboard-summary`** reports `wishlist.openCount` and `wishlist.totalCount` alongside task aggregates.

## Related

- Instruction references: `src/modules/task-engine/instructions/create-wishlist.md`, `convert-wishlist.md`, etc.
- Changelog: `docs/maintainers/CHANGELOG.md` (v0.15.0+).
