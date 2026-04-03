# list-wishlist

List **wishlist intake** tasks from the **unified task store** (default SQLite under `tasks.sqliteDatabaseRelativePath`; JSON opt-out uses the same task document). Each row is **`type: "wishlist_intake"`** with a stable **`T###`** id; results are mapped to the legacy **wishlist item** wire shape (`id`, `status` **`open`** / **`converted`** / **`cancelled`**, etc.).

The standalone **`.workspace-kit/wishlist/state.json`** file is **legacy** only — operators migrate with **`migrate-wishlist-intake`**. This command does **not** read that file as the live store.

This surface is **wishlist-only**; it does not list normal execution tasks. Execution queues remain **`tasks-only`** — see **`docs/maintainers/runbooks/wishlist-workflow.md`**.

## Usage

```
workspace-kit run list-wishlist '{}'
workspace-kit run list-wishlist '{"status":"open"}'
```

## Arguments

| Field | Description |
| --- | --- |
| `status` | Optional filter: `open` (intake still **`proposed`** in the task engine), `converted`, or `cancelled` |

## Response

JSON includes **`items`**, **`count`**, and **`scope: "wishlist-only"`**. When `tasks.planningGenerationPolicy` is **`require`**, include **`expectedPlanningGeneration`** from a prior read on mutating follow-ups (e.g. **`update-wishlist`**, **`convert-wishlist`**).

Implementation: `src/modules/task-engine/wishlist/task-engine-wishlist-on-command.ts` (**`list-wishlist`**).
