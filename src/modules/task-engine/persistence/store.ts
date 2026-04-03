import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { TaskEntity, TaskMutationEvidence, TaskStoreDocument, TransitionEvidence } from "../types.js";
import { TaskEngineError } from "../transitions.js";
import type { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";

export const DEFAULT_TASK_STORE_PATH = ".workspace-kit/tasks/state.json";

function emptyStore(): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  };
}

export type TaskStoreSaveOptions = {
  expectedPlanningGeneration?: number;
};

export type TaskStorePersistence = {
  loadDocument: () => Promise<TaskStoreDocument>;
  saveDocument: (doc: TaskStoreDocument, opts?: TaskStoreSaveOptions) => Promise<void>;
  pathLabel: string;
};

export class TaskStore {
  private document: TaskStoreDocument;
  private readonly persistence: TaskStorePersistence;

  constructor(persistence: TaskStorePersistence) {
    this.persistence = persistence;
    this.document = emptyStore();
  }

  static forJsonFile(workspacePath: string, storeRelativePath?: string): TaskStore {
    const filePath = path.resolve(workspacePath, storeRelativePath ?? DEFAULT_TASK_STORE_PATH);
    return new TaskStore({
      pathLabel: filePath,
      loadDocument: async () => {
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw) as unknown;
          return normalizeTaskStoreDocumentFromUnknown(parsed);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return emptyStore();
          }
          if (err instanceof TaskEngineError) {
            throw err;
          }
          throw new TaskEngineError(
            "storage-read-error",
            `Failed to read task store: ${(err as Error).message}`
          );
        }
      },
      saveDocument: async (doc, _opts) => {
        const dir = path.dirname(filePath);
        const tmpPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
        try {
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
          await fs.rename(tmpPath, filePath);
        } catch (err) {
          try {
            await fs.unlink(tmpPath);
          } catch {
            /* cleanup best-effort */
          }
          throw new TaskEngineError(
            "storage-write-error",
            `Failed to write task store: ${(err as Error).message}`
          );
        }
      }
    });
  }

  static forSqliteDual(dual: SqliteDualPlanningStore): TaskStore {
    return new TaskStore({
      pathLabel: `${dual.getDisplayPath()}#task_engine`,
      loadDocument: async () => dual.taskDocument,
      saveDocument: async (doc, opts) => {
        dual.seedFromDocuments(doc, dual.wishlistDocument);
        dual.persistSync(opts);
      }
    });
  }

  async load(): Promise<void> {
    this.document = await this.persistence.loadDocument();
  }

  async save(opts?: TaskStoreSaveOptions): Promise<void> {
    this.document.lastUpdated = new Date().toISOString();
    await this.persistence.saveDocument(this.document, opts);
  }

  getAllTasks(): TaskEntity[] {
    return [...this.document.tasks];
  }

  getActiveTasks(): TaskEntity[] {
    return this.document.tasks.filter((task) => !task.archived).map((task) => ({ ...task }));
  }

  getTask(id: string): TaskEntity | undefined {
    return this.document.tasks.find((t) => t.id === id);
  }

  addTask(task: TaskEntity): void {
    if (this.document.tasks.some((t) => t.id === task.id)) {
      throw new TaskEngineError("duplicate-task-id", `Task '${task.id}' already exists`);
    }
    this.document.tasks.push({ ...task });
  }

  updateTask(task: TaskEntity): void {
    const idx = this.document.tasks.findIndex((t) => t.id === task.id);
    if (idx === -1) {
      throw new TaskEngineError("task-not-found", `Task '${task.id}' not found`);
    }
    this.document.tasks[idx] = { ...task };
  }

  addEvidence(evidence: TransitionEvidence): void {
    this.document.transitionLog.push(evidence);
  }

  addMutationEvidence(evidence: TaskMutationEvidence): void {
    if (!Array.isArray(this.document.mutationLog)) {
      this.document.mutationLog = [];
    }
    this.document.mutationLog.push(evidence);
  }

  getTransitionLog(): TransitionEvidence[] {
    return [...this.document.transitionLog];
  }

  getMutationLog(): TaskMutationEvidence[] {
    return [...(this.document.mutationLog ?? [])];
  }

  replaceAllTasks(tasks: TaskEntity[]): void {
    this.document.tasks = tasks.map((t) => ({ ...t }));
  }

  getFilePath(): string {
    return this.persistence.pathLabel;
  }

  getLastUpdated(): string {
    return this.document.lastUpdated;
  }
}
