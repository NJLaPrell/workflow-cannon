import path from "node:path";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { defaultWorkspaceKitPaths } from "./default-workspace-kit-paths.js";
import { parseJsonFile } from "./profile-support.js";
import { collectDoctorPlanningPersistenceIssues } from "./doctor-planning-issues.js";
import {
  WORKSPACE_KIT_RUNTIME_LAUNCHER_RELATIVE_PATH,
  WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH,
  readRuntimeStamp,
  runtimeLauncherPath,
  verifyRuntimeStamp,
  type RuntimeContractIssue,
  type WorkspaceKitRuntimeStampV1
} from "../core/runtime-contract.js";

export type DoctorContractIssue = {
  path: string;
  reason: string;
};

export type DoctorRuntimeContractStatus = {
  ok: boolean;
  stampPath: string;
  launcherPath: string;
  nodeExecutable: string | null;
  nodeVersion: string | null;
  arch: string | null;
  platform: string | null;
  abi: string | null;
  packageRoot: string | null;
  stamp: WorkspaceKitRuntimeStampV1 | null;
  issues: RuntimeContractIssue[];
};

async function collectRuntimeLauncherIssues(cwd: string): Promise<RuntimeContractIssue[]> {
  const launcherPath = runtimeLauncherPath(cwd);
  try {
    await fs.access(launcherPath, constants.F_OK);
  } catch {
    return [{ code: "runtime-launcher-missing", message: "Runtime launcher is missing" }];
  }
  try {
    await fs.access(launcherPath, constants.X_OK);
  } catch {
    return [{ code: "runtime-launcher-not-executable", message: "Runtime launcher is not executable" }];
  }
  return [];
}

export async function collectDoctorRuntimeContractStatus(cwd: string): Promise<DoctorRuntimeContractStatus> {
  const issues: RuntimeContractIssue[] = [];
  let stamp: WorkspaceKitRuntimeStampV1 | null = null;
  const read = readRuntimeStamp(cwd);
  if (read.ok) {
    stamp = read.stamp;
    issues.push(...verifyRuntimeStamp(read.stamp, { checkNativeSqlite: true }).issues);
  } else {
    issues.push(...read.issues);
  }
  issues.push(...(await collectRuntimeLauncherIssues(cwd)));
  return {
    ok: issues.length === 0,
    stampPath: WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH,
    launcherPath: WORKSPACE_KIT_RUNTIME_LAUNCHER_RELATIVE_PATH,
    nodeExecutable: stamp?.nodeExecutable ?? null,
    nodeVersion: stamp?.nodeVersion ?? null,
    arch: stamp?.arch ?? null,
    platform: stamp?.platform ?? null,
    abi: stamp?.abi ?? null,
    packageRoot: stamp?.packageRoot ?? null,
    stamp,
    issues
  };
}

function runtimeIssuePath(issue: RuntimeContractIssue): string {
  if (issue.code.startsWith("runtime-launcher")) {
    return WORKSPACE_KIT_RUNTIME_LAUNCHER_RELATIVE_PATH;
  }
  return WORKSPACE_KIT_RUNTIME_STAMP_RELATIVE_PATH;
}

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

  const runtimeContract = await collectDoctorRuntimeContractStatus(cwd);
  for (const issue of runtimeContract.issues) {
    issues.push({ path: runtimeIssuePath(issue), reason: issue.code });
  }

  issues.push(...(await collectDoctorPlanningPersistenceIssues(cwd)));
  return issues;
}
