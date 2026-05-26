import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import { replayTaskStateEvents } from "../task-state-events/event-applier.js";
import { readTaskStateEventLogJsonl, resolveTaskStateEventLogPath } from "../task-state-events/task-state-event-log-io.js";
import {
  openPlanningStoresForTaskStateCache,
  persistTaskStateProjectionDocument,
  resolveGitHeadSha,
  upsertProjectionMetaAfterApply
} from "./task-state-cache-runtime-shared.js";

export async function runRebuildTaskStateCache(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const eventLogRelativePath =
    typeof args.eventLogRelativePath === "string" && args.eventLogRelativePath.trim()
      ? args.eventLogRelativePath.trim()
      : undefined;
  const logPath = resolveTaskStateEventLogPath(ctx.workspacePath, eventLogRelativePath);
  const rawEvents = readTaskStateEventLogJsonl(ctx.workspacePath, eventLogRelativePath);

  const admitted = admitTaskStateEventStream(rawEvents);
  if (!admitted.ok) {
    return {
      ok: false,
      code: "task-state-event-admission-rejected",
      message: admitted.error.message,
      data: {
        schemaVersion: 1,
        eventLogPath: logPath,
        admissionCode: admitted.error.code,
        details: admitted.error.details
      }
    };
  }

  const replayed = replayTaskStateEvents(admitted.events);
  if (!replayed.ok) {
    return {
      ok: false,
      code: "task-state-event-replay-failed",
      message: replayed.error.message,
      data: {
        schemaVersion: 1,
        eventLogPath: logPath,
        replayCode: replayed.error.code
      }
    };
  }

  const document = replayed.result.document;
  const lastSequence = replayed.result.projection.lastEventSequence;
  const sourceCommit = resolveGitHeadSha(ctx.workspacePath);
  const preview = {
    schemaVersion: 1,
    dryRun,
    eventLogPath: logPath,
    eventCount: admitted.events.length,
    taskCount: document.tasks.length,
    transitionLogCount: document.transitionLog.length,
    mutationLogCount: document.mutationLog?.length ?? 0,
    appliedSequence: lastSequence,
    sourceCommit
  };

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-cache-rebuild-dry-run",
      message: "Dry run: would rebuild SQLite projection from canonical event log",
      data: preview
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  persistTaskStateProjectionDocument(planning, document);
  const projectionMeta = upsertProjectionMetaAfterApply(planning, {
    appliedSequence: lastSequence,
    sourceCommit,
    syncStatus: admitted.events.length > 0 ? "fresh" : "empty",
    updatedAt: document.lastUpdated
  });

  return {
    ok: true,
    code: "task-state-cache-rebuilt",
    message: "Rebuilt local SQLite task projection from canonical event log",
    data: {
      ...preview,
      planningGeneration: planning.sqliteDual.getPlanningGeneration(),
      projectionMeta
    }
  };
}
