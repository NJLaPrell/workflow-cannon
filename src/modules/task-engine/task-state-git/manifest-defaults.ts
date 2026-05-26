import {
  TASK_STATE_DEFAULT_MAX_EVENT_SEGMENTS,
  TASK_STATE_DEFAULT_MAX_SNAPSHOTS,
  TASK_STATE_DEFAULT_SEGMENT_MAX_BYTES,
  TASK_STATE_GIT_BRANCH,
  TASK_STATE_INTEGRITY_ALGORITHM,
  TASK_STATE_ROOT_DIR
} from "./constants.js";
import { resolveEventSegmentRelativePath } from "./layout.js";
import type { TaskStateGitManifestV1 } from "./types.js";
import { computeManifestDigest } from "./validate-manifest.js";

export function createDefaultTaskStateGitManifest(
  overrides?: Partial<TaskStateGitManifestV1>
): TaskStateGitManifestV1 {
  const base: TaskStateGitManifestV1 = {
    schemaVersion: 1,
    branch: TASK_STATE_GIT_BRANCH,
    root: TASK_STATE_ROOT_DIR,
    integrity: {
      algorithm: TASK_STATE_INTEGRITY_ALGORITHM,
      canonicalJson: true
    },
    retention: {
      maxEventSegments: TASK_STATE_DEFAULT_MAX_EVENT_SEGMENTS,
      maxSnapshots: TASK_STATE_DEFAULT_MAX_SNAPSHOTS,
      segmentMaxBytes: TASK_STATE_DEFAULT_SEGMENT_MAX_BYTES
    },
    eventLog: {
      segmentFilePattern: "events/{segmentIndex}.jsonl",
      eventSchemaRef: "src/modules/task-engine/task-state-events/schemas/task-state-event.v1.json"
    },
    snapshots: {
      metadataFilePattern: "snapshots/{snapshotId}.meta.json",
      contentFilePattern: "snapshots/{snapshotId}.json"
    },
    head: {
      latestSequence: 0,
      latestEventId: null,
      latestSegmentPath: resolveEventSegmentRelativePath(0),
      latestSnapshotId: null
    },
    ...overrides
  };
  return {
    ...base,
    manifestDigest: computeManifestDigest(base)
  };
}
