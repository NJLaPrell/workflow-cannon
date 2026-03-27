type TaskEntity = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  phase?: string;
};

export const STATUS_ORDER = ["ready", "in_progress", "blocked", "proposed", "completed", "cancelled"];

export type TaskGroup = { status: string; label: string; tasks: TaskEntity[] };

export function groupTasksByStatus(tasks: TaskEntity[]): TaskGroup[] {
  const byStatus = new Map<string, TaskEntity[]>();
  for (const s of STATUS_ORDER) {
    byStatus.set(s, []);
  }
  for (const t of tasks) {
    const bucket = byStatus.get(t.status) ?? [];
    bucket.push(t);
    byStatus.set(t.status, bucket);
  }
  const groups: TaskGroup[] = [];
  for (const status of STATUS_ORDER) {
    const list = byStatus.get(status) ?? [];
    if (list.length === 0) continue;
    groups.push({ status, label: `${status} (${list.length})`, tasks: list });
  }
  return groups;
}
