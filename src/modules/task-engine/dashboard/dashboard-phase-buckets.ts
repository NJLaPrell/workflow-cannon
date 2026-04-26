import type { WorkspaceStatusSnapshot } from "./dashboard-status.js";
import { inferTaskPhaseKey } from "../phase-resolution.js";
import type { TaskEntity } from "../types.js";

export type DashboardPhaseBucket<T> = {
  schemaVersion: 1;
  phaseKey: string | null;
  label: string;
  count: number;
  top: T[];
  /** Every task id in this bucket (not capped by `top`); for dashboard batch accept. */
  taskIds?: string[];
};

function parseWorkspacePhaseKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  return m ? m[1]! : null;
}

function comparePhaseKeys(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b);
}

function phaseBucketLabel(
  key: string | null,
  current: string | null,
  next: string | null,
  count: number
): string {
  if (key === null) {
    return `Not Phased (${count})`;
  }
  if (key === current) {
    return `Phase ${key} (current) (${count})`;
  }
  if (key === next) {
    return `Phase ${key} (next) (${count})`;
  }
  return `Phase ${key} (${count})`;
}

function emitBucketsFromMap<T, R>(
  byKey: Map<string | null, T[]>,
  workspaceStatus: WorkspaceStatusSnapshot | null,
  topPerBucket: number,
  mapTop: (items: T[]) => R[],
  taskIdSelector?: (item: T) => string
): DashboardPhaseBucket<R>[] {
  const current = parseWorkspacePhaseKey(workspaceStatus?.currentKitPhase ?? null);
  const next = parseWorkspacePhaseKey(workspaceStatus?.nextKitPhase ?? null);

  const buckets: DashboardPhaseBucket<R>[] = [];
  const emitted = new Set<string>();

  const push = (key: string | null) => {
    const list = byKey.get(key) ?? [];
    const label = phaseBucketLabel(key, current, next, list.length);
    const row: DashboardPhaseBucket<R> = {
      schemaVersion: 1,
      phaseKey: key,
      label,
      count: list.length,
      top: mapTop(list.slice(0, topPerBucket))
    };
    if (taskIdSelector) {
      row.taskIds = list.map(taskIdSelector);
    }
    buckets.push(row);
    if (key !== null) {
      emitted.add(key);
    }
  };

  /** Omit roadmap current/next slots when they have no tasks (avoids empty phase rows in the dashboard). */
  if (current !== null) {
    const curList = byKey.get(current) ?? [];
    if (curList.length > 0) {
      push(current);
    }
  }
  if (next !== null && next !== current) {
    const nextList = byKey.get(next) ?? [];
    if (nextList.length > 0) {
      push(next);
    }
  }

  const restKeys = [...byKey.keys()]
    .filter((k): k is string => k !== null && !emitted.has(k))
    .sort(comparePhaseKeys);
  for (const k of restKeys) {
    push(k);
  }

  const unphased = byKey.get(null);
  if (unphased && unphased.length > 0) {
    push(null);
  }

  return buckets;
}

/**
 * Partition tasks into phase buckets (current / next from maintainer YAML, then other keys, then Not Phased).
 * `top` holds up to `topPerBucket` mapped rows per bucket for dashboard previews.
 */
export function buildDashboardPhaseBucketsForTasks<T>(
  taskEntities: TaskEntity[],
  workspaceStatus: WorkspaceStatusSnapshot | null,
  mapRow: (t: TaskEntity) => T,
  topPerBucket: number,
  options?: { includeAllTaskIds?: boolean }
): DashboardPhaseBucket<T>[] {
  const byKey = new Map<string | null, TaskEntity[]>();
  for (const t of taskEntities) {
    const k = inferTaskPhaseKey(t);
    const bucket = byKey.get(k);
    if (bucket) {
      bucket.push(t);
    } else {
      byKey.set(k, [t]);
    }
  }
  const idSel = options?.includeAllTaskIds ? (e: TaskEntity) => e.id : undefined;
  return emitBucketsFromMap(byKey, workspaceStatus, topPerBucket, (items) => items.map(mapRow), idSel);
}

export type BlockingRow = { taskId: string; blockedBy: string[] };

/**
 * Bucket blocking-analysis entries by the blocked task's phase (same ordering as task buckets).
 */
export function buildDashboardPhaseBucketsForBlocking(
  entries: { taskId: string; blockedBy: string[] }[],
  resolveTask: (taskId: string) => TaskEntity | undefined,
  workspaceStatus: WorkspaceStatusSnapshot | null,
  topPerBucket: number
): DashboardPhaseBucket<BlockingRow>[] {
  const byKey = new Map<string | null, BlockingRow[]>();
  for (const e of entries) {
    const t = resolveTask(e.taskId);
    const k = inferTaskPhaseKey(
      t ? { phase: t.phase, phaseKey: t.phaseKey } : { phase: undefined, phaseKey: undefined }
    );
    const row: BlockingRow = { taskId: e.taskId, blockedBy: e.blockedBy };
    const bucket = byKey.get(k);
    if (bucket) {
      bucket.push(row);
    } else {
      byKey.set(k, [row]);
    }
  }
  return emitBucketsFromMap(byKey, workspaceStatus, topPerBucket, (items) => items);
}
