import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import {
  applyTaskStateEvent,
  createEmptyTaskStateProjection,
  materializeTaskStoreDocument,
  replayTaskStateEvents
} from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import { readTaskStateEventLogJsonl, resolveTaskStateEventLogPath } from "../task-state-events/task-state-event-log-io.js";
import {
  openPlanningStoresForTaskStateCache,
  persistTaskStateProjectionDocument,
  resolveGitHeadSha,
  upsertProjectionMetaAfterApply
} from "./task-state-cache-runtime-shared.js";
import { readTaskStateProjectionMeta, taskStateProjectionMetaTableAvailable } from "./task-state-projection-meta-store.js";

function sortBySequence(events: TaskStateEventV1[]): TaskStateEventV1[] {
  return [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

function maxSequence(events: TaskStateEventV1[]): number {
  let max = 0;
  for (const event of events) {
    if (event.sequence > max) {
      max = event.sequence;
    }
  }
  return max;
}

function replayTailOntoPrior(
  priorEvents: TaskStateEventV1[],
  tailEvents: TaskStateEventV1[]
):
  | { ok: true; document: ReturnType<typeof materializeTaskStoreDocument>; lastSequence: number }
  | { ok: false; code: string; message: string } {
  const priorReplay =
    priorEvents.length > 0
      ? replayTaskStateEvents(priorEvents)
      : {
          ok: true as const,
          result: {
            projection: createEmptyTaskStateProjection(),
            document: materializeTaskStoreDocument(createEmptyTaskStateProjection())
          }
        };
  if (!priorReplay.ok) {
    return {
      ok: false,
      code: "task-state-event-replay-failed",
      message: `prior stream replay failed: ${priorReplay.error.message}`
    };
  }

  let projection = priorReplay.result.projection;
  for (const event of tailEvents) {
    const applied = applyTaskStateEvent(projection, event);
    if (!applied.ok) {
      return {
        ok: false,
        code: "task-state-event-replay-failed",
        message: `tail apply failed at ${event.eventId}: ${applied.error.message}`
      };
    }
    projection = applied.projection;
  }

  return {
    ok: true,
    document: materializeTaskStoreDocument(projection),
    lastSequence: projection.lastEventSequence
  };
}

/** Apply only canonical events with sequence greater than projection metadata. */
export async function runApplyTaskStateEvents(
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

  const allEvents = sortBySequence(admitted.events);
  const logMaxSequence = maxSequence(allEvents);

  const planningPreview = await openPlanningStoresForTaskStateCache(ctx);
  const db = planningPreview.sqliteDual.getDatabase();
  const meta = taskStateProjectionMetaTableAvailable(db) ? readTaskStateProjectionMeta(db) : null;
  const appliedSequence = meta?.appliedSequence ?? 0;

  if (appliedSequence > logMaxSequence && allEvents.length > 0) {
    return {
      ok: false,
      code: "task-state-projection-ahead-of-log",
      message: `Projection appliedSequence ${appliedSequence} is ahead of log max sequence ${logMaxSequence}; run rebuild-task-state-cache`,
      data: { schemaVersion: 1, eventLogPath: logPath, appliedSequence, logMaxSequence }
    };
  }

  const priorEvents = allEvents.filter((event) => event.sequence <= appliedSequence);
  const tailEvents = allEvents.filter((event) => event.sequence > appliedSequence);

  if (tailEvents.length === 0) {
    return {
      ok: true,
      code: "task-state-events-already-current",
      message: `Projection already at sequence ${appliedSequence}; no tail events to apply`,
      data: {
        schemaVersion: 1,
        dryRun,
        eventLogPath: logPath,
        appliedSequence,
        logMaxSequence,
        tailEventCount: 0,
        sourceCommit: resolveGitHeadSha(ctx.workspacePath),
        projectionMeta: meta
      }
    };
  }

  const tailAdmission = admitTaskStateEventStream(tailEvents, { priorEvents });
  if (!tailAdmission.ok) {
    return {
      ok: false,
      code: "task-state-event-admission-rejected",
      message: tailAdmission.error.message,
      data: {
        schemaVersion: 1,
        eventLogPath: logPath,
        admissionCode: tailAdmission.error.code,
        appliedSequence,
        tailEventCount: tailEvents.length
      }
    };
  }

  const replayed = replayTailOntoPrior(priorEvents, tailAdmission.events);
  if (!replayed.ok) {
    return {
      ok: false,
      code: replayed.code,
      message: replayed.message,
      data: { schemaVersion: 1, eventLogPath: logPath, appliedSequence, tailEventCount: tailEvents.length }
    };
  }

  const sourceCommit = resolveGitHeadSha(ctx.workspacePath);
  const newAppliedSequence = replayed.lastSequence;
  const preview = {
    schemaVersion: 1,
    dryRun,
    eventLogPath: logPath,
    priorEventCount: priorEvents.length,
    tailEventCount: tailEvents.length,
    appliedSequenceBefore: appliedSequence,
    appliedSequenceAfter: newAppliedSequence,
    taskCount: replayed.document.tasks.length,
    sourceCommit
  };

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-events-apply-dry-run",
      message: `Dry run: would apply ${tailEvents.length} tail event(s)`,
      data: preview
    };
  }

  persistTaskStateProjectionDocument(planningPreview, replayed.document, { persistScope: "full" });
  const projectionMeta = upsertProjectionMetaAfterApply(planningPreview, {
    appliedSequence: newAppliedSequence,
    sourceCommit,
    syncStatus: "fresh",
    updatedAt: replayed.document.lastUpdated
  });

  return {
    ok: true,
    code: "task-state-events-applied",
    message: `Applied ${tailEvents.length} tail event(s); projection now at sequence ${newAppliedSequence}`,
    data: {
      ...preview,
      planningGeneration: planningPreview.sqliteDual.getPlanningGeneration(),
      projectionMeta
    }
  };
}
