import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import {
  applyTaskStateEvent,
  createEmptyTaskStateProjection,
  materializeTaskStoreDocument,
  replayTaskStateEvents
} from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";
import { readTaskStateEventLogJsonl, resolveTaskStateEventLogPath } from "../task-state-events/task-state-event-log-io.js";
import { validateCanonicalStateEvent } from "../task-state-events/validate-canonical-event.js";
import { buildCheckpointTaskProjectionFromStore } from "../task-state-git/snapshot-projection.js";
import {
  openPlanningStoresForTaskStateCache,
  persistTaskStateProjectionDocument,
  resolveGitHeadSha,
  upsertProjectionMetaAfterApply
} from "./task-state-cache-runtime-shared.js";
import { maxRawSequenceFromEventLog } from "./task-state-projection-health.js";
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

function parseCanonicalEventsFromRaw(rawEvents: unknown[]): CanonicalStateEventV1[] {
  const events: CanonicalStateEventV1[] = [];
  for (const raw of rawEvents) {
    const validated = validateCanonicalStateEvent(raw);
    if (validated.ok) {
      events.push(validated.data);
    }
  }
  return [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

function parseTaskStateEventsFromRaw(
  rawEvents: unknown[]
):
  | { ok: true; events: TaskStateEventV1[] }
  | { ok: false; code: string; message: string } {
  const events: TaskStateEventV1[] = [];
  for (const raw of rawEvents) {
    const validated = validateCanonicalStateEvent(raw);
    if (!validated.ok) {
      return {
        ok: false,
        code: "schema-validation-failed",
        message: "event failed JSON schema validation",
      };
    }
    if (isTaskStateEvent(validated.data)) {
      events.push(validated.data);
    }
  }
  return { ok: true, events: sortBySequence(events) };
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

function replayTailOntoCheckpoint(
  checkpoint: TaskStateProjectionV1,
  tailEvents: TaskStateEventV1[]
):
  | { ok: true; document: ReturnType<typeof materializeTaskStoreDocument>; lastSequence: number }
  | { ok: false; code: string; message: string } {
  let projection = {
    ...checkpoint,
    tasksById: { ...checkpoint.tasksById },
    transitionLog: [...checkpoint.transitionLog],
    mutationLog: [...checkpoint.mutationLog],
    taskVersions: [...checkpoint.taskVersions]
  };
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
  const rawMaxSequence = maxRawSequenceFromEventLog(rawEvents);

  const planningPreview = await openPlanningStoresForTaskStateCache(ctx);
  const db = planningPreview.sqliteDual.getDatabase();
  const meta = taskStateProjectionMetaTableAvailable(db) ? readTaskStateProjectionMeta(db) : null;
  const appliedSequence = meta?.appliedSequence ?? 0;

  if (appliedSequence > rawMaxSequence && rawEvents.length > 0) {
    return {
      ok: false,
      code: "task-state-projection-ahead-of-log",
      message: `Projection appliedSequence ${appliedSequence} is ahead of log max sequence ${rawMaxSequence}; run rebuild-task-state-cache`,
      data: { schemaVersion: 1, eventLogPath: logPath, appliedSequence, logMaxSequence: rawMaxSequence }
    };
  }

  if (rawEvents.length > 0 && appliedSequence >= rawMaxSequence) {
    return {
      ok: true,
      code: "task-state-events-already-current",
      message: `Projection already at sequence ${appliedSequence}; no tail events to apply`,
      data: {
        schemaVersion: 1,
        dryRun,
        eventLogPath: logPath,
        appliedSequence,
        logMaxSequence: rawMaxSequence,
        tailEventCount: 0,
        sourceCommit: resolveGitHeadSha(ctx.workspacePath),
        projectionMeta: meta
      }
    };
  }

  const admitted = admitTaskStateEventStream(rawEvents);
  let allEvents: TaskStateEventV1[];
  let useCheckpointTail = false;

  if (!admitted.ok) {
    const parsed = parseTaskStateEventsFromRaw(rawEvents);
    if (!parsed.ok) {
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
    allEvents = parsed.events;
    useCheckpointTail = true;
  } else {
    allEvents = sortBySequence(admitted.events);
  }

  const logMaxSequence = useCheckpointTail ? rawMaxSequence : maxSequence(allEvents);
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

  const checkpoint = useCheckpointTail
    ? buildCheckpointTaskProjectionFromStore(
        planningPreview.sqliteDual.taskDocument,
        appliedSequence,
        priorEvents
      )
    : undefined;

  const tailAdmission = admitTaskStateEventStream(tailEvents, {
    priorEvents: useCheckpointTail
      ? parseCanonicalEventsFromRaw(rawEvents).filter((event) => event.sequence <= appliedSequence)
      : priorEvents,
    checkpointTaskProjection: checkpoint
  });
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

  const replayed = useCheckpointTail
    ? replayTailOntoCheckpoint(checkpoint!, tailAdmission.events)
    : replayTailOntoPrior(priorEvents, tailAdmission.events);
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
