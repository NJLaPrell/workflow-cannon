import fs from "node:fs";
import path from "node:path";

/** Default canonical git-backed task-state event log (JSONL, one event per line). */
export const DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE = ".workspace-kit/tasks/task-state-events.jsonl";

export function resolveTaskStateEventLogPath(workspacePath: string, relativePath?: string): string {
  const rel = (relativePath ?? DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE).trim();
  return path.isAbsolute(rel) ? rel : path.resolve(workspacePath, rel);
}

/** Read raw JSON values from the canonical JSONL log (skips blank lines and `#` comments). */
export function readTaskStateEventLogJsonl(workspacePath: string, relativePath?: string): unknown[] {
  const abs = resolveTaskStateEventLogPath(workspacePath, relativePath);
  if (!fs.existsSync(abs)) {
    return [];
  }
  const text = fs.readFileSync(abs, "utf8");
  const events: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    events.push(JSON.parse(trimmed) as unknown);
  }
  return events;
}
