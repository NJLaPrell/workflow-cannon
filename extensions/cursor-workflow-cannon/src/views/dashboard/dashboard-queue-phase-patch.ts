/**
 * Targeted queue DOM patch after assign-task-phase / clear-task-phase (skip dashboard-summary).
 */

import type { Webview } from "vscode";
import {
  computeQueueContentFingerprint,
  queueBucketMetaKey
} from "./dashboard-queue-fingerprint.js";
import {
  type DashboardQueueBucketCategory,
  renderQueueBucketRowsHtml
} from "./dashboard-queue-bucket-lazy.js";
import {
  dashboardRowPhaseKey,
  lookupDashboardTaskPhaseKey,
  mergeReadyQueueRollupSummaries
} from "./render-dashboard.js";

export type QueuePhasePatchPlacement = {
  summaryField: string;
  category: DashboardQueueBucketCategory;
};

export type QueuePhaseMovePatchArgs = {
  taskId: string;
  task: Record<string, unknown>;
  fromPhaseKey: string | null;
  toPhaseKey: string | null;
};

export type QueuePhaseMovePatchPayload = {
  type: "wcQueueTaskPhaseMove";
  category: DashboardQueueBucketCategory;
  taskId: string;
  fromPhaseKey: string;
  toPhaseKey: string;
  taskRowHtml: string;
  fromBucketCount: number;
  toBucketCount: number;
  fromBucketTaskIds: string;
  toBucketTaskIds: string;
  fromBucketMeta: string;
  toBucketMeta: string;
};

function normalizePhaseBucketKey(phaseKey: string | null | undefined): string | null {
  if (phaseKey == null) {
    return null;
  }
  const t = String(phaseKey).trim();
  return t.length > 0 ? t : null;
}

function phaseKeyForDom(phaseKey: string | null): string {
  return phaseKey ?? "";
}

/** Map persisted task → queue rollup + lazy bucket category. */
export function resolveQueuePlacementFromTask(
  task: Record<string, unknown>
): QueuePhasePatchPlacement | null {
  const status = typeof task.status === "string" ? task.status.trim() : "";
  const type = typeof task.type === "string" ? task.type.trim() : "";
  const id = typeof task.id === "string" ? task.id.trim() : "";

  if (status === "ready") {
    if (type === "improvement" || id.startsWith("imp-")) {
      return { summaryField: "readyImprovementsSummary", category: "ready" };
    }
    return { summaryField: "readyExecutionSummary", category: "ready" };
  }
  if (status === "proposed") {
    if (type === "improvement") {
      return { summaryField: "proposedImprovementsSummary", category: "proposed-improvement" };
    }
    return { summaryField: "proposedExecutionSummary", category: "proposed-execution" };
  }
  if (status === "blocked") {
    return { summaryField: "blockedSummary", category: "blocked" };
  }
  if (status === "research" && type === "transcript_churn") {
    return { summaryField: "transcriptChurnResearchSummary", category: "transcript-churn" };
  }
  return null;
}

export function taskEntityToDashboardRow(task: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    status: task.status,
    type: task.type
  };
  if (task.phaseKey != null && String(task.phaseKey).trim().length > 0) {
    row.phaseKey = String(task.phaseKey).trim();
  }
  if (task.phase != null && String(task.phase).trim().length > 0) {
    row.phase = String(task.phase).trim();
  }
  return row;
}

type PhaseBucket = {
  phaseKey?: string | null;
  count?: number;
  top?: unknown[];
  taskIds?: string[];
  label?: string;
};

function bucketPhaseKeyMatches(bucket: PhaseBucket, phaseKey: string | null): boolean {
  const pk = bucket.phaseKey != null ? String(bucket.phaseKey).trim() : "";
  if (phaseKey === null) {
    return pk.length === 0;
  }
  return pk === phaseKey;
}

function collectBucketTaskIds(bucket: PhaseBucket): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const id = raw.trim();
    if (id.length > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (Array.isArray(bucket.taskIds)) {
    for (const x of bucket.taskIds) {
      if (typeof x === "string") {
        add(x);
      }
    }
  }
  if (Array.isArray(bucket.top)) {
    for (const row of bucket.top) {
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

function removeTaskFromBucket(bucket: PhaseBucket, taskId: string): void {
  const tid = taskId.trim().toUpperCase();
  if (Array.isArray(bucket.taskIds)) {
    bucket.taskIds = bucket.taskIds.filter(
      (id) => String(id).trim().toUpperCase() !== tid
    );
  }
  if (Array.isArray(bucket.top)) {
    bucket.top = bucket.top.filter((row) => {
      if (!row || typeof row !== "object") {
        return true;
      }
      const id = String((row as { id?: unknown }).id ?? "")
        .trim()
        .toUpperCase();
      return id !== tid;
    });
  }
  const ids = collectBucketTaskIds(bucket);
  bucket.count = ids.length;
}

function addTaskToBucket(bucket: PhaseBucket, taskId: string, taskRow: Record<string, unknown>): void {
  const ids = collectBucketTaskIds(bucket);
  if (!ids.some((id) => id.toUpperCase() === taskId.trim().toUpperCase())) {
    ids.unshift(taskId.trim());
  }
  bucket.taskIds = ids;
  const top = Array.isArray(bucket.top) ? [...bucket.top] : [];
  const filteredTop = top.filter((row) => {
    if (!row || typeof row !== "object") {
      return true;
    }
    const id = String((row as { id?: unknown }).id ?? "")
      .trim()
      .toUpperCase();
    return id !== taskId.trim().toUpperCase();
  });
  bucket.top = [taskRow, ...filteredTop].slice(0, 15);
  bucket.count = ids.length;
}

function ensureBucket(
  buckets: PhaseBucket[],
  phaseKey: string | null
): PhaseBucket {
  const existing = buckets.find((b) => bucketPhaseKeyMatches(b, phaseKey));
  if (existing) {
    return existing;
  }
  const created: PhaseBucket = {
    phaseKey,
    count: 0,
    top: [],
    taskIds: [],
    label: phaseKey === null ? "Not Phased" : `Phase ${phaseKey}`
  };
  buckets.push(created);
  return created;
}

/** Mutate one dashboard-summary rollup bucket in place. */
export function mutateSummaryForPhaseMove(
  summaryData: Record<string, unknown>,
  summaryField: string,
  args: QueuePhaseMovePatchArgs
): boolean {
  const fromPk = normalizePhaseBucketKey(args.fromPhaseKey);
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);
  if (fromPk === toPk) {
    return false;
  }

  const summaryRaw = summaryData[summaryField];
  if (!summaryRaw || typeof summaryRaw !== "object") {
    return false;
  }
  const summary = summaryRaw as Record<string, unknown>;
  const buckets: PhaseBucket[] = Array.isArray(summary.phaseBuckets)
    ? (summary.phaseBuckets as PhaseBucket[]).map((b) => ({ ...b }))
    : [];

  const fromBucket = buckets.find((b) => bucketPhaseKeyMatches(b, fromPk));
  if (fromBucket) {
    removeTaskFromBucket(fromBucket, args.taskId);
  }

  const taskRow = taskEntityToDashboardRow(args.task);
  const toBucket = ensureBucket(buckets, toPk);
  addTaskToBucket(toBucket, args.taskId, taskRow);

  summary.phaseBuckets = buckets;
  summaryData[summaryField] = summary;
  return true;
}

function findBucketInSummary(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  phaseKey: string | null
): PhaseBucket | null {
  if (placement.category === "ready") {
    const ris = (summaryData.readyImprovementsSummary as Record<string, unknown> | undefined) ?? {};
    const res = (summaryData.readyExecutionSummary as Record<string, unknown> | undefined) ?? {};
    const merged = mergeReadyQueueRollupSummaries(ris, res);
    const buckets = Array.isArray(merged.phaseBuckets) ? (merged.phaseBuckets as PhaseBucket[]) : [];
    return buckets.find((b) => bucketPhaseKeyMatches(b, phaseKey)) ?? null;
  }
  const summary = summaryData[placement.summaryField];
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const buckets = Array.isArray((summary as { phaseBuckets?: unknown }).phaseBuckets)
    ? ((summary as { phaseBuckets: PhaseBucket[] }).phaseBuckets ?? [])
    : [];
  return buckets.find((b) => bucketPhaseKeyMatches(b, phaseKey)) ?? null;
}

function bucketSnapshot(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  phaseKey: string | null
): { count: number; taskIds: string[] } {
  const bucket = findBucketInSummary(summaryData, placement, phaseKey);
  if (!bucket) {
    return { count: 0, taskIds: [] };
  }
  const taskIds = collectBucketTaskIds(bucket);
  const count = typeof bucket.count === "number" ? bucket.count : taskIds.length;
  return { count, taskIds };
}

export function buildQueuePhaseMovePatchPayload(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): QueuePhaseMovePatchPayload | null {
  const fromPk = normalizePhaseBucketKey(args.fromPhaseKey);
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);
  if (fromPk === toPk) {
    return null;
  }

  const taskRow = taskEntityToDashboardRow(args.task);
  const taskRowHtml = renderQueueBucketRowsHtml(placement.category, [taskRow]);
  const fromSnap = bucketSnapshot(summaryData, placement, fromPk);
  const toSnap = bucketSnapshot(summaryData, placement, toPk);

  return {
    type: "wcQueueTaskPhaseMove",
    category: placement.category,
    taskId: args.taskId.trim(),
    fromPhaseKey: phaseKeyForDom(fromPk),
    toPhaseKey: phaseKeyForDom(toPk),
    taskRowHtml,
    fromBucketCount: fromSnap.count,
    toBucketCount: toSnap.count,
    fromBucketTaskIds: fromSnap.taskIds.join(","),
    toBucketTaskIds: toSnap.taskIds.join(","),
    fromBucketMeta: queueBucketMetaKey(
      placement.category,
      phaseKeyForDom(fromPk),
      String(fromSnap.count),
      fromSnap.taskIds.join(",")
    ),
    toBucketMeta: queueBucketMetaKey(
      placement.category,
      phaseKeyForDom(toPk),
      String(toSnap.count),
      toSnap.taskIds.join(",")
    )
  };
}

export function resolveFromPhaseKeyForTask(
  summaryData: Record<string, unknown> | null,
  taskId: string,
  task?: Record<string, unknown>
): string | null {
  if (task) {
    const pk = dashboardRowPhaseKey(task);
    if (pk.length > 0) {
      return pk;
    }
    if (task.phaseKey == null && task.phase == null) {
      return null;
    }
  }
  if (!summaryData) {
    return null;
  }
  const fromLookup = lookupDashboardTaskPhaseKey(summaryData, taskId).trim();
  return fromLookup.length > 0 ? fromLookup : null;
}

export async function postQueuePhaseMovePatch(
  webview: Webview | undefined,
  payload: QueuePhaseMovePatchPayload
): Promise<void> {
  if (!webview) {
    return;
  }
  await webview.postMessage(payload);
}

export function applyQueuePhasePatchToSummaryCache(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): QueuePhaseMovePatchPayload | null {
  if (!mutateSummaryForPhaseMove(summaryData, placement.summaryField, args)) {
    return null;
  }
  return buildQueuePhaseMovePatchPayload(summaryData, placement, args);
}

export function queueContentFingerprintAfterPatch(
  summaryData: Record<string, unknown>
): string {
  return computeQueueContentFingerprint(summaryData);
}
