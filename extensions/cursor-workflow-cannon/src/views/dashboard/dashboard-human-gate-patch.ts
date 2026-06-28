/**
 * Targeted queue / human-gate DOM patches after resume_ready / resume_work.
 */

import type { Webview } from "vscode";
import { renderQueueBucketRowsHtml } from "./dashboard-queue-bucket-lazy.js";
import { buildLazyQueueBucketShellHtml } from "./dashboard-queue-bucket-shell.js";
import { queueBucketMetaKey } from "./dashboard-queue-fingerprint.js";
import {
  type QueuePhaseMovePatchArgs,
  type QueuePhaseMovePatchPayload,
  type QueuePhasePatchPlacement,
  resolveQueuePlacementFromTask
} from "./dashboard-queue-phase-patch.js";
import { dashboardRowPhaseKey } from "./render-dashboard.js";

export type QueueHumanGateResumePatchPayload = {
  type: "wcQueueHumanGateResume";
  taskId: string;
  action: "resume_ready" | "resume_work";
  humanGateCount: number;
  /** Present when action is resume_ready — insert row into ready phase bucket. */
  readyMove?: QueuePhaseMovePatchPayload;
};

type HumanGateSummary = {
  count?: number;
  top?: unknown[];
};

type PhaseBucket = {
  phaseKey?: string | null;
  count?: number;
  top?: unknown[];
  taskIds?: string[];
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

function ensureBucket(buckets: PhaseBucket[], phaseKey: string | null): PhaseBucket {
  const existing = buckets.find((b) => bucketPhaseKeyMatches(b, phaseKey));
  if (existing) {
    return existing;
  }
  const created: PhaseBucket = {
    phaseKey,
    count: 0,
    top: [],
    taskIds: []
  };
  buckets.push(created);
  return created;
}

function adjustSummaryTopLevelCount(summary: Record<string, unknown>, delta: number): void {
  const prior = typeof summary.count === "number" ? summary.count : 0;
  summary.count = Math.max(0, prior + delta);
}

function taskEntityToDashboardRow(task: Record<string, unknown>): Record<string, unknown> {
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

function bucketSnapshot(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  phaseKey: string | null
): { count: number; taskIds: string[] } {
  const summary = summaryData[placement.summaryField];
  if (!summary || typeof summary !== "object") {
    return { count: 0, taskIds: [] };
  }
  const buckets = Array.isArray((summary as { phaseBuckets?: unknown }).phaseBuckets)
    ? ((summary as { phaseBuckets: PhaseBucket[] }).phaseBuckets ?? [])
    : [];
  const bucket = buckets.find((b) => bucketPhaseKeyMatches(b, phaseKey));
  if (!bucket) {
    return { count: 0, taskIds: [] };
  }
  const taskIds = collectBucketTaskIds(bucket);
  const count = typeof bucket.count === "number" ? bucket.count : taskIds.length;
  return { count, taskIds };
}

export function lookupHumanGateTaskSnapshot(
  summaryData: Record<string, unknown>,
  taskId: string
): { task: Record<string, unknown>; phaseKey: string | null } | null {
  const hgRaw = summaryData.humanGatesSummary;
  if (!hgRaw || typeof hgRaw !== "object") {
    return null;
  }
  const top = Array.isArray((hgRaw as HumanGateSummary).top) ? (hgRaw as HumanGateSummary).top! : [];
  const tid = taskId.trim().toUpperCase();
  for (const raw of top) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "")
      .trim()
      .toUpperCase();
    if (id !== tid) {
      continue;
    }
    const pk = dashboardRowPhaseKey(row);
    return {
      task: row,
      phaseKey: pk.length > 0 ? pk : null
    };
  }
  return null;
}

export function mutateHumanGatesSummaryRemove(
  summaryData: Record<string, unknown>,
  taskId: string
): number | null {
  const hgRaw = summaryData.humanGatesSummary;
  if (!hgRaw || typeof hgRaw !== "object") {
    return null;
  }
  const hg = hgRaw as HumanGateSummary;
  const tid = taskId.trim().toUpperCase();
  const top = Array.isArray(hg.top) ? [...hg.top] : [];
  const filtered = top.filter((raw) => {
    if (!raw || typeof raw !== "object") {
      return true;
    }
    const id = String((raw as { id?: unknown }).id ?? "")
      .trim()
      .toUpperCase();
    return id !== tid;
  });
  if (filtered.length === top.length) {
    return null;
  }
  hg.top = filtered;
  const prior = typeof hg.count === "number" ? hg.count : top.length;
  const next = Math.max(0, prior - 1);
  hg.count = next;
  summaryData.humanGatesSummary = hg;
  return next;
}

export function mutateSummaryForReadyTaskInsert(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): boolean {
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);
  const toSummaryRaw = summaryData[placement.summaryField];
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
  const beforeIds = collectBucketTaskIds(toBucket);
  if (beforeIds.some((id) => id.toUpperCase() === args.taskId.trim().toUpperCase())) {
    return false;
  }
  addTaskToBucket(toBucket, args.taskId, taskRow);
  toSummary.phaseBuckets = toBuckets;
  adjustSummaryTopLevelCount(toSummary, 1);
  summaryData[placement.summaryField] = toSummary;
  return true;
}

function buildReadyInsertPatchPayload(
  summaryData: Record<string, unknown>,
  placement: QueuePhasePatchPlacement,
  args: QueuePhaseMovePatchArgs
): QueuePhaseMovePatchPayload | null {
  const toPk = normalizePhaseBucketKey(args.toPhaseKey);
  const readyTask: Record<string, unknown> = { ...args.task, status: "ready" };
  if (toPk != null) {
    readyTask.phaseKey = toPk;
    readyTask.phase = `Phase ${toPk}`;
  }
  const taskRowHtml = renderQueueBucketRowsHtml(placement.category, [taskEntityToDashboardRow(readyTask)]);
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
    fromPhaseKey: "",
    toPhaseKey: phaseKeyForDom(toPk),
    taskRowHtml,
    fromBucketCount: 0,
    toBucketCount: toSnap.count,
    fromBucketTaskIds: "",
    toBucketTaskIds: toSnap.taskIds.join(","),
    fromBucketMeta: queueBucketMetaKey(placement.category, "", "0", ""),
    toBucketMeta: queueBucketMetaKey(
      placement.category,
      phaseKeyForDom(toPk),
      String(toSnap.count),
      toSnap.taskIds.join(",")
    ),
    toBucketShellHtml
  };
}

export function applyQueueHumanGateResumePatchToSummaryCache(
  summaryData: Record<string, unknown>,
  taskId: string,
  action: "resume_ready" | "resume_work"
): QueueHumanGateResumePatchPayload | null {
  const snap = lookupHumanGateTaskSnapshot(summaryData, taskId);
  if (!snap) {
    return null;
  }
  const humanGateCount = mutateHumanGatesSummaryRemove(summaryData, taskId);
  if (humanGateCount === null) {
    return null;
  }

  const payload: QueueHumanGateResumePatchPayload = {
    type: "wcQueueHumanGateResume",
    taskId: taskId.trim(),
    action,
    humanGateCount
  };

  if (action === "resume_ready") {
    const readyTask: Record<string, unknown> = {
      ...snap.task,
      status: "ready",
      type: typeof snap.task.type === "string" ? snap.task.type : "execution"
    };
    const placement = resolveQueuePlacementFromTask(readyTask);
    if (!placement) {
      return null;
    }
    const patchArgs: QueuePhaseMovePatchArgs = {
      taskId,
      task: readyTask,
      fromPhaseKey: null,
      toPhaseKey: snap.phaseKey
    };
    if (!mutateSummaryForReadyTaskInsert(summaryData, placement, patchArgs)) {
      return null;
    }
    payload.readyMove = buildReadyInsertPatchPayload(summaryData, placement, patchArgs) ?? undefined;
    if (!payload.readyMove) {
      return null;
    }
  }

  return payload;
}

export async function postQueueHumanGateResumePatch(
  webview: Webview | undefined,
  payload: QueueHumanGateResumePatchPayload
): Promise<void> {
  if (!webview) {
    return;
  }
  await webview.postMessage(payload);
}
