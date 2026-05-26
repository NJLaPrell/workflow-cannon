/**
 * Stable fingerprints for dashboard queue rollups (T100497+).
 * Used to skip redundant queue section patches on kit-state light refresh.
 */

import type { DashboardQueueBucketCategory } from "./dashboard-queue-bucket-lazy.js";

type SummarySlice = {
  count?: unknown;
  phaseBuckets?: unknown;
};

function collectPhaseBucketTaskIds(raw: {
  top?: unknown;
  taskIds?: unknown;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string) => {
    const k = id.trim();
    if (k.length > 0 && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  if (Array.isArray(raw.taskIds)) {
    for (const x of raw.taskIds) {
      if (typeof x === "string") {
        add(x);
      }
    }
  }
  if (Array.isArray(raw.top)) {
    for (const row of raw.top) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string") {
        add(id);
      }
    }
  }
  return out;
}

function bucketLines(category: DashboardQueueBucketCategory, summary: SummarySlice | undefined): string[] {
  if (!summary || !Array.isArray(summary.phaseBuckets)) {
    return [];
  }
  const lines: string[] = [];
  for (const raw of summary.phaseBuckets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const b = raw as { phaseKey?: unknown; count?: unknown; top?: unknown; taskIds?: unknown };
    const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
    const count = typeof b.count === "number" ? b.count : 0;
    const taskIds = collectPhaseBucketTaskIds(b).sort().join(",");
    lines.push(`${category}|${phaseKey}|${count}|${taskIds}`);
  }
  lines.sort();
  return lines;
}

function mergeReadyBucketLines(
  improvements: SummarySlice | undefined,
  execution: SummarySlice | undefined
): string[] {
  const imp = bucketLines("ready", improvements);
  const exe = bucketLines("ready", execution);
  if (imp.length === 0) {
    return exe;
  }
  if (exe.length === 0) {
    return imp;
  }
  const merged = new Set([...imp, ...exe]);
  return [...merged].sort();
}

function queueContentLines(data: Record<string, unknown>): string[] {
  const wishlistCount = typeof data.wishlistOpenCount === "number" ? data.wishlistOpenCount : 0;
  const wishlistPage = typeof data.wishlistPage === "number" ? data.wishlistPage : 0;
  const ris = (data.readyImprovementsSummary as SummarySlice | undefined) ?? {};
  const res = (data.readyExecutionSummary as SummarySlice | undefined) ?? {};
  const pis = (data.proposedImprovementsSummary as SummarySlice | undefined) ?? {};
  const pes = (data.proposedExecutionSummary as SummarySlice | undefined) ?? {};
  const tcrs = (data.transcriptChurnResearchSummary as SummarySlice | undefined) ?? {};
  const blocked = (data.blockedSummary as SummarySlice | undefined) ?? {};
  const completed = (data.completedSummary as SummarySlice | undefined) ?? {};
  const cancelled = (data.cancelledSummary as SummarySlice | undefined) ?? {};

  return [
    `wish:${wishlistCount}:${wishlistPage}`,
    ...mergeReadyBucketLines(ris, res).map((l) => `ready:${l}`),
    ...bucketLines("proposed-improvement", pis).map((l) => `pi:${l}`),
    ...bucketLines("proposed-execution", pes).map((l) => `pe:${l}`),
    ...bucketLines("transcript-churn", tcrs).map((l) => `tcr:${l}`),
    ...bucketLines("blocked", blocked).map((l) => `blk:${l}`),
    ...bucketLines("completed", completed).map((l) => `done:${l}`),
    ...bucketLines("cancelled", cancelled).map((l) => `canc:${l}`)
  ];
}

/**
 * Rollup/content fingerprint for skip decisions. Omits `taskStoreLastUpdated` so SQLite
 * touch-without-task-change does not force queue DOM replacement.
 */
export function computeQueueContentFingerprint(data: Record<string, unknown>): string {
  return queueContentLines(data).join("\n");
}

/**
 * Full queue fingerprint including store timestamp (telemetry / manual refresh bookkeeping).
 */
export function computeQueueSummaryFingerprint(data: Record<string, unknown>): string {
  const storeUpdated =
    typeof data.taskStoreLastUpdated === "string" ? data.taskStoreLastUpdated.trim() : "";
  return `store:${storeUpdated}\n${computeQueueContentFingerprint(data)}`;
}

/** Per-bucket meta for webview preservation (category + phase + count + taskIds). */
export function queueBucketMetaKey(
  category: string,
  phaseKey: string,
  count: string,
  taskIds: string
): string {
  return `${category}|${phaseKey}|${count}|${taskIds}`;
}
