import type {
  TASK_STATE_MANIFEST_SCHEMA_VERSION,
  TASK_STATE_SNAPSHOT_META_SCHEMA_VERSION
} from "./constants.js";

export type TaskStateManifestSchemaVersion = typeof TASK_STATE_MANIFEST_SCHEMA_VERSION;

export type TaskStateSnapshotMetaSchemaVersion = typeof TASK_STATE_SNAPSHOT_META_SCHEMA_VERSION;

export type TaskStateGitIntegrityV1 = {
  algorithm: "sha256";
  /** When true, digests use stable key-sorted JSON (same family as task-engine `digestPayload`). */
  canonicalJson: true;
};

export type TaskStateGitRetentionV1 = {
  maxEventSegments: number;
  maxSnapshots: number;
  /** Soft cap per `events/*.jsonl` segment before rotating to the next segment file. */
  segmentMaxBytes: number;
};

export type TaskStateGitEventLogLayoutV1 = {
  /** Relative to {@link TASK_STATE_ROOT_DIR}, e.g. `events/{segmentIndex}.jsonl`. */
  segmentFilePattern: string;
  /** Relative path to bundled event JSON Schema (repo) or `$id` on branch. */
  eventSchemaRef: string;
};

export type TaskStateGitSnapshotLayoutV1 = {
  /** Relative to {@link TASK_STATE_ROOT_DIR}, e.g. `snapshots/{snapshotId}.meta.json`. */
  metadataFilePattern: string;
  /** Relative to {@link TASK_STATE_ROOT_DIR}, e.g. `snapshots/{snapshotId}.json`. */
  contentFilePattern: string;
};

export type TaskStateGitHeadPointerV1 = {
  latestSequence: number;
  latestEventId: string | null;
  /** Relative path from repo root on the task-state branch, e.g. `task-state/events/0000000000.jsonl`. */
  latestSegmentPath: string | null;
  latestSnapshotId: string | null;
};

/** `task-state/manifest.json` on branch {@link TASK_STATE_GIT_BRANCH}. */
export type TaskStateGitManifestV1 = {
  schemaVersion: TaskStateManifestSchemaVersion;
  branch: string;
  root: string;
  integrity: TaskStateGitIntegrityV1;
  retention: TaskStateGitRetentionV1;
  eventLog: TaskStateGitEventLogLayoutV1;
  snapshots: TaskStateGitSnapshotLayoutV1;
  head: TaskStateGitHeadPointerV1;
  /** Digest of manifest body excluding this field (integrity self-check). */
  manifestDigest?: string;
};

/** `task-state/snapshots/<id>.meta.json` — metadata + integrity hashes for snapshot blob. */
export type TaskStateGitSnapshotMetaV1 = {
  schemaVersion: TaskStateSnapshotMetaSchemaVersion;
  snapshotId: string;
  /** Last event sequence included in this snapshot. */
  throughSequence: number;
  throughEventId: string;
  recordedAt: string;
  /** Relative path on branch, e.g. `task-state/snapshots/<id>.json`. */
  contentPath: string;
  /** SHA-256 hex of canonical JSON snapshot body. */
  contentDigest: string;
  /** Optional task count for operator summaries. */
  taskCount?: number;
};
