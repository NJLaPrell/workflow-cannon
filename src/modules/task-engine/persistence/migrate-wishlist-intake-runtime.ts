import fsSync from "node:fs";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { WishlistStoreDocument } from "../wishlist/wishlist-types.js";
import { TaskStore } from "./store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
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

export async function runMigrateWishlistIntake(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  return migrateSqlite(ctx, dryRun);
}

function migrateSqlite(ctx: ModuleLifecycleContext, dryRun: boolean): ModuleCommandResult {
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dual = new SqliteDualPlanningStore(ctx.workspacePath, dbRel);
  if (!fsSync.existsSync(dual.dbPath)) {
    return {
      ok: false,
      code: "storage-read-error",
      message: `SQLite planning database not found at ${dual.dbPath} — run migrate-task-persistence json-to-sqlite first (docs/maintainers/runbooks/json-to-sqlite-one-shot-upgrade.md)`
    };
  }
  dual.loadFromDisk();
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
  const needsSchemaShrink = dual.tableShape === "legacy-dual";

  if (dryRun) {
    return {
      ok: true,
      code: "migrate-dry-run",
      message: `Dry run: would migrate ${toAdd.length} wishlist row(s), clear wishlist blob when needed, and shrink SQLite schema when applicable`,
      data: {
        dbPath: dual.dbPath,
        wishlistCount: wishItems.length,
        wouldMigrate: toAdd.length,
        tableShape: dual.tableShape,
        needsWishlistClear,
        needsSchemaShrink
      }
    };
  }

  if (toAdd.length === 0 && !needsWishlistClear && !needsSchemaShrink) {
    return {
      ok: true,
      code: "wishlist-intake-migrate-noop",
      message: "No legacy wishlist data and planning SQLite already uses task-only row shape",
      data: { migratedCount: 0, dbPath: dual.dbPath }
    };
  }

  const now = new Date().toISOString();
  const store = TaskStore.forSqliteDual(dual);
  const apply = (): void => {
    let working = [...dual.taskDocument.tasks];
    for (const item of toAdd) {
      const newId = allocateNextTaskNumericId(working);
      const entity = taskEntityFromWishlistItem(item, newId, now);
      working.push(entity);
      store.addTask(entity);
    }
    if (needsWishlistClear) {
      dual.seedFromDocuments(dual.taskDocument, emptyWishDoc());
    }
  };

  dual.withTransaction(apply);

  if (needsSchemaShrink) {
    dual.migrateToTaskOnlyTableSchema();
  } else {
    dual.persistSync();
  }

  return {
    ok: true,
    code: "wishlist-intake-migrated",
    message: `Migrated ${toAdd.length} wishlist item(s) to tasks; cleared legacy wishlist blob where applicable`,
    data: { migratedCount: toAdd.length, dbPath: dual.dbPath, schemaShrunk: needsSchemaShrink }
  };
}
