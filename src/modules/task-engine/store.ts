import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { TaskEntity, TaskMutationEvidence, TaskStoreDocument, TransitionEvidence } from "./types.js";
import { TaskEngineError } from "./transitions.js";

const DEFAULT_STORE_PATH = ".workspace-kit/tasks/state.json";

function emptyStore(): TaskStoreDocument {
  return {
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  };
}

export class TaskStore {
  private document: TaskStoreDocument;
  private readonly filePath: string;

  constructor(workspacePath: string, storePath?: string) {
    this.filePath = path.resolve(workspacePath, storePath ?? DEFAULT_STORE_PATH);
    this.document = emptyStore();
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TaskStoreDocument;
      if (parsed.schemaVersion !== 1) {
        throw new TaskEngineError(
          "storage-read-error",
          `Unsupported schema version: ${parsed.schemaVersion}`
        );
      }
      this.document = parsed;
      if (!Array.isArray(this.document.mutationLog)) {
        this.document.mutationLog = [];
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.document = emptyStore();
        return;
      }
      if (err instanceof TaskEngineError) throw err;
      throw new TaskEngineError(
        "storage-read-error",
        `Failed to read task store: ${(err as Error).message}`
      );
    }
  }

  async save(): Promise<void> {
    this.document.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    const tmpPath = `${this.filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(this.document, null, 2) + "\n", "utf8");
      await fs.rename(tmpPath, this.filePath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* cleanup best-effort */ }
      throw new TaskEngineError(
        "storage-write-error",
        `Failed to write task store: ${(err as Error).message}`
      );
    }
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
    return this.filePath;
  }

  getLastUpdated(): string {
    return this.document.lastUpdated;
  }
}
