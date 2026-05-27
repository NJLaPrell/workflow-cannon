import type { TaskStateProjectionMeta } from "./task-state-projection-meta-store.js";

export type TaskStateSyncState = "missing" | "current" | "behind" | "conflict";

export function deriveTaskStateSyncState(input: {
  branchResolvable: boolean;
  remoteLatestSequence: number | null;
  localAppliedSequence: number | null;
  remoteTipSha: string | null;
  localSourceCommit: string | null;
}): { syncState: TaskStateSyncState; reason: string } {
  if (!input.branchResolvable) {
    return {
      syncState: "missing",
      reason: "Canonical task-state git branch is not available locally (fetch may be required)."
    };
  }

  const remoteSeq = input.remoteLatestSequence ?? 0;
  const localSeq = input.localAppliedSequence ?? 0;

  if (localSeq > remoteSeq) {
    return {
      syncState: "conflict",
      reason: `Local projection appliedSequence (${localSeq}) is ahead of branch head (${remoteSeq}).`
    };
  }

  if (
    input.remoteTipSha &&
    input.localSourceCommit &&
    input.localSourceCommit !== input.remoteTipSha &&
    localSeq === remoteSeq
  ) {
    return {
      syncState: "conflict",
      reason: "Local projection sourceCommit differs from branch tip at the same sequence."
    };
  }

  if (localSeq < remoteSeq) {
    return {
      syncState: "behind",
      reason: `Branch head sequence ${remoteSeq} is ahead of local appliedSequence ${localSeq}.`
    };
  }

  return {
    syncState: "current",
    reason: "Local projection matches branch head sequence."
  };
}

export function readLocalAppliedSequence(meta: TaskStateProjectionMeta | null): number | null {
  if (!meta) {
    return null;
  }
  return meta.appliedSequence;
}
