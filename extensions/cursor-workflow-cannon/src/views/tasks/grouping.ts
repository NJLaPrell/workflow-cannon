type TaskEntity = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  phase?: string;
  /** Task engine type (e.g. improvement, wishlist_intake) — optional for tree labeling. */
  type?: string;
};

export const STATUS_ORDER = [
  "ready",
  "proposed",
  "research",
  "blocked",
  "completed",
  "cancelled",
  "in_progress"
];

export type TaskGroup = { status: string; label: string; tasks: TaskEntity[] };

/** Buckets tasks by lifecycle status; unknown statuses are listed after the canonical order (no silent drops). */
export function groupTasksByStatus(tasks: TaskEntity[]): TaskGroup[] {
  const byStatus = new Map<string, TaskEntity[]>();
  for (const t of tasks) {
    const bucket = byStatus.get(t.status);
    if (bucket) {
      bucket.push(t);
    } else {
      byStatus.set(t.status, [t]);
    }
  }
  const groups: TaskGroup[] = [];
  for (const status of STATUS_ORDER) {
    const list = byStatus.get(status);
    if (!list || list.length === 0) {
      continue;
    }
    groups.push({ status, label: `${status} (${list.length})`, tasks: list });
    byStatus.delete(status);
  }
  const extra = [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [status, list] of extra) {
    if (list.length === 0) {
      continue;
    }
    groups.push({ status, label: `${status} (${list.length})`, tasks: list });
  }
  return groups;
}
