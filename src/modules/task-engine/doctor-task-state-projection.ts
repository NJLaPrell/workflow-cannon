import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "./planning-config.js";
import { collectTaskStateProjectionDoctorIssues } from "./persistence/task-state-projection-health.js";

export type DoctorTaskStateProjectionIssue = { path: string; reason: string };

export async function collectDoctorTaskStateProjectionIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorTaskStateProjectionIssue[]> {
  let Database: typeof DatabaseCtor;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    return [];
  }
  const ctx = { workspacePath: cwd, effectiveConfig: effective } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbAbs = path.resolve(cwd, dbRel);
  if (!fs.existsSync(dbAbs)) {
    return [];
  }
  let db: InstanceType<typeof DatabaseCtor>;
  try {
    db = new Database(dbAbs, { readonly: true });
  } catch {
    return [];
  }
  try {
    return collectTaskStateProjectionDoctorIssues(cwd, dbRel, db);
  } finally {
    db.close();
  }
}
