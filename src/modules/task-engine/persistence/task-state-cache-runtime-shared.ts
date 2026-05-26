import { execFileSync } from "node:child_process";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TaskStoreDocument } from "../types.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import { openPlanningStores } from "./planning-open.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable,
  upsertTaskStateProjectionMeta,
  type TaskStateProjectionMeta,
  type TaskStateProjectionSyncStatus
} from "./task-state-projection-meta-store.js";

export function resolveGitHeadSha(workspacePath: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function openPlanningStoresForTaskStateCache(
  ctx: ModuleLifecycleContext
): Promise<OpenedPlanningStores> {
  return openPlanningStores(ctx);
}

export function persistTaskStateProjectionDocument(
  planning: OpenedPlanningStores,
  document: TaskStoreDocument,
  options?: { persistScope?: "full" | "incremental" }
): void {
  planning.sqliteDual.seedFromDocuments(document, planning.sqliteDual.wishlistDocument);
  if (!planning.sqliteDual.relationalTasksEnabled) {
    planning.sqliteDual.enableRelationalPersistenceAndPersist();
    return;
  }
  planning.sqliteDual.persistSync({ persistScope: options?.persistScope ?? "full" });
}

export function upsertProjectionMetaAfterApply(
  planning: OpenedPlanningStores,
  input: {
    appliedSequence: number;
    sourceCommit: string | null;
    syncStatus: TaskStateProjectionSyncStatus;
    updatedAt: string;
  }
): TaskStateProjectionMeta | null {
  const db = planning.sqliteDual.getDatabase();
  if (!taskStateProjectionMetaTableAvailable(db)) {
    return readTaskStateProjectionMeta(db);
  }
  return upsertTaskStateProjectionMeta(db, {
    backend: "git-event-log",
    appliedSequence: input.appliedSequence,
    sourceCommit: input.sourceCommit,
    projectionSchemaVersion: 1,
    syncStatus: input.syncStatus,
    updatedAt: input.updatedAt
  });
}
