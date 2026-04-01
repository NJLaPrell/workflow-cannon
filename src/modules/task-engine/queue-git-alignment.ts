import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TaskEntity, TransitionEvidence } from "./types.js";

export const QUEUE_GIT_ALIGNMENT_SCHEMA_VERSION = 1 as const;

/** Default age in days after which `in_progress` tasks are flagged (informational). */
export const DEFAULT_STALE_IN_PROGRESS_DAYS = 7;

export type GitHeadProbeResult = {
  ok: boolean;
  headSha?: string;
  /** ISO-8601 committer date of HEAD, when available */
  headCommitDateIso?: string;
  error?: string;
};

export function probeGitHead(workspacePath: string): GitHeadProbeResult {
  try {
    const sha = execFileSync("git", ["-C", workspacePath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .trim()
      .split(/\s+/)[0];
    if (!sha) {
      return { ok: false, error: "git rev-parse returned empty" };
    }
    let headCommitDateIso: string | undefined;
    try {
      const iso = execFileSync(
        "git",
        ["-C", workspacePath, "log", "-1", "--format=%cI", "HEAD"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      ).trim();
      if (iso) {
        headCommitDateIso = iso;
      }
    } catch {
      /* optional */
    }
    return { ok: true, headSha: sha, headCommitDateIso };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

function maxTransitionIso(log: TransitionEvidence[]): string | null {
  if (log.length === 0) {
    return null;
  }
  let best = log[0]!.timestamp;
  for (const e of log) {
    if (e.timestamp > best) {
      best = e.timestamp;
    }
  }
  return best;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export type QueueGitAlignmentReport = {
  schemaVersion: typeof QUEUE_GIT_ALIGNMENT_SCHEMA_VERSION;
  workspacePath: string;
  git: GitHeadProbeResult;
  storeLastUpdated: string;
  storeLastTransitionIso: string | null;
  signalMergeAheadOfTransitions: boolean;
  /** Informational: possible drift when HEAD is newer than last recorded transition (merge ≠ `run-transition complete`). */
  signalNotes: string[];
  staleInProgressDays: number;
  inProgressStale: { taskId: string; title: string; updatedAt: string; ageDays: number }[];
  summary: string;
};

export function buildQueueGitAlignmentReport(input: {
  workspacePath: string;
  tasks: TaskEntity[];
  transitionLog: TransitionEvidence[];
  storeLastUpdated: string;
  git: GitHeadProbeResult;
  staleInProgressDays?: number;
}): QueueGitAlignmentReport {
  const staleDays = input.staleInProgressDays ?? DEFAULT_STALE_IN_PROGRESS_DAYS;
  const storeLastTransitionIso = maxTransitionIso(input.transitionLog);
  const gitMs = parseIsoMs(input.git.headCommitDateIso);
  const transMs = parseIsoMs(storeLastTransitionIso);
  const signalMergeAheadOfTransitions =
    input.git.ok === true &&
    gitMs !== null &&
    transMs !== null &&
    gitMs > transMs;

  const signalNotes: string[] = [
    "Git history and task-engine transitions are independent; this command is heuristic only.",
    "False positives: no transitions yet but active git work; CI clones; parallel branches; clock skew."
  ];
  if (!input.git.ok) {
    signalNotes.push(
      `Git probe failed (${input.git.error ?? "unknown"}) — alignment signals skipped. Not a git repo or git unavailable.`
    );
  }

  const cutoff = Date.now() - staleDays * 86_400_000;
  const inProgressStale: QueueGitAlignmentReport["inProgressStale"] = [];
  for (const t of input.tasks) {
    if (t.status !== "in_progress" || t.archived) {
      continue;
    }
    const u = Date.parse(t.updatedAt);
    if (!Number.isFinite(u) || u >= cutoff) {
      continue;
    }
    inProgressStale.push({
      taskId: t.id,
      title: t.title,
      updatedAt: t.updatedAt,
      ageDays: Math.floor((Date.now() - u) / 86_400_000)
    });
  }
  inProgressStale.sort((a, b) => b.ageDays - a.ageDays);

  const parts: string[] = [];
  if (signalMergeAheadOfTransitions) {
    parts.push(
      "HEAD commit is newer than the latest task transition — confirm merged work has matching `run-transition complete` where appropriate."
    );
  } else if (input.git.ok && transMs === null) {
    parts.push("No transitions in store — cannot compare HEAD date to transition history.");
  } else if (input.git.ok) {
    parts.push("HEAD commit is not newer than the latest transition (weak sanity check only).");
  }
  if (inProgressStale.length > 0) {
    parts.push(
      `${inProgressStale.length} in_progress task(s) older than ${staleDays}d by updatedAt — verify ownership or pause/blocked state.`
    );
  }
  if (parts.length === 0) {
    parts.push("No strong drift signals; still treat Git and task-engine as separate sources of truth.");
  }

  return {
    schemaVersion: QUEUE_GIT_ALIGNMENT_SCHEMA_VERSION,
    workspacePath: path.resolve(input.workspacePath),
    git: input.git,
    storeLastUpdated: input.storeLastUpdated,
    storeLastTransitionIso,
    signalMergeAheadOfTransitions,
    signalNotes,
    staleInProgressDays: staleDays,
    inProgressStale,
    summary: parts.join(" ")
  };
}
