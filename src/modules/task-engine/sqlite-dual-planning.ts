import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { prepareKitSqliteDatabase } from "../../core/state/workspace-kit-sqlite.js";
import type { TaskStoreDocument } from "./types.js";
import type { WishlistStoreDocument } from "./wishlist-types.js";
import { TaskEngineError } from "./transitions.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";

function emptyTaskStoreDocument(): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  };
}

function emptyWishlistDocument(): WishlistStoreDocument {
  return {
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  };
}

type TableShape = "legacy-dual" | "task-only";

function detectTableShape(db: Database.Database): TableShape {
  const rows = db.prepare("PRAGMA table_info(workspace_planning_state)").all() as { name: string }[];
  if (rows.some((r) => r.name === "wishlist_store_json")) {
    return "legacy-dual";
  }
  return "task-only";
}

/** Single-file SQLite backing for task JSON document; legacy rows may include a second wishlist blob until migrated. */
export class SqliteDualPlanningStore {
  private db: Database.Database | null = null;
  readonly dbPath: string;
  private _taskDoc: TaskStoreDocument;
  private _wishlistDoc: WishlistStoreDocument;
  private _tableShape: TableShape = "task-only";

  constructor(workspacePath: string, databaseRelativePath: string) {
    this.dbPath = path.resolve(workspacePath, databaseRelativePath);
    this._taskDoc = emptyTaskStoreDocument();
    this._wishlistDoc = emptyWishlistDocument();
  }

  get taskDocument(): TaskStoreDocument {
    return this._taskDoc;
  }

  get wishlistDocument(): WishlistStoreDocument {
    return this._wishlistDoc;
  }

  get tableShape(): TableShape {
    return this._tableShape;
  }

  getDisplayPath(): string {
    return this.dbPath;
  }

  private ensureDb(): Database.Database {
    if (this.db) {
      return this.db;
    }
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    prepareKitSqliteDatabase(this.db);
    this._tableShape = detectTableShape(this.db);
    return this.db;
  }

  /** Load documents from an existing database file; otherwise start empty (no file created). */
  loadFromDisk(): void {
    if (!fs.existsSync(this.dbPath)) {
      this._taskDoc = emptyTaskStoreDocument();
      this._wishlistDoc = emptyWishlistDocument();
      this._tableShape = "task-only";
      return;
    }
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);

    if (this._tableShape === "legacy-dual") {
      const row = db
        .prepare(
          "SELECT task_store_json, wishlist_store_json FROM workspace_planning_state WHERE id = 1"
        )
        .get() as { task_store_json: string; wishlist_store_json: string } | undefined;
      if (!row) {
        this._taskDoc = emptyTaskStoreDocument();
        this._wishlistDoc = emptyWishlistDocument();
        return;
      }
      try {
        const taskParsed = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
        const wishParsed = JSON.parse(row.wishlist_store_json) as WishlistStoreDocument;
        if (wishParsed.schemaVersion !== 1) {
          throw new TaskEngineError(
            "storage-read-error",
            `Unsupported wishlist schema in SQLite: ${wishParsed.schemaVersion}`
          );
        }
        if (!Array.isArray(wishParsed.items)) {
          throw new TaskEngineError("storage-read-error", "Wishlist items missing in SQLite row");
        }
        this._taskDoc = taskParsed;
        this._wishlistDoc = wishParsed;
      } catch (err) {
        if (err instanceof TaskEngineError) {
          throw err;
        }
        throw new TaskEngineError(
          "storage-read-error",
          `Failed to parse SQLite planning row: ${(err as Error).message}`
        );
      }
      return;
    }

    const row = db
      .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
      .get() as { task_store_json: string } | undefined;
    if (!row) {
      this._taskDoc = emptyTaskStoreDocument();
      this._wishlistDoc = emptyWishlistDocument();
      return;
    }
    try {
      const taskParsed = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
      this._taskDoc = taskParsed;
      this._wishlistDoc = emptyWishlistDocument();
    } catch (err) {
      if (err instanceof TaskEngineError) {
        throw err;
      }
      throw new TaskEngineError(
        "storage-read-error",
        `Failed to parse SQLite planning row: ${(err as Error).message}`
      );
    }
  }

  /** Replace in-memory documents (used by migrate). */
  seedFromDocuments(taskDoc: TaskStoreDocument, wishlistDoc: WishlistStoreDocument): void {
    this._taskDoc = taskDoc;
    this._wishlistDoc = wishlistDoc;
  }

  persistSync(): void {
    this._taskDoc.lastUpdated = new Date().toISOString();
    this._wishlistDoc.lastUpdated = new Date().toISOString();
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    const t = JSON.stringify(this._taskDoc);
    if (this._tableShape === "legacy-dual") {
      const w = JSON.stringify(this._wishlistDoc);
      const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
        | { ok: number }
        | undefined;
      if (exists) {
        db.prepare(
          "UPDATE workspace_planning_state SET task_store_json = ?, wishlist_store_json = ? WHERE id = 1"
        ).run(t, w);
      } else {
        db.prepare(
          "INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json) VALUES (1, ?, ?)"
        ).run(t, w);
      }
      return;
    }

    const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
      | { ok: number }
      | undefined;
    if (exists) {
      db.prepare("UPDATE workspace_planning_state SET task_store_json = ? WHERE id = 1").run(t);
    } else {
      db.prepare("INSERT INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)").run(t);
    }
  }

  /** Run synchronous work inside one SQLite transaction and flush blob(s) at the end. */
  withTransaction(work: () => void): void {
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    const txn = db.transaction(() => {
      work();
      this._taskDoc.lastUpdated = new Date().toISOString();
      this._wishlistDoc.lastUpdated = new Date().toISOString();
      const t = JSON.stringify(this._taskDoc);
      if (this._tableShape === "legacy-dual") {
        const w = JSON.stringify(this._wishlistDoc);
        const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
          | { ok: number }
          | undefined;
        if (exists) {
          db.prepare(
            "UPDATE workspace_planning_state SET task_store_json = ?, wishlist_store_json = ? WHERE id = 1"
          ).run(t, w);
        } else {
          db.prepare(
            "INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json) VALUES (1, ?, ?)"
          ).run(t, w);
        }
      } else {
        const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
          | { ok: number }
          | undefined;
        if (exists) {
          db.prepare("UPDATE workspace_planning_state SET task_store_json = ? WHERE id = 1").run(t);
        } else {
          db.prepare("INSERT INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)").run(t);
        }
      }
    });
    txn();
  }

  /**
   * Drop legacy `wishlist_store_json` column by recreating the table (task JSON only).
   * Caller must persist an empty wishlist document first if migrating off legacy data.
   */
  migrateToTaskOnlyTableSchema(): void {
    const db = this.ensureDb();
    if (detectTableShape(db) !== "legacy-dual") {
      this._tableShape = "task-only";
      return;
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_planning_state_new (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        task_store_json TEXT NOT NULL
      );
    `);
    const row = db
      .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
      .get() as { task_store_json: string } | undefined;
    const taskJson = row?.task_store_json ?? JSON.stringify(emptyTaskStoreDocument());
    db.prepare("INSERT OR REPLACE INTO workspace_planning_state_new (id, task_store_json) VALUES (1, ?)").run(
      taskJson
    );
    db.exec("DROP TABLE workspace_planning_state");
    db.exec("ALTER TABLE workspace_planning_state_new RENAME TO workspace_planning_state");
    this._tableShape = "task-only";
    this._wishlistDoc = emptyWishlistDocument();
  }
}
