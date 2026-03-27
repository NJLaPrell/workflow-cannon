import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { TaskStoreDocument } from "./types.js";
import type { WishlistStoreDocument } from "./wishlist-types.js";
import { TaskEngineError } from "./transitions.js";

const DDL = `
CREATE TABLE IF NOT EXISTS workspace_planning_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_store_json TEXT NOT NULL,
  wishlist_store_json TEXT NOT NULL
);
`;

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

/** Single-file SQLite backing for task + wishlist JSON documents (atomic convert-wishlist). */
export class SqliteDualPlanningStore {
  private db: Database.Database | null = null;
  readonly dbPath: string;
  private _taskDoc: TaskStoreDocument;
  private _wishlistDoc: WishlistStoreDocument;

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

  getDisplayPath(): string {
    return this.dbPath;
  }

  private ensureDb(): Database.Database {
    if (!this.db) {
      const dir = path.dirname(this.dbPath);
      fs.mkdirSync(dir, { recursive: true });
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.exec(DDL);
    }
    return this.db;
  }

  /** Load documents from an existing database file; otherwise start empty (no file created). */
  loadFromDisk(): void {
    if (!fs.existsSync(this.dbPath)) {
      this._taskDoc = emptyTaskStoreDocument();
      this._wishlistDoc = emptyWishlistDocument();
      return;
    }
    const db = this.ensureDb();
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
      const taskParsed = JSON.parse(row.task_store_json) as TaskStoreDocument;
      const wishParsed = JSON.parse(row.wishlist_store_json) as WishlistStoreDocument;
      if (taskParsed.schemaVersion !== 1) {
        throw new TaskEngineError(
          "storage-read-error",
          `Unsupported task store schema in SQLite: ${taskParsed.schemaVersion}`
        );
      }
      if (wishParsed.schemaVersion !== 1) {
        throw new TaskEngineError(
          "storage-read-error",
          `Unsupported wishlist schema in SQLite: ${wishParsed.schemaVersion}`
        );
      }
      if (!Array.isArray(taskParsed.mutationLog)) {
        taskParsed.mutationLog = [];
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
    const t = JSON.stringify(this._taskDoc);
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
  }

  /** Run synchronous work inside one SQLite transaction and flush both blobs at the end. */
  withTransaction(work: () => void): void {
    const db = this.ensureDb();
    const txn = db.transaction(() => {
      work();
      this._taskDoc.lastUpdated = new Date().toISOString();
      this._wishlistDoc.lastUpdated = new Date().toISOString();
      const t = JSON.stringify(this._taskDoc);
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
    });
    txn();
  }
}
