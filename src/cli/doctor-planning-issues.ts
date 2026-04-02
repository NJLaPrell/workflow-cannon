import fs from "node:fs";
import path from "node:path";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { readWorkspaceStatusSnapshot } from "../modules/task-engine/dashboard-status.js";
import { resolveCanonicalPhase } from "../modules/task-engine/phase-resolution.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "../modules/task-engine/planning-config.js";
import { readKitSqliteUserVersion } from "../core/state/workspace-kit-sqlite.js";
import { DEFAULT_TASK_STORE_PATH } from "../modules/task-engine/store.js";
import { DEFAULT_WISHLIST_PATH } from "../modules/task-engine/wishlist-store.js";
import { defaultRegistryModules } from "../modules/index.js";

export type DoctorPlanningIssue = { path: string; reason: string };

export async function collectDoctorKitPhaseIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorPlanningIssue[]> {
  const workspaceStatus = await readWorkspaceStatusSnapshot(cwd);
  const r = resolveCanonicalPhase({ effectiveConfig: effective, workspaceStatus });
  if (r.statusYamlMatchesConfig === false) {
    return [
      {
        path: "kit.currentPhaseNumber vs docs/maintainers/data/workspace-kit-status.yaml",
        reason: "kit-phase-config-status-yaml-mismatch"
      }
    ];
  }
  return [];
}

/** Resolve layered config and run SQLite planning persistence checks for `workspace-kit doctor`. */
export async function collectDoctorPlanningPersistenceIssues(
  cwd: string
): Promise<DoctorPlanningIssue[]> {
  try {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
    const persistence = await validatePlanningPersistenceForDoctor(cwd, effective);
    const phaseIssues = await collectDoctorKitPhaseIssues(cwd, effective);
    return [...persistence, ...phaseIssues];
  } catch (err) {
    return [
      {
        path: "workspace-config",
        reason: `config-resolution-failed: ${(err as Error).message}`
      }
    ];
  }
}

/** When env approval is set, remind operators it does not apply to `workspace-kit run`. */
export function collectPolicyLaneEnvDoctorSummaryLines(): string[] {
  const raw = process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim();
  if (!raw) {
    return [];
  }
  try {
    const o = JSON.parse(raw) as { confirmed?: unknown };
    if (o.confirmed !== true) {
      return [];
    }
  } catch {
    return [];
  }
  return [
    "Note: WORKSPACE_KIT_POLICY_APPROVAL is set — it does not apply to workspace-kit run; use JSON policyApproval in the third argument (docs/maintainers/POLICY-APPROVAL.md#two-approval-surfaces-do-not-mix-them-up)."
  ];
}

/** Human-readable persistence summary after `doctor` passes (effective backend + canonical paths). */
export async function collectTaskPersistenceDoctorSummaryLines(cwd: string): Promise<string[]> {
  const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
  const backend = getTaskPersistenceBackend(effective);
  const lines: string[] = [];
  if (backend === "sqlite") {
    const dbRel = planningSqliteDatabaseRelativePath({
      workspacePath: cwd,
      effectiveConfig: effective,
      runtimeVersion: "doctor"
    } as ModuleLifecycleContext);
    const rel = path.relative(cwd, path.resolve(cwd, dbRel)) || dbRel;
    lines.push(`Effective task persistence: sqlite — DB path: ${rel}`);
    const dbAbs = path.resolve(cwd, dbRel);
    if (fs.existsSync(dbAbs)) {
      try {
        const uv = readKitSqliteUserVersion(dbAbs);
        lines.push(`Kit SQLite schema (PRAGMA user_version): ${uv}`);
      } catch {
        lines.push("Kit SQLite schema (PRAGMA user_version): unavailable");
      }
    }
    lines.push("Native SQLite help: docs/maintainers/runbooks/native-sqlite-consumer-install.md");
    lines.push("Backend paths + recovery: docs/maintainers/runbooks/task-persistence-operator.md");
  } else {
    const taskRel = planningTaskStoreRelativePath({ effectiveConfig: effective }) ?? DEFAULT_TASK_STORE_PATH;
    const wishRel = planningWishlistStoreRelativePath({ effectiveConfig: effective }) ?? DEFAULT_WISHLIST_PATH;
    lines.push(`Effective task persistence: json — task file: ${taskRel}; wishlist file: ${wishRel}`);
    lines.push("SQLite opt-in + operator map: docs/maintainers/runbooks/task-persistence-operator.md");
  }
  return lines;
}
