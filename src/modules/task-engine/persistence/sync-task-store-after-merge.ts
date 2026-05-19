import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { openPlanningStores } from "./planning-open.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { TaskStore } from "./store.js";
import { TransitionService } from "../service.js";
import type { TransitionEvidence } from "../types.js";

export type TaskStoreSyncDiff = {
  taskId: string;
  sourceStatus: string;
  targetStatus: string;
  missingTransitions: TransitionEvidence[];
};

export type TaskStoreSyncReport = {
  schemaVersion: 1;
  sourceRef: string;
  targetRef: string;
  databaseRelativePath: string;
  taskCountSource: number;
  taskCountTarget: number;
  diffs: TaskStoreSyncDiff[];
  missingTransitionCount: number;
};

function transitionDedupeKey(entry: TransitionEvidence): string {
  return entry.clientMutationId ?? `${entry.taskId}|${entry.action}|${entry.timestamp}|${entry.toState}`;
}

export function materializeGitRefDatabase(
  workspacePath: string,
  gitRef: string,
  databaseRelativePath: string
): string {
  const spec = `${gitRef}:${databaseRelativePath}`;
  let bytes: Buffer;
  try {
    bytes = execFileSync("git", ["-C", workspacePath, "show", spec], {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (e) {
    throw new Error(`git show ${spec} failed: ${(e as Error).message}`);
  }
  const tmpPath = path.join(
    os.tmpdir(),
    `wk-task-store-sync-${process.pid}-${Date.now()}.db`
  );
  fs.writeFileSync(tmpPath, bytes);
  return tmpPath;
}

function loadStoreFromDatabasePath(workspacePath: string, dbAbs: string): {
  store: TaskStore;
  dual: SqliteDualPlanningStore;
  cleanup: () => void;
} {
  const dual = new SqliteDualPlanningStore(workspacePath, path.relative(workspacePath, dbAbs));
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  return {
    store,
    dual,
    cleanup: () => {
      /* SqliteDualPlanningStore does not expose close; temp files are unlinked by caller. */
    }
  };
}

export async function buildTaskStoreSyncReport(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown>;
  sourceRef: string;
  targetRef?: string;
}): Promise<{ report: TaskStoreSyncReport; sourceTempPath: string | null }> {
  const ctx = {
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig
  } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const sourceTemp =
    args.sourceRef === "working-tree" || args.sourceRef === "@"
      ? null
      : materializeGitRefDatabase(args.workspacePath, args.sourceRef, dbRel);

  const sourceDbAbs = sourceTemp ?? path.resolve(args.workspacePath, dbRel);
  const source = loadStoreFromDatabasePath(args.workspacePath, sourceDbAbs);
  await source.store.load();

  const targetPlanning = await openPlanningStores(ctx);
  await targetPlanning.taskStore.load();

  const targetLog = targetPlanning.taskStore.getTransitionLog();
  const targetKeys = new Set(targetLog.map(transitionDedupeKey));
  const targetTasks = new Map(targetPlanning.taskStore.getAllTasks().map((t) => [t.id, t]));

  const sourceTasks = source.store.getAllTasks();
  const sourceLog = source.store.getTransitionLog();
  const diffs: TaskStoreSyncDiff[] = [];

  for (const task of sourceTasks) {
    const targetTask = targetTasks.get(task.id);
    if (!targetTask) {
      continue;
    }
    const missing = sourceLog
      .filter((e) => e.taskId === task.id)
      .filter((e) => !targetKeys.has(transitionDedupeKey(e)))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (missing.length === 0 && targetTask.status === task.status) {
      continue;
    }
    if (missing.length > 0 || targetTask.status !== task.status) {
      diffs.push({
        taskId: task.id,
        sourceStatus: task.status,
        targetStatus: targetTask.status,
        missingTransitions: missing
      });
    }
  }

  source.cleanup();
  if (sourceTemp) {
    try {
      fs.unlinkSync(sourceTemp);
    } catch {
      /* best-effort */
    }
  }

  const missingTransitionCount = diffs.reduce((n, d) => n + d.missingTransitions.length, 0);
  return {
    report: {
      schemaVersion: 1,
      sourceRef: args.sourceRef,
      targetRef: args.targetRef ?? "working-tree",
      databaseRelativePath: dbRel,
      taskCountSource: sourceTasks.length,
      taskCountTarget: targetTasks.size,
      diffs,
      missingTransitionCount
    },
    sourceTempPath: null
  };
}

export async function applyTaskStoreSyncReport(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown>;
  sourceRef: string;
  dryRun?: boolean;
}): Promise<{ report: TaskStoreSyncReport; applied: number; skipped: number }> {
  const ctx = {
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig
  } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const sourceTemp = materializeGitRefDatabase(args.workspacePath, args.sourceRef, dbRel);
  const source = loadStoreFromDatabasePath(args.workspacePath, sourceTemp);
  await source.store.load();

  const targetPlanning = await openPlanningStores(ctx);
  await targetPlanning.taskStore.load();
  const transitionService = new TransitionService(targetPlanning.taskStore);

  const targetKeys = new Set(targetPlanning.taskStore.getTransitionLog().map(transitionDedupeKey));
  const sourceLog = source.store.getTransitionLog();
  const missing = sourceLog
    .filter((e) => !targetKeys.has(transitionDedupeKey(e)))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let applied = 0;
  let skipped = 0;
  if (!args.dryRun) {
    for (const entry of missing) {
      try {
        await transitionService.runTransition({
          taskId: entry.taskId,
          action: entry.action,
          actor: entry.actor,
          clientMutationId: entry.clientMutationId
        });
        applied += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  source.cleanup();
  try {
    fs.unlinkSync(sourceTemp);
  } catch {
    /* best-effort */
  }

  const { report } = await buildTaskStoreSyncReport({
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig,
    sourceRef: args.sourceRef
  });
  return { report, applied: args.dryRun ? 0 : applied, skipped };
}

export function probeTaskStoreShaAtGitRef(
  workspacePath: string,
  gitRef: string,
  databaseRelativePath: string
): string | null {
  try {
    return execFileSync("git", ["-C", workspacePath, "rev-parse", `${gitRef}:${databaseRelativePath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .trim()
      .split(/\s+/)[0];
  } catch {
    return null;
  }
}

export function hashWorkingTreeTaskStore(workspacePath: string, databaseRelativePath: string): string | null {
  const dbAbs = path.resolve(workspacePath, databaseRelativePath);
  if (!fs.existsSync(dbAbs)) {
    return null;
  }
  try {
    return execFileSync("git", ["-C", workspacePath, "hash-object", dbAbs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .trim()
      .split(/\s+/)[0];
  } catch {
    return null;
  }
}
