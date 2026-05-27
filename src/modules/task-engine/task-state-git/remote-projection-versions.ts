import { gitShowText } from "./git-io.js";
import { resolveSnapshotContentRelativePath, resolveSnapshotMetaRelativePath } from "./layout.js";
import { readEventSegmentsJsonl, readTaskStateBranchLayout } from "./read-branch-layout.js";
import { taskVersionMapFromProjection } from "./publish-task-state-events.js";
import { replayTailFromSnapshot, type TaskStateSnapshotContentV1 } from "./snapshot-projection.js";
import { validateTaskStateGitSnapshotMeta } from "./validate-snapshot-meta.js";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import { replayTaskStateEvents } from "../task-state-events/event-applier.js";

export function readRemoteTaskVersionMap(
  workspacePath: string,
  ref: string,
  tipSha: string
): Map<string, number> {
  const layoutRead = readTaskStateBranchLayout(workspacePath, ref, tipSha);
  if (!layoutRead.ok) {
    return new Map();
  }

  const segmentPaths = layoutRead.layout.eventSegmentPaths;
  const eventsRead = readEventSegmentsJsonl(workspacePath, ref, segmentPaths);
  const rawEvents =
    eventsRead.ok && eventsRead.lines.length > 0
      ? eventsRead.lines.map((line) => JSON.parse(line) as unknown)
      : [];
  const admitted = admitTaskStateEventStream(rawEvents);
  const events = admitted.ok ? admitted.events : [];

  const snapshotId = layoutRead.layout.manifest.head.latestSnapshotId;
  if (snapshotId) {
    const metaText = gitShowText(workspacePath, ref, resolveSnapshotMetaRelativePath(snapshotId));
    const contentText = gitShowText(workspacePath, ref, resolveSnapshotContentRelativePath(snapshotId));
    if (metaText && contentText) {
      const metaParsed = validateTaskStateGitSnapshotMeta(JSON.parse(metaText) as unknown);
      if (metaParsed.ok) {
        const snapshotContent = JSON.parse(contentText) as TaskStateSnapshotContentV1;
        const tailReplay = replayTailFromSnapshot({
          snapshot: snapshotContent,
          throughSequence: metaParsed.data.throughSequence,
          tailEvents: events
        });
        if (tailReplay.ok) {
          return taskVersionMapFromProjection(tailReplay.projection);
        }
      }
    }
  }

  if (events.length === 0) {
    return new Map();
  }

  const replayed = replayTaskStateEvents(events);
  if (!replayed.ok) {
    return new Map();
  }
  return taskVersionMapFromProjection(replayed.result.projection);
}

export function expectedVersionsForPublish(
  storeVersions: Record<string, number>,
  remoteVersions: Map<string, number>,
  taskIds: Iterable<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const taskId of taskIds) {
    const remote = remoteVersions.get(taskId);
    if (remote !== undefined) {
      out[taskId] = remote;
      continue;
    }
    const local = storeVersions[taskId];
    out[taskId] = typeof local === "number" ? local : 0;
  }
  return out;
}
