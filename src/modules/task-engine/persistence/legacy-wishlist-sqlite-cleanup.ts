import type { WishlistStoreDocument } from "../wishlist/wishlist-types.js";
import type { TaskStore } from "./store.js";
import type { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import {
  allocateNextTaskNumericId,
  isWishlistIntakeTask,
  LEGACY_WISHLIST_ID_METADATA_KEY,
  taskEntityFromWishlistItem
} from "../wishlist/wishlist-intake.js";

function emptyWishDoc(): WishlistStoreDocument {
  return {
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * If planning SQLite still uses `workspace_planning_state.wishlist_store_json`, copy any blob items
 * into `wishlist_intake` tasks and shrink the table to the task-only shape. Safe no-op when the DB
 * is already task-only.
 */
export function collapseLegacyWishlistSqliteIfNeeded(
  dual: SqliteDualPlanningStore,
  taskStore: TaskStore
): void {
  if (dual.tableShape !== "legacy-dual") {
    return;
  }
  const wishItems = dual.wishlistDocument.items;
  const taskDoc = dual.taskDocument;
  const existingLegacy = new Set(
    taskDoc.tasks
      .filter((t) => isWishlistIntakeTask(t))
      .map((t) => t.metadata?.[LEGACY_WISHLIST_ID_METADATA_KEY])
      .filter((x): x is string => typeof x === "string")
  );
  const toAdd = wishItems.filter((it) => !existingLegacy.has(it.id));
  const needsWishlistClear = wishItems.length > 0;

  const now = new Date().toISOString();
  const apply = (): void => {
    let working = [...dual.taskDocument.tasks];
    for (const item of toAdd) {
      const newId = allocateNextTaskNumericId(working);
      const entity = taskEntityFromWishlistItem(item, newId, now);
      working.push(entity);
      taskStore.addTask(entity);
    }
    if (needsWishlistClear) {
      dual.seedFromDocuments(dual.taskDocument, emptyWishDoc());
    }
  };

  dual.withTransaction(apply);
  dual.migrateToTaskOnlyTableSchema();
}
