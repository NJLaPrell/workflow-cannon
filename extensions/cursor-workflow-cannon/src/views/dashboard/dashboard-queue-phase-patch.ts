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
import { buildLazyQueueBucketShellHtml } from "./dashboard-queue-bucket-shell.js";
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
  /** Insert when target `<details>` is missing (first task in a new phase bucket). */
  toBucketShellHtml?: string;
};

export type QueueCategoryMovePatchPayload = {
  type: "wcQueueTaskCategoryMove";
  fromCategory: DashboardQueueBucketCategory;
  toCategory: DashboardQueueBucketCategory;
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
  /** Insert when target `<details>` is missing (first task in a new phase bucket). */
  toBucketShellHtml?: string;
};

export type QueueTaskRemovalPatchPayload = {
  type: "wcQueueTaskRemoval";
  category: DashboardQueueBucketCategory;
  taskId: string;
  phaseKey: string;
  bucketCount: number;
  bucketTaskIds: string;
  bucketMeta: string;
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

/** Proposed-row placement before accept → ready. */
export function resolveProposedPlacementFromTask(
  task: Record<string, unknown>,
  categoryLabel?: string
): QueuePhasePatchPlacement | null {
  const label = (categoryLabel ?? "").trim().toLowerCase();
  if (label.includes("improvement")) {
    return { summaryField: "proposedImprovementsSummary", category: "proposed-improvement" };
  }
  const type = typeof task.type === "string" ? task.type.trim() : "";
  const id = typeof task.id === "string" ? task.id.trim() : "";
  if (type === "improvement" || id.startsWith("imp-")) {
    return { summaryField: "proposedImprovementsSummary", category: "proposed-improvement" };
  }
  if (type.length > 0 || id.length > 0) {
    return { summaryField: "proposedExecutionSummary", category: "proposed-execution" };
  }
  return null;
}

function adjustSummaryTopLevelCount(summary: Record<string, unknown>, delta: number): void {
  const prior = typeof summary.count === "number" ? summary.count : 0;
  summary.count = Math.max(0, prior + delta);
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

  const toBucketShellHtml =
    toSnap.count > 0
      ? buildLazyQueueBucketShellHtml({
          category: placement.category,
          phaseKey: toPk,
          count: toSnap.count,
          taskIds: toSnap.taskIds,
          preloadRowHtml: taskRowHtml,
          openByDefault: true
        })
      : undefined;

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
    ),
    toBucketShellHtml
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

export async function postQueueCategoryMovePatch(
  webview: Webview | undefined,
  payload: QueueCategoryMovePatchPayload
): Promise<void> {
  if (!webview) {
    return;
  }
  await webview.postMessage(payload);
}

export async function postQueueTaskRemovalPatch(
  webview: Webview | undefined,
  payload: QueueTaskRemovalPatchPayload
): Promise<void> {
  if (!webview) {
    return;
  }
  await webview.postMessage(payload);
}

export function mutateSummaryForCategoryMove(
  summaryData: Record<string, unknown>,
  fromPlacement: QueuePhasePatchPlacement,
  toPlacement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): boolean {
  const fromPk = normalizePhaseBucketKey(args.fromPhaseKey);
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);

  const fromSummaryRaw = summaryData[fromPlacement.summaryField];
  if (!fromSummaryRaw || typeof fromSummaryRaw !== "object") {
    return false;
  }
  const fromSummary = fromSummaryRaw as Record<string, unknown>;
  const fromBuckets: PhaseBucket[] = Array.isArray(fromSummary.phaseBuckets)
    ? (fromSummary.phaseBuckets as PhaseBucket[]).map((b) => ({ ...b }))
    : [];
  const fromBucket = fromBuckets.find((b) => bucketPhaseKeyMatches(b, fromPk));
  if (!fromBucket) {
    return false;
  }
  removeTaskFromBucket(fromBucket, args.taskId);
  fromSummary.phaseBuckets = fromBuckets;
  summaryData[fromPlacement.summaryField] = fromSummary;
  adjustSummaryTopLevelCount(fromSummary, -1);

  const toSummaryRaw = summaryData[toPlacement.summaryField];
  const toSummary =
    toSummaryRaw && typeof toSummaryRaw === "object"
      ? (toSummaryRaw as Record<string, unknown>)
      : { count: 0, phaseBuckets: [] as PhaseBucket[] };
  const toBuckets: PhaseBucket[] = Array.isArray(toSummary.phaseBuckets)
    ? (toSummary.phaseBuckets as PhaseBucket[]).map((b) => ({ ...b }))
    : [];
  const readyTask: Record<string, unknown> = { ...args.task, status: "ready" };
  if (toPk != null) {
    readyTask.phaseKey = toPk;
    readyTask.phase = `Phase ${toPk}`;
  }
  const taskRow = taskEntityToDashboardRow(readyTask);
  const toBucket = ensureBucket(toBuckets, toPk);
  addTaskToBucket(toBucket, args.taskId, taskRow);
  toSummary.phaseBuckets = toBuckets;
  adjustSummaryTopLevelCount(toSummary, 1);
  summaryData[toPlacement.summaryField] = toSummary;
  return true;
}

export function buildQueueCategoryMovePatchPayload(
  summaryData: Record<string, unknown>,
  fromPlacement: QueuePhasePatchPlacement,
  toPlacement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): QueueCategoryMovePatchPayload | null {
  const fromPk = normalizePhaseBucketKey(args.fromPhaseKey);
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);
  const readyTask: Record<string, unknown> = { ...args.task, status: "ready" };
  if (toPk != null) {
    readyTask.phaseKey = toPk;
    readyTask.phase = `Phase ${toPk}`;
  }
  const taskRowHtml = renderQueueBucketRowsHtml(toPlacement.category, [taskEntityToDashboardRow(readyTask)]);
  const fromSnap = bucketSnapshot(summaryData, fromPlacement, fromPk);
  const toSnap = bucketSnapshot(summaryData, toPlacement, toPk);

  const toBucketShellHtml =
    toSnap.count > 0
      ? buildLazyQueueBucketShellHtml({
          category: toPlacement.category,
          phaseKey: toPk,
          count: toSnap.count,
          taskIds: toSnap.taskIds,
          preloadRowHtml: taskRowHtml,
          openByDefault: true
        })
      : undefined;

  return {
    type: "wcQueueTaskCategoryMove",
    fromCategory: fromPlacement.category,
    toCategory: toPlacement.category,
    taskId: args.taskId.trim(),
    fromPhaseKey: phaseKeyForDom(fromPk),
    toPhaseKey: phaseKeyForDom(toPk),
    taskRowHtml,
    fromBucketCount: fromSnap.count,
    toBucketCount: toSnap.count,
    fromBucketTaskIds: fromSnap.taskIds.join(","),
    toBucketTaskIds: toSnap.taskIds.join(","),
    fromBucketMeta: queueBucketMetaKey(
      fromPlacement.category,
      phaseKeyForDom(fromPk),
      String(fromSnap.count),
      fromSnap.taskIds.join(",")
    ),
    toBucketMeta: queueBucketMetaKey(
      toPlacement.category,
      phaseKeyForDom(toPk),
      String(toSnap.count),
      toSnap.taskIds.join(",")
    ),
    toBucketShellHtml
  };
}

export function applyQueueAcceptProposedPatchToSummaryCache(
  summaryData: Record<string, unknown>,
  fromPlacement: QueuePhasePatchPlacement,
  toPlacement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): QueueCategoryMovePatchPayload | null {
  if (!mutateSummaryForCategoryMove(summaryData, fromPlacement, toPlacement, args)) {
    return null;
  }
  return buildQueueCategoryMovePatchPayload(summaryData, fromPlacement, toPlacement, args);
}

function findTaskRowInSummaryPhaseBuckets(
  summary: unknown,
  taskId: string
): Record<string, unknown> | null {
  const tid = taskId.trim().toUpperCase();
  if (!tid.length || !summary || typeof summary !== "object") {
    return null;
  }
  const buckets = (summary as { phaseBuckets?: unknown }).phaseBuckets;
  if (!Array.isArray(buckets)) {
    return null;
  }
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const bucket = raw as PhaseBucket;
    if (Array.isArray(bucket.top)) {
      for (const row of bucket.top) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const id = String((row as { id?: unknown }).id ?? "")
          .trim()
          .toUpperCase();
        if (id === tid) {
          const matched = { ...(row as Record<string, unknown>) };
          const bucketPhaseKey = bucket.phaseKey != null ? String(bucket.phaseKey).trim() : "";
          if (dashboardRowPhaseKey(matched).length === 0 && bucketPhaseKey.length > 0) {
            matched.phaseKey = bucketPhaseKey;
          }
          return matched;
        }
      }
    }
    if (Array.isArray(bucket.taskIds) && bucket.taskIds.some((id) => String(id).trim().toUpperCase() === tid)) {
      const bucketPhaseKey = bucket.phaseKey != null ? String(bucket.phaseKey).trim() : "";
      const fromTop = Array.isArray(bucket.top)
        ? bucket.top.find(
            (row) =>
              row &&
              typeof row === "object" &&
              String((row as { id?: unknown }).id ?? "")
                .trim()
                .toUpperCase() === tid
          )
        : undefined;
      if (fromTop && typeof fromTop === "object") {
        const row = { ...(fromTop as Record<string, unknown>) };
        if (dashboardRowPhaseKey(row).length === 0 && bucketPhaseKey.length > 0) {
          row.phaseKey = bucketPhaseKey;
        }
        return row;
      }
      return {
        id: taskId.trim(),
        status: "proposed",
        ...(bucketPhaseKey.length > 0 ? { phaseKey: bucketPhaseKey } : {})
      };
    }
  }
  return null;
}

/** Snapshot proposed-row placement from cached dashboard-summary before accept. */
export function lookupProposedTaskSnapshot(
  summaryData: Record<string, unknown>,
  taskId: string,
  categoryLabel?: string
): {
  placement: QueuePhasePatchPlacement;
  phaseKey: string | null;
  task: Record<string, unknown>;
} | null {
  const label = (categoryLabel ?? "").trim().toLowerCase();
  const candidates: Array<{ summary: unknown; placement: QueuePhasePatchPlacement }> = [];
  if (label.includes("improvement")) {
    candidates.push({
      summary: summaryData.proposedImprovementsSummary,
      placement: { summaryField: "proposedImprovementsSummary", category: "proposed-improvement" }
    });
  } else if (label.includes("execution")) {
    candidates.push({
      summary: summaryData.proposedExecutionSummary,
      placement: { summaryField: "proposedExecutionSummary", category: "proposed-execution" }
    });
  } else {
    candidates.push(
      {
        summary: summaryData.proposedExecutionSummary,
        placement: { summaryField: "proposedExecutionSummary", category: "proposed-execution" }
      },
      {
        summary: summaryData.proposedImprovementsSummary,
        placement: { summaryField: "proposedImprovementsSummary", category: "proposed-improvement" }
      }
    );
  }
  for (const c of candidates) {
    const row = findTaskRowInSummaryPhaseBuckets(c.summary, taskId);
    if (row) {
      const pk = dashboardRowPhaseKey(row);
      return {
        placement: c.placement,
        phaseKey: pk.length > 0 ? pk : null,
        task: row
      };
    }
  }
  const fallback = { id: taskId.trim(), status: "proposed" };
  const placement = resolveProposedPlacementFromTask(fallback, categoryLabel);
  if (!placement) {
    return null;
  }
  return { placement, phaseKey: null, task: fallback };
}

export function mutateSummaryForTaskRemoval(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  taskId: string,
  phaseKey: string | null
): boolean {
  const pk = normalizePhaseBucketKey(phaseKey);
  const summaryRaw = summaryData[placement.summaryField];
  if (!summaryRaw || typeof summaryRaw !== "object") {
    return false;
  }
  const summary = summaryRaw as Record<string, unknown>;
  const buckets: PhaseBucket[] = Array.isArray(summary.phaseBuckets)
    ? (summary.phaseBuckets as PhaseBucket[]).map((b) => ({ ...b }))
    : [];
  const bucket = buckets.find((b) => bucketPhaseKeyMatches(b, pk));
  if (!bucket) {
    return false;
  }
  removeTaskFromBucket(bucket, taskId);
  summary.phaseBuckets = buckets;
  summaryData[placement.summaryField] = summary;
  adjustSummaryTopLevelCount(summary, -1);
  return true;
}

export function buildQueueTaskRemovalPatchPayload(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  taskId: string,
  phaseKey: string | null
): QueueTaskRemovalPatchPayload | null {
  const pk = normalizePhaseBucketKey(phaseKey);
  const snap = bucketSnapshot(summaryData, placement, pk);
  return {
    type: "wcQueueTaskRemoval",
    category: placement.category,
    taskId: taskId.trim(),
    phaseKey: phaseKeyForDom(pk),
    bucketCount: snap.count,
    bucketTaskIds: snap.taskIds.join(","),
    bucketMeta: queueBucketMetaKey(
      placement.category,
      phaseKeyForDom(pk),
      String(snap.count),
      snap.taskIds.join(",")
    )
  };
}

export function applyQueueTaskRemovalPatchToSummaryCache(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  taskId: string,
  phaseKey: string | null
): QueueTaskRemovalPatchPayload | null {
  if (!mutateSummaryForTaskRemoval(summaryData, placement, taskId, phaseKey)) {
    return null;
  }
  return buildQueueTaskRemovalPatchPayload(summaryData, placement, taskId, phaseKey);
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
