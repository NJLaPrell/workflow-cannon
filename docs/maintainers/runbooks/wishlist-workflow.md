# Wishlist workflow (Task Engine)

Wishlist items capture **high-level ideas** before they become executable work. They use ids **`W<number>`** and live in **`.workspace-kit/wishlist/state.json`**. Canonical tasks use **`T<number>`** and **phase** assignment only after conversion.

## Intake (strict fields)

Required on `create-wishlist`:

- `id` — `W` + digits (e.g. `W1`)
- `title`, `problemStatement`, `expectedOutcome`, `impact`, `constraints`, `successSignals`, `requestor`, `evidenceRef`

Do **not** pass `phase` on wishlist items.

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
