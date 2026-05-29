import { gitShowText } from "./git-io.js";
import { resolveSnapshotContentRelativePath, resolveSnapshotMetaRelativePath } from "./layout.js";
import { readEventSegmentsJsonl, readTaskStateBranchLayout } from "./read-branch-layout.js";
import { taskVersionMapFromProjection } from "./publish-task-state-events.js";
import {
  projectionFromSnapshotContent,
  replayTailFromSnapshot,
  type TaskStateSnapshotContentV1
} from "./snapshot-projection.js";
import { validateTaskStateGitSnapshotMeta } from "./validate-snapshot-meta.js";
import {
  admitTaskStateEventStream,
  type TaskStateEventAdmissionError
} from "../task-state-events/event-admission.js";
import { admitCanonicalStateEventStream } from "../task-state-events/canonical-event-admission.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import { replayTaskStateEvents } from "../task-state-events/event-applier.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import {
  createEmptyPlanningStateProjection,
  replayPlanningStateEvents
} from "../task-state-events/planning-event-applier.js";
import { isPlanningStateEventKind, type PlanningStateEventV1 } from "../task-state-events/planning-event-payloads.js";
import type { PlanningStateProjectionV1 } from "../task-state-events/planning-projection-types.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";
import type { TaskStateGitManifestV1 } from "./types.js";

function readSnapshotContent(
  workspacePath: string,
  ref: string,
  snapshotId: string
): { ok: true; content: TaskStateSnapshotContentV1; throughSequence: number } | { ok: false } {
  const metaText = gitShowText(workspacePath, ref, resolveSnapshotMetaRelativePath(snapshotId));
  const contentText = gitShowText(workspacePath, ref, resolveSnapshotContentRelativePath(snapshotId));
  if (!metaText || !contentText) {
    return { ok: false };
  }
  const metaParsed = validateTaskStateGitSnapshotMeta(JSON.parse(metaText) as unknown);
  if (!metaParsed.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    content: JSON.parse(contentText) as TaskStateSnapshotContentV1,
    throughSequence: metaParsed.data.throughSequence
  };
}

/** Replay planning.* events from the full remote JSONL (not snapshot tail only). */
export function replayPlanningProjectionFromRawEvents(rawEvents: unknown[]): PlanningStateProjectionV1 {
  const planningEvents = rawEvents.filter((event): event is PlanningStateEventV1 => {
    return (
      event !== null &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      typeof (event as { kind?: unknown }).kind === "string" &&
      isPlanningStateEventKind(String((event as { kind: string }).kind))
    );
  });
  if (planningEvents.length === 0) {
    return createEmptyPlanningStateProjection();
  }
  const replayed = replayPlanningStateEvents(planningEvents);
  return replayed.ok ? replayed.projection : createEmptyPlanningStateProjection();
}

/** Admit remote JSONL events; lifecycle events require the bootstrap snapshot as replay seed. */
export function admitRemoteEventStream(
  workspacePath: string,
  ref: string,
  manifest: TaskStateGitManifestV1,
  rawEvents: unknown[]
): { ok: true; events: CanonicalStateEventV1[] } | { ok: false; error: TaskStateEventAdmissionError } {
  const snapshotId = manifest.head.latestSnapshotId;
  if (!snapshotId) {
    const admitted = admitCanonicalStateEventStream(rawEvents, {
      initialPlanningProjection: replayPlanningProjectionFromRawEvents([])
    });
    if (!admitted.ok) {
      return {
        ok: false,
        error: {
          code:
            admitted.error.code === "workspace-revision-mismatch" ? "replay-conflict" : (admitted.error.code as TaskStateEventAdmissionError["code"]),
          message: admitted.error.message,
          details: admitted.error.details
        }
      };
    }
    return { ok: true, events: admitted.events };
  }
  const snapshotRead = readSnapshotContent(workspacePath, ref, snapshotId);
  if (!snapshotRead.ok) {
    return {
      ok: false,
      error: {
        code: "schema-validation-failed",
        message: `snapshot '${snapshotId}' is missing or invalid on ${ref}`
      }
    };
  }
  const throughSequence = snapshotRead.throughSequence;
  const historicalEvents = rawEvents.filter((event) => {
    return (
      event !== null &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      typeof (event as { sequence?: unknown }).sequence === "number" &&
      (event as { sequence: number }).sequence <= throughSequence
    );
  });
  const tailEvents = rawEvents.filter((event) => {
    return (
      event !== null &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      typeof (event as { sequence?: unknown }).sequence === "number" &&
      (event as { sequence: number }).sequence > throughSequence
    );
  });
  const admitted = admitCanonicalStateEventStream(tailEvents, {
    initialTaskProjection: projectionFromSnapshotContent(snapshotRead.content),
    initialPlanningProjection: replayPlanningProjectionFromRawEvents(historicalEvents)
  });
  if (!admitted.ok) {
    return {
      ok: false,
      error: {
        code:
          admitted.error.code === "workspace-revision-mismatch" ? "replay-conflict" : (admitted.error.code as TaskStateEventAdmissionError["code"]),
        message: admitted.error.message,
        details: admitted.error.details
      }
    };
  }
  return { ok: true, events: admitted.events };
}

export function readRemoteSnapshotProjection(
  workspacePath: string,
  ref: string,
  tipSha: string
): TaskStateProjectionV1 | null {
  const layoutRead = readTaskStateBranchLayout(workspacePath, ref, tipSha);
  if (!layoutRead.ok) {
    return null;
  }
  const segmentPaths = layoutRead.layout.eventSegmentPaths;
  const eventsRead = readEventSegmentsJsonl(workspacePath, ref, segmentPaths);
  const rawEvents =
    eventsRead.ok && eventsRead.lines.length > 0
      ? eventsRead.lines.map((line) => JSON.parse(line) as unknown)
      : [];

  const snapshotId = layoutRead.layout.manifest.head.latestSnapshotId;
  if (!snapshotId) {
    const admitted = admitTaskStateEventStream(rawEvents);
    const events = admitted.ok ? admitted.events : [];
    if (events.length === 0) {
      return null;
    }
    const replayed = replayTaskStateEvents(events);
    return replayed.ok ? replayed.result.projection : null;
  }

  const snapshotRead = readSnapshotContent(workspacePath, ref, snapshotId);
  if (!snapshotRead.ok) {
    return null;
  }
  const admitted = admitRemoteEventStream(workspacePath, ref, layoutRead.layout.manifest, rawEvents);
  const events = admitted.ok ? admitted.events : [];
  const tailReplay = replayTailFromSnapshot({
    snapshot: snapshotRead.content,
    throughSequence: snapshotRead.throughSequence,
    tailEvents: events.filter(isTaskStateEvent)
  });
  return tailReplay.ok ? tailReplay.projection : null;
}

export function readRemoteTaskVersionMap(
  workspacePath: string,
  ref: string,
  tipSha: string
): Map<string, number> {
  const projection = readRemoteSnapshotProjection(workspacePath, ref, tipSha);
  if (!projection) {
    return new Map();
  }
  return taskVersionMapFromProjection(projection);
}

export function expectedVersionsForPublish(
  _storeVersions: Record<string, number>,
  remoteVersions: Map<string, number>,
  taskIds: Iterable<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const taskId of taskIds) {
    const remote = remoteVersions.get(taskId);
    out[taskId] = remote !== undefined ? remote : 0;
  }
  return out;
}
