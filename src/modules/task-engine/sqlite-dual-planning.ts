import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  prepareKitSqliteDatabase,
  TASK_ENGINE_TASKS_TABLE,
  kitSqliteHasRelationalTaskDdl
} from "../../core/state/workspace-kit-sqlite.js";
import type { TaskStoreDocument } from "./types.js";
import type { WishlistStoreDocument } from "./wishlist-types.js";
import { TaskEngineError } from "./transitions.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";
import {
  relationalBlobMirror,
  rowToTaskEntity,
  taskEntityToRow,
  type TaskEngineTaskRow
} from "./sqlite-task-row-mapping.js";

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

function planningStateColumnSet(db: Database.Database): Set<string> {
  const rows = db.prepare("PRAGMA table_info(workspace_planning_state)").all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function readRelationalFlagFromRow(row: Record<string, unknown> | undefined): boolean {
  if (!row) {
    return false;
  }
  const v = row.relational_tasks;
  if (typeof v === "number") {
    return v === 1;
  }
  if (typeof v === "bigint") {
    return Number(v) === 1;
  }
  return false;
}

/** Single-file SQLite backing for task JSON document; legacy rows may include a second wishlist blob until migrated. */
export class SqliteDualPlanningStore {
  private db: Database.Database | null = null;
  readonly dbPath: string;
  private _taskDoc: TaskStoreDocument;
  private _wishlistDoc: WishlistStoreDocument;
  private _tableShape: TableShape = "task-only";
  /** When true, load/save tasks via task_engine_tasks + envelope log columns. */
  private _relationalTasks = false;

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

  /** True when this DB uses relational task rows (not blob-only for task bodies). */
  get relationalTasksEnabled(): boolean {
    return this._relationalTasks;
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

  private loadRelationalTasks(db: Database.Database): void {
    const rows = db.prepare(`SELECT * FROM ${TASK_ENGINE_TASKS_TABLE} ORDER BY id ASC`).all() as TaskEngineTaskRow[];
    this._taskDoc.tasks = rows.map((r) => rowToTaskEntity(r));
  }

  private parseLogs(transitionJson: string, mutationJson: string): void {
    try {
      const tl = JSON.parse(transitionJson) as unknown;
      if (!Array.isArray(tl)) {
        throw new TaskEngineError("storage-read-error", "transition_log_json must be a JSON array");
      }
      this._taskDoc.transitionLog = tl as TaskStoreDocument["transitionLog"];
    } catch (e) {
      if (e instanceof TaskEngineError) {
        throw e;
      }
      throw new TaskEngineError(
        "storage-read-error",
        `Failed to parse transition_log_json: ${(e as Error).message}`
      );
    }
    try {
      const ml = JSON.parse(mutationJson) as unknown;
      if (!Array.isArray(ml)) {
        throw new TaskEngineError("storage-read-error", "mutation_log_json must be a JSON array");
      }
      this._taskDoc.mutationLog = ml as TaskStoreDocument["mutationLog"];
    } catch (e) {
      if (e instanceof TaskEngineError) {
        throw e;
      }
      throw new TaskEngineError(
        "storage-read-error",
        `Failed to parse mutation_log_json: ${(e as Error).message}`
      );
    }
  }

  /** Load documents from an existing database file; otherwise start empty (no file created). */
  loadFromDisk(): void {
    if (!fs.existsSync(this.dbPath)) {
      this._taskDoc = emptyTaskStoreDocument();
      this._wishlistDoc = emptyWishlistDocument();
      this._tableShape = "task-only";
      this._relationalTasks = false;
      return;
    }
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    const hasRel = kitSqliteHasRelationalTaskDdl(db);

    if (this._tableShape === "legacy-dual") {
      const pcols = planningStateColumnSet(db);
      const hasEnvelope = pcols.has("relational_tasks") && pcols.has("transition_log_json");
      const row = hasEnvelope
        ? (db
            .prepare(
              "SELECT task_store_json, wishlist_store_json, transition_log_json, mutation_log_json, relational_tasks FROM workspace_planning_state WHERE id = 1"
            )
            .get() as Record<string, unknown> | undefined)
        : (db
            .prepare("SELECT task_store_json, wishlist_store_json FROM workspace_planning_state WHERE id = 1")
            .get() as Record<string, unknown> | undefined);
      if (!row) {
        this._taskDoc = emptyTaskStoreDocument();
        this._wishlistDoc = emptyWishlistDocument();
        this._relationalTasks = false;
        return;
      }
      const useRel = hasRel && hasEnvelope && readRelationalFlagFromRow(row);
      this._relationalTasks = useRel;
      try {
        if (useRel) {
          const tj = row.task_store_json;
          if (typeof tj !== "string") {
            throw new TaskEngineError("storage-read-error", "task_store_json missing");
          }
          const stub = normalizeTaskStoreDocumentFromUnknown(JSON.parse(tj));
          this._taskDoc = { ...stub, tasks: [] };
          this.loadRelationalTasks(db);
          const tr = row.transition_log_json;
          const mj = row.mutation_log_json;
          if (typeof tr !== "string" || typeof mj !== "string") {
            throw new TaskEngineError("storage-read-error", "envelope log columns missing");
          }
          this.parseLogs(tr, mj);
        } else {
          const taskParsed = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json as string));
          const wishParsed = JSON.parse(row.wishlist_store_json as string) as WishlistStoreDocument;
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
        }
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

    const pcols = planningStateColumnSet(db);
    const hasEnvelope = hasRel && pcols.has("relational_tasks") && pcols.has("transition_log_json");
    const cols = hasEnvelope
      ? "task_store_json, transition_log_json, mutation_log_json, relational_tasks"
      : "task_store_json";
    const row = db.prepare(`SELECT ${cols} FROM workspace_planning_state WHERE id = 1`).get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      this._taskDoc = emptyTaskStoreDocument();
      this._wishlistDoc = emptyWishlistDocument();
      this._relationalTasks = false;
      return;
    }
    try {
      const useRel = hasEnvelope && readRelationalFlagFromRow(row);
      this._relationalTasks = useRel;
      if (useRel) {
        const stub = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json as string));
        this._taskDoc = { ...stub, tasks: [] };
        this.loadRelationalTasks(db);
        this.parseLogs(row.transition_log_json as string, row.mutation_log_json as string);
      } else {
        this._taskDoc = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json as string));
        this._wishlistDoc = emptyWishlistDocument();
      }
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

  /** Switch to relational persistence and flush current in-memory task document + wishlist (transactional). */
  enableRelationalPersistenceAndPersist(): void {
    if (this._relationalTasks) {
      return;
    }
    this._relationalTasks = true;
    this.persistSync();
  }

  private persistRelational(db: Database.Database): void {
    const mirror = relationalBlobMirror(this._taskDoc);
    const blobJson = JSON.stringify(mirror);
    const tr = JSON.stringify(this._taskDoc.transitionLog);
    const ml = JSON.stringify(this._taskDoc.mutationLog ?? []);
    const insertSql = `
      INSERT OR REPLACE INTO ${TASK_ENGINE_TASKS_TABLE} (
        id, status, type, title, created_at, updated_at, archived, archived_at,
        priority, phase, phase_key, ownership, approach,
        depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
        summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const insert = db.prepare(insertSql);
    db.prepare(`DELETE FROM ${TASK_ENGINE_TASKS_TABLE}`).run();
    for (const t of this._taskDoc.tasks) {
      const r = taskEntityToRow(t);
      insert.run(
        r.id,
        r.status,
        r.type,
        r.title,
        r.created_at,
        r.updated_at,
        r.archived,
        r.archived_at,
        r.priority,
        r.phase,
        r.phase_key,
        r.ownership,
        r.approach,
        r.depends_on_json,
        r.unblocks_json,
        r.technical_scope_json,
        r.acceptance_criteria_json,
        r.summary,
        r.description,
        r.risk,
        r.queue_namespace,
        r.evidence_key,
        r.evidence_kind,
        r.metadata_json
      );
    }

    if (this._tableShape === "legacy-dual") {
      const w = JSON.stringify(this._wishlistDoc);
      const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
        | { ok: number }
        | undefined;
      if (exists) {
        db.prepare(
          `UPDATE workspace_planning_state SET task_store_json = ?, wishlist_store_json = ?, transition_log_json = ?, mutation_log_json = ?, relational_tasks = 1 WHERE id = 1`
        ).run(blobJson, w, tr, ml);
      } else {
        db.prepare(
          `INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json, transition_log_json, mutation_log_json, relational_tasks) VALUES (1, ?, ?, ?, ?, 1)`
        ).run(blobJson, w, tr, ml);
      }
      return;
    }

    const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
      | { ok: number }
      | undefined;
    if (exists) {
      db.prepare(
        `UPDATE workspace_planning_state SET task_store_json = ?, transition_log_json = ?, mutation_log_json = ?, relational_tasks = 1 WHERE id = 1`
      ).run(blobJson, tr, ml);
    } else {
      db.prepare(
        `INSERT INTO workspace_planning_state (id, task_store_json, transition_log_json, mutation_log_json, relational_tasks) VALUES (1, ?, ?, ?, 1)`
      ).run(blobJson, tr, ml);
    }
  }

  private persistBlobOnly(db: Database.Database): void {
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

  persistSync(): void {
    this._taskDoc.lastUpdated = new Date().toISOString();
    this._wishlistDoc.lastUpdated = new Date().toISOString();
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    if (this._relationalTasks && kitSqliteHasRelationalTaskDdl(db)) {
      db.transaction(() => this.persistRelational(db))();
    } else {
      this.persistBlobOnly(db);
    }
  }

  /** Run synchronous work inside one SQLite transaction and flush at the end. */
  withTransaction(work: () => void): void {
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    const txn = db.transaction(() => {
      work();
      this._taskDoc.lastUpdated = new Date().toISOString();
      this._wishlistDoc.lastUpdated = new Date().toISOString();
      if (this._relationalTasks && kitSqliteHasRelationalTaskDdl(db)) {
        this.persistRelational(db);
      } else {
        this.persistBlobOnly(db);
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
    const hasRel = kitSqliteHasRelationalTaskDdl(db);
    const oldRow = hasRel
      ? (db
          .prepare(
            "SELECT task_store_json, transition_log_json, mutation_log_json, relational_tasks FROM workspace_planning_state WHERE id = 1"
          )
          .get() as
          | {
              task_store_json: string;
              transition_log_json: string;
              mutation_log_json: string;
              relational_tasks: number;
            }
          | undefined)
      : undefined;
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_planning_state_new (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        task_store_json TEXT NOT NULL
      );
    `);
    if (hasRel) {
      db.exec(
        "ALTER TABLE workspace_planning_state_new ADD COLUMN transition_log_json TEXT NOT NULL DEFAULT '[]'"
      );
      db.exec(
        "ALTER TABLE workspace_planning_state_new ADD COLUMN mutation_log_json TEXT NOT NULL DEFAULT '[]'"
      );
      db.exec(
        "ALTER TABLE workspace_planning_state_new ADD COLUMN relational_tasks INTEGER NOT NULL DEFAULT 0"
      );
    }
    const row = db
      .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
      .get() as { task_store_json: string } | undefined;
    const taskJson = row?.task_store_json ?? JSON.stringify(emptyTaskStoreDocument());
    if (hasRel) {
      db.prepare(
        "INSERT OR REPLACE INTO workspace_planning_state_new (id, task_store_json, transition_log_json, mutation_log_json, relational_tasks) VALUES (1, ?, ?, ?, ?)"
      ).run(
        taskJson,
        oldRow?.transition_log_json ?? "[]",
        oldRow?.mutation_log_json ?? "[]",
        oldRow?.relational_tasks ?? 0
      );
    } else {
      db.prepare("INSERT OR REPLACE INTO workspace_planning_state_new (id, task_store_json) VALUES (1, ?)").run(
        taskJson
      );
    }
    db.exec("DROP TABLE workspace_planning_state");
    db.exec("ALTER TABLE workspace_planning_state_new RENAME TO workspace_planning_state");
    this._tableShape = "task-only";
    this._wishlistDoc = emptyWishlistDocument();
  }
}
