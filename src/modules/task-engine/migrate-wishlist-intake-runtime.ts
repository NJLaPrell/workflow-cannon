import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { TaskStoreDocument } from "./types.js";
import type { WishlistStoreDocument } from "./wishlist-types.js";
import { TaskStore } from "./store.js";
import { WishlistStore } from "./wishlist-store.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "./planning-config.js";
import { DEFAULT_TASK_STORE_PATH } from "./store.js";
import { DEFAULT_WISHLIST_PATH } from "./wishlist-store.js";
import {
  allocateNextTaskNumericId,
  isWishlistIntakeTask,
  LEGACY_WISHLIST_ID_METADATA_KEY,
  taskEntityFromWishlistItem
} from "./wishlist-intake.js";

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
  const backend = getTaskPersistenceBackend(ctx.effectiveConfig);

  if (backend === "sqlite") {
    return migrateSqlite(ctx, dryRun);
  }
  return migrateJson(ctx, dryRun);
}

async function migrateJson(ctx: ModuleLifecycleContext, dryRun: boolean): Promise<ModuleCommandResult> {
  const taskRel = planningTaskStoreRelativePath(ctx) ?? DEFAULT_TASK_STORE_PATH;
  const wishRel = planningWishlistStoreRelativePath(ctx) ?? DEFAULT_WISHLIST_PATH;
  const taskPath = path.resolve(ctx.workspacePath, taskRel);
  const wishPath = path.resolve(ctx.workspacePath, wishRel);

  const taskStore = TaskStore.forJsonFile(ctx.workspacePath, taskRel);
  await taskStore.load();
  const wishStore = WishlistStore.forJsonFile(ctx.workspacePath, wishRel);
  await wishStore.load();
  const items = wishStore.getAllItems();
  if (items.length === 0) {
    return {
      ok: true,
      code: "wishlist-intake-migrate-noop",
      message: "No legacy wishlist items to migrate (JSON mode)",
      data: { migratedCount: 0, wishPath, taskPath }
    };
  }

  const tasks = taskStore.getAllTasks();
  const existingLegacy = new Set(
    tasks
      .filter((t) => isWishlistIntakeTask(t))
      .map((t) => t.metadata?.[LEGACY_WISHLIST_ID_METADATA_KEY])
      .filter((x): x is string => typeof x === "string")
  );

  const toAdd = items.filter((it) => !existingLegacy.has(it.id));
  if (dryRun) {
    return {
      ok: true,
      code: "migrate-dry-run",
      message: `Dry run: would migrate ${toAdd.length} wishlist item(s) into tasks and clear ${wishPath}`,
      data: { wishlistCount: items.length, wouldMigrate: toAdd.length, wishPath, taskPath }
    };
  }

  const now = new Date().toISOString();
  let working = [...tasks];
  for (const item of toAdd) {
    const newId = allocateNextTaskNumericId(working);
    const entity = taskEntityFromWishlistItem(item, newId, now);
    working.push(entity);
    taskStore.addTask(entity);
  }
  await taskStore.save();

  await fs.mkdir(path.dirname(wishPath), { recursive: true });
  await fs.writeFile(wishPath, `${JSON.stringify(emptyWishDoc(), null, 2)}\n`, "utf8");

  return {
    ok: true,
    code: "wishlist-intake-migrated",
    message: `Migrated ${toAdd.length} wishlist item(s) to wishlist_intake tasks; cleared ${wishPath}`,
    data: { migratedCount: toAdd.length, wishPath, taskPath }
  };
}

function migrateSqlite(ctx: ModuleLifecycleContext, dryRun: boolean): ModuleCommandResult {
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dual = new SqliteDualPlanningStore(ctx.workspacePath, dbRel);
  if (!fsSync.existsSync(dual.dbPath)) {
    return {
      ok: false,
      code: "storage-read-error",
      message: `SQLite planning database not found at ${dual.dbPath}`
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
