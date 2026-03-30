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
  type?: string;
  metadata?: Record<string, unknown>;
};

export type WishlistRow = { id: string; title: string };

export type WkGroup = { kind: "group"; label: string; status: string; tasks: TreeTaskEntity[] };
export type WkTask = { kind: "task"; task: TreeTaskEntity };
export type WkWishlistGroup = { kind: "wishlist-group"; items: WishlistRow[] };
export type WkWishlistItem = { kind: "wishlist-item"; item: WishlistRow };
export type WkImprovementGroup = { kind: "improvement-group"; tasks: TreeTaskEntity[] };

export type WkNode = WkGroup | WkTask | WkWishlistGroup | WkWishlistItem | WkImprovementGroup;

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

export function isActiveImprovementForTree(t: TreeTaskEntity): boolean {
  return effectiveTaskType(t) === "improvement" && !isTerminalStatus(t.status);
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
  return typeof o.id === "string" && typeof o.title === "string" && typeof o.status === "string";
}

/**
 * Build sidebar root nodes: wishlist intake (non-terminal), active improvements, then remaining tasks by status.
 */
export function buildTaskTreeRootsFromTasks(tasks: unknown[]): WkNode[] {
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
    roots.push({ kind: "improvement-group", tasks: improvementTasks });
  }

  const forStatus = list.filter((t) => !isWishlistIntakeOpenForTree(t) && !isActiveImprovementForTree(t));

  roots.push(
    ...groupTasksByStatus(forStatus).map((g) => ({
      kind: "group" as const,
      status: g.status,
      label: g.label,
      tasks: g.tasks as TreeTaskEntity[]
    }))
  );

  return roots;
}
