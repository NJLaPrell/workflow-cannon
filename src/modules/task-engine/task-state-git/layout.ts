import path from "node:path";
import {
  TASK_STATE_EVENT_SEGMENT_FILENAME_WIDTH,
  TASK_STATE_EVENTS_DIR_RELATIVE,
  TASK_STATE_MANIFEST_RELATIVE,
  TASK_STATE_ROOT_DIR,
  TASK_STATE_SNAPSHOTS_DIR_RELATIVE
} from "./constants.js";

export function formatEventSegmentFilename(segmentIndex: number): string {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
    throw new Error(`segmentIndex must be a non-negative integer, got ${String(segmentIndex)}`);
  }
  const padded = String(segmentIndex).padStart(TASK_STATE_EVENT_SEGMENT_FILENAME_WIDTH, "0");
  return `${padded}.jsonl`;
}

export function resolveEventSegmentRelativePath(segmentIndex: number): string {
  return path.posix.join(TASK_STATE_EVENTS_DIR_RELATIVE, formatEventSegmentFilename(segmentIndex));
}

export function resolveSnapshotMetaRelativePath(snapshotId: string): string {
  const safe = snapshotId.trim();
  if (!safe || safe.includes("/") || safe.includes("..")) {
    throw new Error(`invalid snapshotId: ${snapshotId}`);
  }
  return path.posix.join(TASK_STATE_SNAPSHOTS_DIR_RELATIVE, `${safe}.meta.json`);
}

export function resolveSnapshotContentRelativePath(snapshotId: string): string {
  const safe = snapshotId.trim();
  if (!safe || safe.includes("/") || safe.includes("..")) {
    throw new Error(`invalid snapshotId: ${snapshotId}`);
  }
  return path.posix.join(TASK_STATE_SNAPSHOTS_DIR_RELATIVE, `${safe}.json`);
}

export function segmentIndexForSequence(sequence: number, eventsPerSegment: number): number {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`sequence must be a non-negative integer, got ${String(sequence)}`);
  }
  const size = Math.max(1, eventsPerSegment);
  return Math.floor(sequence / size);
}

export function taskStateManifestRelativePath(): string {
  return TASK_STATE_MANIFEST_RELATIVE;
}

export function taskStateRootDirName(): string {
  return TASK_STATE_ROOT_DIR;
}
