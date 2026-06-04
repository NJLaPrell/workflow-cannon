import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { runDashboardSummaryCommand } from "./task-engine-dashboard-on-command.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { buildQueueGitAlignmentReport, probeGitHead } from "../queue/queue-git-alignment.js";
import { buildQueueHealthReport } from "../queue/queue-health.js";
import {
  loadTasksFromSnapshotFile,
  parseTasksFromSnapshotPayload,
  replayQueueFromTasks
} from "../queue/replay-queue-snapshot.js";
import { readQueueNamespaceArg } from "../queue-namespace-args.js";
import type { TaskEntity } from "../types.js";
import {
  decodeListTasksCursor,
  encodeListTasksCursor,
  listTaskIsAfterCursor,
  listTasksComparator
} from "../list-tasks-pagination.js";
import { projectTaskReadEntity } from "../task-read-projections.js";
import { buildFeatureEnrichmentBySlug, loadTaskFeatureLinkMap } from "../persistence/feature-registry-queries.js";
import { rowToTaskEntity, type TaskEngineTaskRow } from "../persistence/sqlite-task-row-mapping.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../../core/state/kit-sqlite/planning-sqlite-kernel.js";
import { inferTaskPhaseKey } from "../phase-resolution.js";

/**
 * Dashboard + queue diagnostics that do not mutate task rows.
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolveQueueDashboardReadoutCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};

  if (command.name === "dashboard-summary") {
    return runDashboardSummaryCommand(
      ctx,
      store,
      planning.sqliteDual.getPlanningGeneration(),
      planning.sqliteDual,
      args
    );
  }

  if (command.name === "dashboard-terminal-rows" || command.name === "dashboard-terminal-tasks") {
    const status = typeof args.status === "string" ? args.status : "completed";
    if (status !== "completed" && status !== "cancelled") {
      return {
        ok: false,
        code: "invalid-run-args",
        message: `${command.name} status must be either completed or cancelled`
      };
    }
    const phaseKey = typeof args.phaseKey === "string" ? args.phaseKey.trim() : undefined;
    const limitRaw = args.limit;
    const limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
    const cursor = typeof args.cursor === "string" && args.cursor.trim().length > 0 ? args.cursor.trim() : undefined;

    let pageTasks: TaskEntity[] = [];
    let hasMore = false;

    if (planning.sqliteDual && planning.sqliteDual.relationalTasksEnabled) {
      try {
        const db = planning.sqliteDual.getDatabase();
        let query = `SELECT * FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status = ? AND archived = 0`;
        const params: any[] = [status];
        if (phaseKey && phaseKey !== "__no_phase__") {
          query += ` AND phase_key = ?`;
          params.push(phaseKey);
        } else if (phaseKey === "__no_phase__") {
          query += ` AND (phase_key IS NULL OR phase_key = '')`;
        }
        const cursorDecoded = cursor ? decodeListTasksCursor(cursor) : null;
        if (cursorDecoded) {
          query += ` AND (updated_at < ? OR (updated_at = ? AND CAST(SUBSTR(id, 2) AS INTEGER) > CAST(SUBSTR(?, 2) AS INTEGER)))`;
          params.push(cursorDecoded.u, cursorDecoded.u, cursorDecoded.i);
        }
        query += ` ORDER BY updated_at DESC, CAST(SUBSTR(id, 2) AS INTEGER) ASC LIMIT ?`;
        params.push(limit + 1);

        const rows = db.prepare(query).all(...params) as TaskEngineTaskRow[];
        const linkMap = loadTaskFeatureLinkMap(db);
        const mapped = rows.map((r) => rowToTaskEntity(r, { taskFeatureLinkMap: linkMap }));
        if (mapped.length > limit) {
          pageTasks = mapped.slice(0, limit);
          hasMore = true;
        } else {
          pageTasks = mapped;
        }
      } catch (err) {
        // Fallback to memory
        pageTasks = [];
      }
    }

    if (pageTasks.length === 0) {
      let filtered = store.getActiveTasks().filter((t) => t.status === status);
      if (phaseKey && phaseKey !== "__no_phase__") {
        filtered = filtered.filter((t) => inferTaskPhaseKey(t) === phaseKey);
      } else if (phaseKey === "__no_phase__") {
        filtered = filtered.filter((t) => inferTaskPhaseKey(t) === null);
      }
      filtered.sort(listTasksComparator);
      const cursorDecoded = cursor ? decodeListTasksCursor(cursor) : null;
      if (cursorDecoded) {
        filtered = filtered.filter((t) => listTaskIsAfterCursor(t, cursorDecoded));
      }
      if (filtered.length > limit) {
        pageTasks = filtered.slice(0, limit);
        hasMore = true;
      } else {
        pageTasks = filtered;
      }
    }

    const nextCursor = hasMore && pageTasks.length > 0 ? encodeListTasksCursor(pageTasks[pageTasks.length - 1]!) : undefined;
    const enrich = buildFeatureEnrichmentBySlug(planning.sqliteDual.getDatabase());
    const projectedPage = pageTasks.map((task) => projectTaskReadEntity(task, enrich));

    return {
      ok: true,
      code: command.name,
      message: `Found ${projectedPage.length} terminal tasks`,
      data: {
        tasks: projectedPage,
        count: projectedPage.length,
        scope: "tasks-only",
        ...(nextCursor !== undefined ? { nextCursor } : {})
      }
    };
  }

  if (command.name === "queue-health") {
    const tasks = store.getActiveTasks();
    const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
    const report = buildQueueHealthReport({
      tasks,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus
    });
    return {
      ok: true,
      code: "queue-health",
      message: `Queue health: ${report.summary.readyCount} ready; ${report.summary.misalignedPhaseCount} phase mismatches / behind-current; ${report.summary.scheduledFuturePhaseCount} scheduled future-phase; ${report.summary.blockedByDependenciesCount} ready with unmet dependencies`,
      data: report as unknown as Record<string, unknown>
    };
  }

  if (command.name === "queue-git-alignment") {
    const staleRaw = args.staleInProgressDays;
    const staleInProgressDays =
      typeof staleRaw === "number" && Number.isFinite(staleRaw) && staleRaw > 0
        ? Math.min(Math.floor(staleRaw), 3650)
        : undefined;
    const report = buildQueueGitAlignmentReport({
      workspacePath: ctx.workspacePath,
      tasks: store.getActiveTasks(),
      transitionLog: store.getTransitionLog(),
      storeLastUpdated: store.getLastUpdated(),
      git: probeGitHead(ctx.workspacePath),
      staleInProgressDays
    });
    return {
      ok: true,
      code: "queue-git-alignment",
      message: report.summary,
      data: report as unknown as Record<string, unknown>
    };
  }

  if (command.name === "replay-queue-snapshot") {
    const ns = readQueueNamespaceArg(args);
    let taskList: TaskEntity[];
    try {
      const snapPath =
        typeof args.snapshotRelativePath === "string" ? args.snapshotRelativePath.trim() : "";
      if (snapPath) {
        taskList = await loadTasksFromSnapshotFile(ctx.workspacePath, snapPath);
      } else if (Array.isArray(args.tasks)) {
        taskList = parseTasksFromSnapshotPayload({ tasks: args.tasks });
      } else {
        return {
          ok: false,
          code: "invalid-task-schema",
          message: "replay-queue-snapshot requires snapshotRelativePath (repo-relative) or tasks[] array"
        };
      }
    } catch (e) {
      return {
        ok: false,
        code: "import-parse-error",
        message: (e as Error).message
      };
    }
    const data = replayQueueFromTasks(taskList, ns ? { queueNamespace: ns } : undefined);
    return {
      ok: true,
      code: "queue-replay",
      message: `Replayed ${data.taskCount} tasks (read-only)`,
      data: data as unknown as Record<string, unknown>
    };
  }

  return null;
}
