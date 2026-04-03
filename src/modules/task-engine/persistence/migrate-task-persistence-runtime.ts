import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { UnifiedStateDb } from "../../../core/state/unified-state-db.js";
import type { TaskStoreDocument } from "../types.js";
import type { WishlistStoreDocument } from "../wishlist/wishlist-types.js";
import { TaskEngineError } from "../transitions.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import {
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "../planning-config.js";
import { DEFAULT_TASK_STORE_PATH } from "./store.js";
import { DEFAULT_WISHLIST_PATH } from "./wishlist-store.js";

function emptyTaskDoc(): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  };
}

function emptyWishDoc(): WishlistStoreDocument {
  return {
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  };
}

export async function runMigrateTaskPersistence(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const direction = typeof args.direction === "string" ? args.direction.trim() : "";
  const dryRun = args.dryRun === true;
  if (direction === "sqlite-to-json") {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "sqlite-to-json was removed in v0.40.0 — use backup-planning-sqlite for a portable .db copy; see docs/maintainers/runbooks/task-persistence-operator.md"
    };
  }
  if (direction === "sqlite-blob-to-relational") {
    const dbRel = planningSqliteDatabaseRelativePath(ctx);
    const dual = new SqliteDualPlanningStore(ctx.workspacePath, dbRel);
    if (!fsSync.existsSync(dual.dbPath)) {
      return {
        ok: false,
        code: "storage-write-error",
        message: `SQLite database not found at ${dual.dbPath} — nothing to migrate`
      };
    }
    dual.loadFromDisk();
    if (dual.relationalTasksEnabled) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "Planning database already uses relational task rows (relational_tasks=1)"
      };
    }
    const taskCount = dual.taskDocument.tasks.length;
    const transitionCount = dual.taskDocument.transitionLog.length;
    const mutationCount = (dual.taskDocument.mutationLog ?? []).length;
    if (dryRun) {
      return {
        ok: true,
        code: "migrate-dry-run",
        message: "Dry run: would copy task bodies into task_engine_tasks and enable relational_tasks",
        data: {
          dbPath: dual.dbPath,
          taskCount,
          transitionCount,
          mutationCount
        }
      };
    }
    try {
      dual.enableRelationalPersistenceAndPersist();
    } catch (err) {
      return {
        ok: false,
        code: "storage-write-error",
        message: `Relational migration failed: ${(err as Error).message}`
      };
    }
    const verify = new SqliteDualPlanningStore(ctx.workspacePath, dbRel);
    verify.loadFromDisk();
    if (!verify.relationalTasksEnabled) {
      return {
        ok: false,
        code: "storage-write-error",
        message: "Relational migration verification failed: relational_tasks not set after persist"
      };
    }
    if (verify.taskDocument.tasks.length !== taskCount) {
      return {
        ok: false,
        code: "storage-write-error",
        message: `Relational migration verification failed: task count ${verify.taskDocument.tasks.length} !== ${taskCount}`
      };
    }
    return {
      ok: true,
      code: "migrated-sqlite-blob-to-relational",
      message: `Migrated ${taskCount} task(s) to relational rows at ${dual.dbPath}`,
      data: { dbPath: dual.dbPath, taskCount }
    };
  }

  if (direction !== "json-to-sqlite" && direction !== "json-to-unified-sqlite") {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "migrate-task-persistence requires direction: 'json-to-sqlite' | 'json-to-unified-sqlite' | 'sqlite-blob-to-relational'"
    };
  }
  const force = args.force === true;

  const taskRel = planningTaskStoreRelativePath(ctx) ?? DEFAULT_TASK_STORE_PATH;
  const wishRel = planningWishlistStoreRelativePath(ctx) ?? DEFAULT_WISHLIST_PATH;
  const taskPath = path.resolve(ctx.workspacePath, taskRel);
  const wishPath = path.resolve(ctx.workspacePath, wishRel);
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dual = new SqliteDualPlanningStore(ctx.workspacePath, dbRel);

  if (fsSync.existsSync(dual.dbPath) && !force) {
    return {
      ok: false,
      code: "storage-write-error",
      message: `SQLite database already exists at ${dual.dbPath} (pass force:true to overwrite)`
    };
  }

  let taskDoc = emptyTaskDoc();
  try {
    const raw = await fs.readFile(taskPath, "utf8");
    taskDoc = normalizeTaskStoreDocumentFromUnknown(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      taskDoc = emptyTaskDoc();
    } else if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    } else {
      return {
        ok: false,
        code: "import-parse-error",
        message: `Failed to read task JSON: ${(err as Error).message}`
      };
    }
  }

  let wishDoc = emptyWishDoc();
  try {
    const raw = await fs.readFile(wishPath, "utf8");
    const parsed = JSON.parse(raw) as WishlistStoreDocument;
    if (parsed.schemaVersion !== 1) {
      throw new TaskEngineError("import-parse-error", `Unsupported wishlist schema ${parsed.schemaVersion}`);
    }
    if (!Array.isArray(parsed.items)) {
      throw new TaskEngineError("import-parse-error", "Wishlist items must be an array");
    }
    wishDoc = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      wishDoc = emptyWishDoc();
    } else if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    } else {
      return {
        ok: false,
        code: "import-parse-error",
        message: `Failed to read wishlist JSON: ${(err as Error).message}`
      };
    }
  }

  if (dryRun) {
    return {
      ok: true,
      code: "migrate-dry-run",
      message:
        direction === "json-to-unified-sqlite"
          ? "Dry run: would import JSON task/wishlist documents into unified SQLite module state"
          : "Dry run: would import JSON task/wishlist documents into SQLite",
      data: {
        dbPath: dual.dbPath,
        taskPath,
        wishPath,
        taskCount: taskDoc.tasks.length,
        wishlistCount: wishDoc.items.length
      }
    };
  }

  if (direction === "json-to-unified-sqlite") {
    try {
      const unified = new UnifiedStateDb(ctx.workspacePath, dbRel);
      unified.setModuleState("task-engine", 1, {
        taskStore: taskDoc,
        wishlistStore: wishDoc
      });
    } catch (err) {
      return {
        ok: false,
        code: "storage-write-error",
        message: `Failed to write unified SQLite module state: ${(err as Error).message}`
      };
    }
    return {
      ok: true,
      code: "migrated-json-to-unified-sqlite",
      message: `Imported task and wishlist JSON into unified module state at ${dual.dbPath}`,
      data: { dbPath: dual.dbPath, taskPath, wishPath, moduleId: "task-engine" }
    };
  }

  dual.seedFromDocuments(taskDoc, wishDoc);
  try {
    dual.persistSync();
  } catch (err) {
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to write SQLite database: ${(err as Error).message}`
    };
  }

  return {
    ok: true,
    code: "migrated-json-to-sqlite",
    message: `Imported task and wishlist JSON into ${dual.dbPath}`,
    data: { dbPath: dual.dbPath, taskPath, wishPath }
  };
}
