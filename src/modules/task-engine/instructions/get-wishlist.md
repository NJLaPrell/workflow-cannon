<!--
agentCapsule|v=1|command=get-wishlist|module=task-engine|schema_only=pnpm exec wk run get-wishlist --schema-only '{}'
-->

# get-wishlist

Retrieve **one** wishlist intake task by **task id** (**`T###`**, preferred) or by **legacy wishlist id** (**`W###`**) when the intake row stores **`metadata.legacyWishlistId`**.

Data is read from the **unified task store** (SQLite under `tasks.sqliteDatabaseRelativePath`).

## Usage

**Preferred — intake task id:**

```
workspace-kit run get-wishlist '{"wishlistId":"T604"}'
```

**Legacy provenance id (after migration):**

```
workspace-kit run get-wishlist '{"wishlistId":"W1"}'
```

`id` is accepted as an alias for `wishlistId`.

## Response

Returns **`item`** (wishlist wire shape) and **`taskId`** (canonical **`T###`**). On miss: **`task-not-found`**.

When `tasks.planningGenerationPolicy` is **`require`**, pass **`expectedPlanningGeneration`** from your last read when chaining into mutating commands.

Implementation: `src/modules/task-engine/commands/task-engine-wishlist-on-command.ts` (**`get-wishlist`**); lookup helper: `findWishlistIntakeTaskByLegacyOrTaskId` in `wishlist/wishlist-intake.ts`.
