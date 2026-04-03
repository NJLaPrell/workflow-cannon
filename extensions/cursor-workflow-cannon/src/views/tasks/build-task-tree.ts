/**
 * Pure tree shape from `list-tasks` task rows — unit-tested; mirrors TasksTreeProvider roots.
 */

import { groupTasksByStatus } from "./grouping.js";

export type TreeTaskEntity = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  phase?: string;
  /** Stable phase id when set (matches task-engine); optional on legacy rows. */
  phaseKey?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  /** Feature taxonomy slugs when present on task rows from `list-tasks`. */
  features?: string[];
};

export type WishlistRow = { id: string; title: string };

/** One phase (or unphased) bucket under a status or Improvements node. */
export type WkPhaseBucket = {
  kind: "phase-bucket";
  /** Disambiguates `TreeItem.id` across parents (`ready`, `improvements`, …). */
  parentSegment: string;
  /** Parsed numeric phase key, or `null` for not phased. */
  phaseKey: string | null;
  label: string;
  tasks: TreeTaskEntity[];
};

export type WkGroup = {
  kind: "group";
  label: string;
  status: string;
  phaseBuckets: WkPhaseBucket[];
};
export type WkTask = { kind: "task"; task: TreeTaskEntity };
export type WkWishlistGroup = { kind: "wishlist-group"; items: WishlistRow[] };
export type WkWishlistItem = { kind: "wishlist-item"; item: WishlistRow };
export type WkImprovementGroup = { kind: "improvement-group"; phaseBuckets: WkPhaseBucket[] };

export type WkNode =
  | WkGroup
  | WkTask
  | WkWishlistGroup
  | WkWishlistItem
  | WkImprovementGroup
  | WkPhaseBucket;

/** Aligned with task-engine `isImprovementLikeTask` / improvement `ingest.ts` id shape. */
const IMPROVEMENT_TASK_ID_RE = /^imp-[a-f0-9]+$/i;

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

/** When `type` is missing on the wire, infer intake from provenance metadata (legacy migrations). */
export function effectiveTaskType(t: TreeTaskEntity): string {
  const ty = t.type?.trim();
  if (ty) {
    return ty;
  }
  const leg = t.metadata?.legacyWishlistId;
  if (typeof leg === "string" && /^W\d+$/i.test(leg)) {
    return "wishlist_intake";
  }
  return "";
}

export function isWishlistIntakeOpenForTree(t: TreeTaskEntity): boolean {
  return effectiveTaskType(t) === "wishlist_intake" && !isTerminalStatus(t.status);
}

export function isImprovementLikeForTree(t: TreeTaskEntity): boolean {
  if (effectiveTaskType(t) === "improvement") {
    return true;
  }
  return typeof t.id === "string" && IMPROVEMENT_TASK_ID_RE.test(t.id);
}

/** Proposed improvements only — accepted (`ready`) and other active statuses use normal status groups. */
export function isActiveImprovementForTree(t: TreeTaskEntity): boolean {
  return isImprovementLikeForTree(t) && t.status === "proposed";
}

export function wishlistDisplayId(t: TreeTaskEntity): string {
  const legacy = t.metadata?.legacyWishlistId;
  return typeof legacy === "string" && /^W\d+$/i.test(legacy) ? legacy : t.id;
}

function isValidTaskRow(t: unknown): t is TreeTaskEntity {
  if (!t || typeof t !== "object") {
    return false;
  }
  const o = t as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.status !== "string") {
    return false;
  }
  if (o.phaseKey !== undefined && typeof o.phaseKey !== "string") {
    return false;
  }
  if (o.features !== undefined) {
    if (!Array.isArray(o.features) || !o.features.every((x) => typeof x === "string")) {
      return false;
    }
  }
  return true;
}

/** Leading digits from maintainer YAML phase fields (e.g. `"34"` → `"34"`). */
export function parseWorkspacePhaseKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  return m ? m[1]! : null;
}

/**
 * Same rules as task-engine `inferTaskPhaseKey` — keep extension tree aligned with queue-health / list-tasks.
 */
export function inferTreeTaskPhaseKey(task: Pick<TreeTaskEntity, "phaseKey" | "phase">): string | null {
  if (typeof task.phaseKey === "string" && task.phaseKey.trim().length > 0) {
    return task.phaseKey.trim();
  }
  if (typeof task.phase === "string" && task.phase.trim().length > 0) {
    const p = task.phase.trim();
    const labeled = p.match(/Phase\s*(\d+)/i);
    if (labeled) {
      return labeled[1]!;
    }
    const leading = p.match(/^(\d+)\b/);
    if (leading) {
      return leading[1]!;
    }
  }
  return null;
}

export type WorkspacePhaseSnapshot = {
  currentKitPhase: string | null;
  nextKitPhase: string | null;
};

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

function buildPhaseBuckets(
  tasks: TreeTaskEntity[],
  parentSegment: string,
  workspace: WorkspacePhaseSnapshot | null | undefined
): WkPhaseBucket[] {
  const current = parseWorkspacePhaseKey(workspace?.currentKitPhase ?? null);
  const next = parseWorkspacePhaseKey(workspace?.nextKitPhase ?? null);

  const byKey = new Map<string | null, TreeTaskEntity[]>();
  for (const t of tasks) {
    const k = inferTreeTaskPhaseKey(t);
    const bucket = byKey.get(k);
    if (bucket) {
      bucket.push(t);
    } else {
      byKey.set(k, [t]);
    }
  }

  const buckets: WkPhaseBucket[] = [];
  const emitted = new Set<string>();

  const push = (key: string | null) => {
    const list = byKey.get(key) ?? [];
    const label = phaseBucketLabel(key, current, next, list.length);
    buckets.push({
      kind: "phase-bucket",
      parentSegment,
      phaseKey: key,
      label,
      tasks: list
    });
    if (key !== null) {
      emitted.add(key);
    }
  };

  if (current !== null) {
    push(current);
  }
  if (next !== null && next !== current) {
    push(next);
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
 * Build sidebar root nodes: wishlist intake (non-terminal), proposed improvements (triage), then tasks by status.
 * Status and Improvements children are phase buckets (current / next from maintainer YAML, then other keys, then Not Phased).
 */
export function buildTaskTreeRootsFromTasks(
  tasks: unknown[],
  workspaceStatus?: WorkspacePhaseSnapshot | null
): WkNode[] {
  const list = tasks.filter(isValidTaskRow);

  const roots: WkNode[] = [];

  const wishlistItems: WishlistRow[] = list.filter(isWishlistIntakeOpenForTree).map((t) => ({
    id: wishlistDisplayId(t),
    title: t.title
  }));
  if (wishlistItems.length > 0) {
    roots.push({ kind: "wishlist-group", items: wishlistItems });
  }

  const improvementTasks = list.filter(isActiveImprovementForTree);
  if (improvementTasks.length > 0) {
    roots.push({
      kind: "improvement-group",
      phaseBuckets: buildPhaseBuckets(improvementTasks, "improvements", workspaceStatus ?? null)
    });
  }

  const forStatus = list.filter((t) => !isWishlistIntakeOpenForTree(t) && !isActiveImprovementForTree(t));

  roots.push(
    ...groupTasksByStatus(forStatus).map((g) => ({
      kind: "group" as const,
      status: g.status,
      label: g.label,
      phaseBuckets: buildPhaseBuckets(g.tasks as TreeTaskEntity[], g.status, workspaceStatus ?? null)
    }))
  );

  return roots;
}
