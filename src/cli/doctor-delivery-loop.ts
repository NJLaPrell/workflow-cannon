import path from "node:path";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import type { DoctorContractIssue } from "./doctor-contract-validation.js";
import {
  countInProgressExecutionTasksSqlite,
  isProtectedMaintainerBranch,
  readGitWorkingTreeSnapshot,
  resolvePlanningSqliteAbsolute
} from "../modules/task-engine/maintainer-delivery-git.js";
import { planningSqliteDatabaseRelativePath } from "../modules/task-engine/planning-config.js";

export const DELIVERY_LOOP_DIRTY_ON_PROTECTED_BRANCH = "maintainer-delivery-loop-dirty-on-protected-branch";

/**
 * Optional maintainer delivery loop checks after canonical doctor passes.
 * Fires when: git repo, dirty tree, protected branch (main/master/release/phase-<n>),
 * and at least one in-progress execution task in planning SQLite.
 */
export async function collectMaintainerDeliveryLoopIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorContractIssue[]> {
  const git = readGitWorkingTreeSnapshot(cwd);
  if (!git.available || !git.isDirty || !isProtectedMaintainerBranch(git.branch)) {
    return [];
  }
  const ctx = { workspacePath: cwd, effectiveConfig: effective } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbAbs = resolvePlanningSqliteAbsolute(cwd, dbRel);
  const inProg = await countInProgressExecutionTasksSqlite(dbAbs);
  if (inProg === null || inProg < 1) {
    return [];
  }
  const relDb = path.relative(cwd, dbAbs) || dbRel;
  return [
    {
      path: `git:${git.branch}`,
      reason: `${DELIVERY_LOOP_DIRTY_ON_PROTECTED_BRANCH}: working tree dirty on '${git.branch}' while ${inProg} execution task(s) are in_progress (see planning db ${relDb}); prefer a task branch from the phase integration branch per .ai/playbooks/task-to-phase-branch.md`
    }
  ];
}

export function formatMaintainerDeliveryLoopAdvisoryLines(issues: DoctorContractIssue[]): string[] {
  if (issues.length === 0) return [];
  return [
    "Maintainer delivery advisory (run doctor without --delivery-loop to hide):",
    ...issues.map((i) => `  - ${i.path}: ${i.reason}`)
  ];
}
