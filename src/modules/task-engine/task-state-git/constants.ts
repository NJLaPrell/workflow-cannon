/** Canonical git branch for authoritative task-state history (Phase 115 S3.1). */
export const TASK_STATE_GIT_BRANCH = "workflow-cannon/task-state" as const;

/** Root directory committed on {@link TASK_STATE_GIT_BRANCH}. */
export const TASK_STATE_ROOT_DIR = "task-state" as const;

export const TASK_STATE_MANIFEST_SCHEMA_VERSION = 1 as const;
export const TASK_STATE_SNAPSHOT_META_SCHEMA_VERSION = 1 as const;

export const TASK_STATE_MANIFEST_RELATIVE = `${TASK_STATE_ROOT_DIR}/manifest.json` as const;
export const TASK_STATE_EVENTS_DIR_RELATIVE = `${TASK_STATE_ROOT_DIR}/events` as const;
export const TASK_STATE_SNAPSHOTS_DIR_RELATIVE = `${TASK_STATE_ROOT_DIR}/snapshots` as const;

/** Default segment file naming: `events/0000000000.jsonl` (10-digit zero-padded index). */
export const TASK_STATE_EVENT_SEGMENT_FILENAME_WIDTH = 10 as const;

/** Default retention caps (overridable in manifest.retention). */
export const TASK_STATE_DEFAULT_MAX_EVENT_SEGMENTS = 256 as const;
export const TASK_STATE_DEFAULT_MAX_SNAPSHOTS = 32 as const;
export const TASK_STATE_DEFAULT_SEGMENT_MAX_BYTES = 1_048_576 as const;

export const TASK_STATE_INTEGRITY_ALGORITHM = "sha256" as const;
