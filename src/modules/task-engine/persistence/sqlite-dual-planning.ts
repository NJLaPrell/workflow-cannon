import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  prepareKitSqliteDatabase,
  TASK_ENGINE_DEPENDENCIES_TABLE,
  TASK_ENGINE_TASKS_TABLE,
  kitSqliteHasRelationalTaskDdl
} from "../../../core/state/workspace-kit-sqlite.js";
import type { TaskStoreDocument } from "../types.js";
import type { WishlistStoreDocument } from "../wishlist/wishlist-types.js";
import { TaskEngineError } from "../transitions.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";
import {
  relationalBlobMirror,
  rowToTaskEntity,
  taskEntityToRow,
  type TaskEngineTaskRow
} from "./sqlite-task-row-mapping.js";
import { syncWorkspaceKitStatusFromYamlIfNeeded } from "./workspace-status-yaml-import.js";
import {
  featureRegistryActiveOnConnection,
  loadTaskFeatureLinkMap,
  replaceAllTaskFeatureLinks
} from "./feature-registry-queries.js";

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

function dependencyTableAvailable(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(TASK_ENGINE_DEPENDENCIES_TABLE) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

function dependencyProjection(tasks: TaskStoreDocument["tasks"]): {
  dependsOnByTask: Map<string, string[]>;
  unblocksByTask: Map<string, string[]>;
} {
  const dependsOnByTask = new Map<string, string[]>();
  const unblocksByTask = new Map<string, string[]>();
  for (const task of tasks) {
    const deps = [...new Set(task.dependsOn ?? [])].sort();
    dependsOnByTask.set(task.id, deps);
    for (const dep of deps) {
      const list = unblocksByTask.get(dep) ?? [];
      list.push(task.id);
      unblocksByTask.set(dep, list);
    }
  }
  for (const [taskId, list] of unblocksByTask) {
    unblocksByTask.set(taskId, [...new Set(list)].sort());
  }
  return { dependsOnByTask, unblocksByTask };
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

/** Single-file SQLite backing for task JSON document; legacy rows may include wishlist_store_json until collapsed on store open. */
export class SqliteDualPlanningStore {
  private db: Database.Database | null = null;
  readonly dbPath: string;
  private readonly _workspaceRoot: string;
  private _taskDoc: TaskStoreDocument;
  private _wishlistDoc: WishlistStoreDocument;
  private _tableShape: TableShape = "task-only";
  /** When true, load/save tasks via task_engine_tasks + envelope log columns. */
  private _relationalTasks = false;
  /** Monotonic optimistic-lock counter for unified planning SQLite row (tasks + wishlist + logs). */
  private _planningGeneration = 0;

  constructor(workspacePath: string, databaseRelativePath: string) {
    this._workspaceRoot = path.resolve(workspacePath);
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

  /** Current planning generation (SQLite `workspace_planning_state.planning_generation`). */
  getPlanningGeneration(): number {
    return this._planningGeneration;
  }

  getDisplayPath(): string {
    return this.dbPath;
  }

  /** Opened SQLite handle (creates file + migrations as needed). For read-only helpers (feature registry). */
  getDatabase(): Database.Database {
    return this.ensureDb();
  }

  /**
   * Close the SQLite handle if open. Use when another code path must reopen the same `dbPath`
   * in-process (avoids multi-handle races on the same file).
   */
  closeDatabase(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* best-effort */
      }
      this.db = null;
    }
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

  private refreshPlanningGenFromOpenDb(db: Database.Database): void {
    const cols = planningStateColumnSet(db);
    if (!cols.has("planning_generation")) {
      this._planningGeneration = 0;
      return;
    }
    const row = db
      .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
      .get() as { g: number } | undefined;
    this._planningGeneration = row !== undefined ? Number(row.g) || 0 : 0;
  }

  private loadRelationalTasks(db: Database.Database): void {
    const rows = db.prepare(`SELECT * FROM ${TASK_ENGINE_TASKS_TABLE} ORDER BY id ASC`).all() as TaskEngineTaskRow[];
    const linkMap = loadTaskFeatureLinkMap(db);
    const tasks = rows.map((r) => rowToTaskEntity(r, { taskFeatureLinkMap: linkMap }));
    if (dependencyTableAvailable(db)) {
      const depRows = db
        .prepare(
          `SELECT task_id AS taskId, depends_on_task_id AS dependsOnTaskId FROM ${TASK_ENGINE_DEPENDENCIES_TABLE} ORDER BY task_id ASC, depends_on_task_id ASC`
        )
        .all() as Array<{ taskId: string; dependsOnTaskId: string }>;
      const dependsOnByTask = new Map<string, string[]>();
      const unblocksByTask = new Map<string, string[]>();
      for (const row of depRows) {
        const deps = dependsOnByTask.get(row.taskId) ?? [];
        deps.push(row.dependsOnTaskId);
        dependsOnByTask.set(row.taskId, deps);
        const unblocks = unblocksByTask.get(row.dependsOnTaskId) ?? [];
        unblocks.push(row.taskId);
        unblocksByTask.set(row.dependsOnTaskId, unblocks);
      }
      for (const task of tasks) {
        const deps = [...new Set(dependsOnByTask.get(task.id) ?? [])].sort();
        const unblocks = [...new Set(unblocksByTask.get(task.id) ?? [])].sort();
        if (deps.length > 0) {
          task.dependsOn = deps;
        } else {
          delete task.dependsOn;
        }
        if (unblocks.length > 0) {
          task.unblocks = unblocks;
        } else {
          delete task.unblocks;
        }
      }
    }
    this._taskDoc.tasks = tasks;
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
      this._planningGeneration = 0;
      return;
    }
    const db = this.ensureDb();
    syncWorkspaceKitStatusFromYamlIfNeeded(this._workspaceRoot, db);
    try {
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
    } finally {
      this.refreshPlanningGenFromOpenDb(db);
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

  private runPersistMutation(
    db: Database.Database,
    options: { expectedPlanningGeneration?: number },
    work?: () => void
  ): void {
    const pcols = planningStateColumnSet(db);
    if (!pcols.has("planning_generation")) {
      throw new TaskEngineError(
        "storage-write-error",
        "workspace_planning_state missing planning_generation column; upgrade workspace-kit and reopen the database"
      );
    }
    let currentGen = 0;
    const gRow = db
      .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
      .get() as { g: number } | undefined;
    if (gRow !== undefined) {
      currentGen = Number(gRow.g) || 0;
    }
    if (
      options.expectedPlanningGeneration !== undefined &&
      options.expectedPlanningGeneration !== currentGen
    ) {
      throw new TaskEngineError(
        "planning-generation-mismatch",
        `expectedPlanningGeneration ${options.expectedPlanningGeneration} does not match current planning generation ${currentGen}`
      );
    }
    if (work) {
      work();
    }
    this._taskDoc.lastUpdated = new Date().toISOString();
    this._wishlistDoc.lastUpdated = new Date().toISOString();
    const nextGen = currentGen + 1;
    if (this._relationalTasks && kitSqliteHasRelationalTaskDdl(db)) {
      this.persistRelational(db, nextGen);
    } else {
      this.persistBlobOnly(db, nextGen);
    }
    this._planningGeneration = nextGen;
  }

  private persistRelational(db: Database.Database, nextPlanningGeneration: number): void {
    const projection = dependencyProjection(this._taskDoc.tasks);
    const mirror = relationalBlobMirror(this._taskDoc);
    const blobJson = JSON.stringify(mirror);
    const tr = JSON.stringify(this._taskDoc.transitionLog);
    const ml = JSON.stringify(this._taskDoc.mutationLog ?? []);
    const insertSql = `
      INSERT OR REPLACE INTO ${TASK_ENGINE_TASKS_TABLE} (
        id, status, type, title, created_at, updated_at, archived, archived_at,
        priority, phase, phase_key, ownership, approach,
        depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
        summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json, features_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const insert = db.prepare(insertSql);
    const registry = featureRegistryActiveOnConnection(db);
    if (dependencyTableAvailable(db)) {
      db.prepare(`DELETE FROM ${TASK_ENGINE_DEPENDENCIES_TABLE}`).run();
    }
    db.prepare(`DELETE FROM ${TASK_ENGINE_TASKS_TABLE}`).run();
    for (const t of this._taskDoc.tasks) {
      const compatTask = { ...t, unblocks: projection.unblocksByTask.get(t.id) ?? [] };
      const r = taskEntityToRow(compatTask, registry ? { omitFeaturesJson: true } : undefined);
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
        r.metadata_json,
        r.features_json ?? "[]"
      );
    }
    if (dependencyTableAvailable(db)) {
      const insertDependency = db.prepare(
        `INSERT OR IGNORE INTO ${TASK_ENGINE_DEPENDENCIES_TABLE} (task_id, depends_on_task_id, created_at, source) VALUES (?, ?, ?, 'dependsOn')`
      );
      const now = new Date().toISOString();
      for (const [taskId, deps] of projection.dependsOnByTask) {
        for (const depId of deps) {
          insertDependency.run(taskId, depId, now);
        }
      }
    }
    if (registry) {
      replaceAllTaskFeatureLinks(db, this._taskDoc.tasks);
    }

    if (this._tableShape === "legacy-dual") {
      const w = JSON.stringify(this._wishlistDoc);
      const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
        | { ok: number }
        | undefined;
      if (exists) {
        db.prepare(
          `UPDATE workspace_planning_state SET task_store_json = ?, wishlist_store_json = ?, transition_log_json = ?, mutation_log_json = ?, relational_tasks = 1, planning_generation = ? WHERE id = 1`
        ).run(blobJson, w, tr, ml, nextPlanningGeneration);
      } else {
        db.prepare(
          `INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json, transition_log_json, mutation_log_json, relational_tasks, planning_generation) VALUES (1, ?, ?, ?, ?, 1, ?)`
        ).run(blobJson, w, tr, ml, nextPlanningGeneration);
      }
      return;
    }

    const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
      | { ok: number }
      | undefined;
    if (exists) {
      db.prepare(
        `UPDATE workspace_planning_state SET task_store_json = ?, transition_log_json = ?, mutation_log_json = ?, relational_tasks = 1, planning_generation = ? WHERE id = 1`
      ).run(blobJson, tr, ml, nextPlanningGeneration);
    } else {
      db.prepare(
        `INSERT INTO workspace_planning_state (id, task_store_json, transition_log_json, mutation_log_json, relational_tasks, planning_generation) VALUES (1, ?, ?, ?, 1, ?)`
      ).run(blobJson, tr, ml, nextPlanningGeneration);
    }
  }

  private persistBlobOnly(db: Database.Database, nextPlanningGeneration: number): void {
    const t = JSON.stringify(this._taskDoc);
    if (this._tableShape === "legacy-dual") {
      const w = JSON.stringify(this._wishlistDoc);
      const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
        | { ok: number }
        | undefined;
      if (exists) {
        db.prepare(
          "UPDATE workspace_planning_state SET task_store_json = ?, wishlist_store_json = ?, planning_generation = ? WHERE id = 1"
        ).run(t, w, nextPlanningGeneration);
      } else {
        db.prepare(
          "INSERT INTO workspace_planning_state (id, task_store_json, wishlist_store_json, planning_generation) VALUES (1, ?, ?, ?)"
        ).run(t, w, nextPlanningGeneration);
      }
      return;
    }

    const exists = db.prepare("SELECT 1 AS ok FROM workspace_planning_state WHERE id = 1").get() as
      | { ok: number }
      | undefined;
    if (exists) {
      db.prepare("UPDATE workspace_planning_state SET task_store_json = ?, planning_generation = ? WHERE id = 1").run(
        t,
        nextPlanningGeneration
      );
    } else {
      db.prepare(
        "INSERT INTO workspace_planning_state (id, task_store_json, planning_generation) VALUES (1, ?, ?)"
      ).run(t, nextPlanningGeneration);
    }
  }

  persistSync(options?: { expectedPlanningGeneration?: number }): void {
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    db.transaction(() => this.runPersistMutation(db, options ?? {})).immediate();
  }

  /**
   * Run synchronous work inside one SQLite transaction, then flush with planning generation bump.
   * Pass `expectedPlanningGeneration` when using optimistic concurrency (must match row before work runs).
   */
  withTransaction(work: () => void, options?: { expectedPlanningGeneration?: number }): void {
    const db = this.ensureDb();
    this._tableShape = detectTableShape(db);
    db.transaction(() => this.runPersistMutation(db, options ?? {}, work)).immediate();
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
    const oldTableCols = planningStateColumnSet(db);
    let preservedPlanningGen = 0;
    if (oldTableCols.has("planning_generation")) {
      const gr = db
        .prepare("SELECT planning_generation AS g FROM workspace_planning_state WHERE id = 1")
        .get() as { g: number } | undefined;
      preservedPlanningGen = gr !== undefined ? Number(gr.g) || 0 : 0;
    }
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
    db.exec(
      "ALTER TABLE workspace_planning_state_new ADD COLUMN planning_generation INTEGER NOT NULL DEFAULT 0"
    );
    const row = db
      .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
      .get() as { task_store_json: string } | undefined;
    const taskJson = row?.task_store_json ?? JSON.stringify(emptyTaskStoreDocument());
    if (hasRel) {
      db.prepare(
        "INSERT OR REPLACE INTO workspace_planning_state_new (id, task_store_json, transition_log_json, mutation_log_json, relational_tasks, planning_generation) VALUES (1, ?, ?, ?, ?, ?)"
      ).run(
        taskJson,
        oldRow?.transition_log_json ?? "[]",
        oldRow?.mutation_log_json ?? "[]",
        oldRow?.relational_tasks ?? 0,
        preservedPlanningGen
      );
    } else {
      db.prepare(
        "INSERT OR REPLACE INTO workspace_planning_state_new (id, task_store_json, planning_generation) VALUES (1, ?, ?)"
      ).run(taskJson, preservedPlanningGen);
    }
    db.exec("DROP TABLE workspace_planning_state");
    db.exec("ALTER TABLE workspace_planning_state_new RENAME TO workspace_planning_state");
    this._tableShape = "task-only";
    this._wishlistDoc = emptyWishlistDocument();
  }
}
