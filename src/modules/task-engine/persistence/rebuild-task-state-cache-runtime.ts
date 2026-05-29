import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { admitCanonicalStateEventStream } from "../task-state-events/canonical-event-admission.js";
import { replayCanonicalStateEvents } from "../task-state-events/canonical-replay.js";
import { materializeTaskStoreDocument } from "../task-state-events/event-applier.js";
import { persistPlanningProjectionToSqlite } from "../task-state-events/planning-sqlite-persist.js";
import { readTaskStateEventLogJsonl, resolveTaskStateEventLogPath } from "../task-state-events/task-state-event-log-io.js";
import {
  openPlanningStoresForTaskStateCache,
  persistTaskStateProjectionDocument,
  resolveGitHeadSha,
  upsertProjectionMetaAfterApply
} from "./task-state-cache-runtime-shared.js";
import { enabledPlanningSyncDomainSet } from "./planning-canonical-sync-domains.js";

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

  const admitted = admitCanonicalStateEventStream(rawEvents);
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

  const enabledDomains = enabledPlanningSyncDomainSet(ctx);
  const replayed = replayCanonicalStateEvents(admitted.events, { enabledDomains });
  if (!replayed.ok) {
    return {
      ok: false,
      code: "task-state-event-replay-failed",
      message: replayed.message,
      data: {
        schemaVersion: 1,
        eventLogPath: logPath,
        replayCode: replayed.code
      }
    };
  }

  const document = materializeTaskStoreDocument(replayed.result.taskProjection);
  const lastSequence = replayed.result.lastEventSequence;
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
  const planningEventCount = admitted.events.filter(
    (e) => typeof e === "object" && e !== null && "kind" in e && String((e as { kind: string }).kind).startsWith("planning.")
  ).length;
  persistPlanningProjectionToSqlite(planning.sqliteDual.getDatabase(), replayed.result.planningProjection, {
    replaceCatalog: planningEventCount > 0,
    enabledDomains
  });
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
