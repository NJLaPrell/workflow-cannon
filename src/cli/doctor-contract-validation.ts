import path from "node:path";
import fs from "node:fs/promises";
import { defaultWorkspaceKitPaths } from "./default-workspace-kit-paths.js";
import { parseJsonFile } from "./profile-support.js";
import { collectDoctorPlanningPersistenceIssues } from "./doctor-planning-issues.js";

export type DoctorContractIssue = {
  path: string;
  reason: string;
};

/**
 * Same contract checks as `workspace-kit doctor` (paths + JSON parse + planning persistence slice).
 * Used by `wk run agent-bootstrap` and the `doctor` CLI entrypoint.
 */
export async function collectDoctorContractIssues(cwd: string): Promise<DoctorContractIssue[]> {
  const issues: DoctorContractIssue[] = [];
  const requiredPaths = Object.values(defaultWorkspaceKitPaths).map((relativePath) =>
    path.join(cwd, relativePath)
  );

  for (const requiredPath of requiredPaths) {
    try {
      await fs.access(requiredPath);
    } catch {
      issues.push({
        path: path.relative(cwd, requiredPath) || requiredPath,
        reason: "missing"
      });
      continue;
    }

    try {
      await parseJsonFile(requiredPath);
    } catch {
      issues.push({
        path: path.relative(cwd, requiredPath) || requiredPath,
        reason: "invalid-json"
      });
    }
  }

  issues.push(...(await collectDoctorPlanningPersistenceIssues(cwd)));
  return issues;
}
