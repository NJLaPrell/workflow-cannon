import { gitShowText } from "./git-io.js";
import { resolveSnapshotMetaRelativePath } from "./layout.js";
import { validateTaskStateGitSnapshotMeta } from "./validate-snapshot-meta.js";
import type { TaskStateGitManifestV1 } from "./types.js";

/** Warn when events since last snapshot exceed this count (hydrate admission risk). */
export const TASK_STATE_SNAPSHOT_TAIL_WARN_THRESHOLD = 100;

export type SnapshotTailAssessment = {
  schemaVersion: 1;
  latestSequence: number;
  throughSequence: number;
  tailEventCount: number;
  recommendSnapshot: boolean;
  message: string | null;
  recommendedCommand: string | null;
};

export function assessSnapshotTail(args: {
  latestSequence: number;
  throughSequence: number | null | undefined;
  threshold?: number;
}): SnapshotTailAssessment {
  const through = args.throughSequence ?? 0;
  const tail = Math.max(0, args.latestSequence - through);
  const threshold = args.threshold ?? TASK_STATE_SNAPSHOT_TAIL_WARN_THRESHOLD;
  const recommend = tail > threshold;
  const recommendedCommand = recommend
    ? "pnpm exec wk run task-state-snapshot '{\"policyApproval\":{\"confirmed\":true,\"rationale\":\"reduce snapshot tail before hydrate\"}}'"
    : null;
  return {
    schemaVersion: 1,
    latestSequence: args.latestSequence,
    throughSequence: through,
    tailEventCount: tail,
    recommendSnapshot: recommend,
    message: recommend
      ? `Snapshot tail is ${tail} events (throughSequence=${through}, head=${args.latestSequence}); cut a fresh snapshot before hydrate-heavy operations`
      : null,
    recommendedCommand
  };
}

export function readSnapshotThroughSequence(
  workspacePath: string,
  ref: string,
  manifest: TaskStateGitManifestV1
): number | null {
  const snapshotId = manifest.head.latestSnapshotId;
  if (!snapshotId) {
    return 0;
  }
  const metaText = gitShowText(workspacePath, ref, resolveSnapshotMetaRelativePath(snapshotId));
  if (!metaText) {
    return null;
  }
  try {
    const parsed = validateTaskStateGitSnapshotMeta(JSON.parse(metaText) as unknown);
    return parsed.ok ? parsed.data.throughSequence : null;
  } catch {
    return null;
  }
}

export function assessSnapshotTailFromManifest(
  workspacePath: string,
  ref: string,
  manifest: TaskStateGitManifestV1,
  threshold?: number
): SnapshotTailAssessment | null {
  const through = readSnapshotThroughSequence(workspacePath, ref, manifest);
  if (through === null) {
    return null;
  }
  return assessSnapshotTail({
    latestSequence: manifest.head.latestSequence,
    throughSequence: through,
    threshold
  });
}
