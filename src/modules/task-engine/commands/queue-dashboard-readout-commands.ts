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
      planning.sqliteDual
    );
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
      message: `Queue health: ${report.summary.readyCount} ready; ${report.summary.misalignedPhaseCount} phase mismatches; ${report.summary.blockedByDependenciesCount} ready with unmet dependencies`,
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
