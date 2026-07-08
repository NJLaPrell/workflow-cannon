import fs from "node:fs";
import path from "node:path";

export type WeeklyTaskCounts = {
  ready: number;
  proposed: number;
  blocked: number;
  done: number;
  human: number;
};

export type WeeklyCountsStore = {
  /** ISO week key → counts (e.g. "2026-W27") */
  weeks: Record<string, WeeklyTaskCounts>;
  /** Schema version for future migrations */
  version: number;
};

function getIsoWeekKey(date = new Date()): string {
  const tmp = new Date(date.valueOf());
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function countsFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".workflow-cannon", ".dash-weekly-counts.json");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadStore(workspaceRoot: string): WeeklyCountsStore {
  const file = countsFilePath(workspaceRoot);
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw) as WeeklyCountsStore;
      if (parsed && typeof parsed === "object" && parsed.weeks && typeof parsed.weeks === "object") {
        return { version: parsed.version ?? 1, weeks: parsed.weeks };
      }
    } catch {
      // Corrupt file — start fresh
    }
  }
  return { version: 1, weeks: {} };
}

function saveStore(workspaceRoot: string, store: WeeklyCountsStore): void {
  const file = countsFilePath(workspaceRoot);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

/** Append or overwrite the current week's counts. Call on every dashboard data refresh. */
export function recordWeeklyTaskCounts(
  workspaceRoot: string,
  counts: WeeklyTaskCounts
): void {
  if (!workspaceRoot || workspaceRoot.trim().length === 0) {
    return;
  }
  const store = loadStore(workspaceRoot);
  const weekKey = getIsoWeekKey();
  store.weeks[weekKey] = counts;
  // Prune to last 12 weeks to keep file small
  const allKeys = Object.keys(store.weeks).sort();
  if (allKeys.length > 12) {
    const toRemove = allKeys.slice(0, allKeys.length - 12);
    for (const k of toRemove) {
      delete store.weeks[k];
    }
  }
  saveStore(workspaceRoot, store);
}

/** Get the last 7 weeks of counts for a single category. Oldest first. */
export function getWeeklyCountHistory(
  workspaceRoot: string,
  category: keyof WeeklyTaskCounts,
  weeks = 7
): number[] {
  if (!workspaceRoot || workspaceRoot.trim().length === 0) {
    return Array.from({ length: weeks }, () => 0);
  }
  const store = loadStore(workspaceRoot);
  const keys = Object.keys(store.weeks).sort();
  const out: number[] = [];
  for (let i = keys.length - weeks; i < keys.length; i++) {
    if (i >= 0) {
      out.push(Math.max(0, Math.floor(store.weeks[keys[i]]?.[category] ?? 0)));
    } else {
      out.push(0);
    }
  }
  return out;
}

/** Convenience: get all 5 categories' last-7-week histories at once. */
export function getAllWeeklyCountHistories(
  workspaceRoot: string,
  weeks = 7
): Record<keyof WeeklyTaskCounts, number[]> {
  return {
    ready: getWeeklyCountHistory(workspaceRoot, "ready", weeks),
    proposed: getWeeklyCountHistory(workspaceRoot, "proposed", weeks),
    blocked: getWeeklyCountHistory(workspaceRoot, "blocked", weeks),
    done: getWeeklyCountHistory(workspaceRoot, "done", weeks),
    human: getWeeklyCountHistory(workspaceRoot, "human", weeks),
  };
}
