import fs from "node:fs/promises";
import path from "node:path";

const REL_DIR = path.join(".workspace-kit", "planning");
const FILE_NAME = "build-plan-session.json";

/** Local operator snapshot so dashboards and agents can resume `build-plan` without re-entering answers. */
export type BuildPlanSessionSnapshotV1 = {
  schemaVersion: 1;
  updatedAt: string;
  planningType: string;
  outputMode: string;
  status: string;
  completionPct: number;
  answeredCritical: number;
  totalCritical: number;
  answers: Record<string, unknown>;
  /** Single-line `workspace-kit run build-plan '…'` hint (shell-escaped JSON inside quotes is caller responsibility). */
  resumeCli: string;
};

export type DashboardPlanningSessionV1 = {
  schemaVersion: 1;
  updatedAt: string;
  planningType: string;
  outputMode: string;
  status: string;
  completionPct: number;
  answeredCritical: number;
  totalCritical: number;
  resumeCli: string;
};

function sessionPath(workspacePath: string): string {
  return path.join(workspacePath, REL_DIR, FILE_NAME);
}

export async function persistBuildPlanSession(
  workspacePath: string,
  snapshot: Omit<BuildPlanSessionSnapshotV1, "schemaVersion" | "updatedAt">
): Promise<void> {
  const dir = path.join(workspacePath, REL_DIR);
  await fs.mkdir(dir, { recursive: true });
  const full: BuildPlanSessionSnapshotV1 = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot
  };
  await fs.writeFile(sessionPath(workspacePath), `${JSON.stringify(full, null, 2)}\n`, "utf8");
}

export async function clearBuildPlanSession(workspacePath: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(workspacePath));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

export async function readBuildPlanSession(
  workspacePath: string
): Promise<BuildPlanSessionSnapshotV1 | null> {
  try {
    const raw = await fs.readFile(sessionPath(workspacePath), "utf8");
    const parsed = JSON.parse(raw) as BuildPlanSessionSnapshotV1;
    if (parsed?.schemaVersion !== 1 || typeof parsed.planningType !== "string") {
      return null;
    }
    if (typeof parsed.resumeCli !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toDashboardPlanningSession(
  snap: BuildPlanSessionSnapshotV1 | null
): DashboardPlanningSessionV1 | null {
  if (!snap) return null;
  return {
    schemaVersion: 1,
    updatedAt: snap.updatedAt,
    planningType: snap.planningType,
    outputMode: snap.outputMode,
    status: snap.status,
    completionPct: snap.completionPct,
    answeredCritical: snap.answeredCritical,
    totalCritical: snap.totalCritical,
    resumeCli: snap.resumeCli
  };
}
