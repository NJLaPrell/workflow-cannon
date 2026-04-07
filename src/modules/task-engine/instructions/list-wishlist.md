# list-wishlist

List **wishlist intake** tasks from the **unified task store** (SQLite under `tasks.sqliteDatabaseRelativePath`). Each row is **`type: "wishlist_intake"`** with a stable **`T###`** id; results are mapped to the **wishlist item** wire shape (`id`, `status` **`open`** / **`converted`** / **`cancelled`**, etc.).

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
