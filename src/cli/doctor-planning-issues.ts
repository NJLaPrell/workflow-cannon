import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { resolveCanonicalPhase } from "../modules/task-engine/phase-resolution.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import {
  getPlanningGenerationPolicy,
  planningSqliteDatabaseRelativePath
} from "../modules/task-engine/planning-config.js";
import {
  readWorkspaceStatusSnapshotFromKitSqliteDb,
  WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
  workspaceStatusTableAvailable
} from "../modules/task-engine/persistence/workspace-status-store.js";
import { readKitSqliteUserVersion } from "../core/state/workspace-kit-sqlite.js";
import { defaultRegistryModules } from "../modules/index.js";
import { discoverPluginPackages } from "../modules/plugins/discovery.js";

export type DoctorPlanningIssue = { path: string; reason: string };

/** Config `kit.currentPhaseNumber` disagrees with `kit_workspace_status.current_kit_phase` (SQLite v10+). */
export const DOCTOR_KIT_PHASE_WORKSPACE_STATUS_MISMATCH = "kit-phase-config-workspace-status-mismatch";

/** `kit_workspace_status` table present (v10+) but singleton row missing — recovery / repair. */
export const DOCTOR_KIT_WORKSPACE_STATUS_ROW_MISSING = "kit-workspace-status-row-missing";

export async function collectDoctorKitPhaseIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorPlanningIssue[]> {
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
    if (!workspaceStatusTableAvailable(db)) {
      return [];
    }
    const workspaceStatus = readWorkspaceStatusSnapshotFromKitSqliteDb(db);
    if (!workspaceStatus) {
      const rel = path.relative(cwd, dbAbs) || dbRel;
      return [
        {
          path: `${rel} kit_workspace_status`,
          reason: DOCTOR_KIT_WORKSPACE_STATUS_ROW_MISSING
        }
      ];
    }
    const r = resolveCanonicalPhase({ effectiveConfig: effective, workspaceStatus });
    if (r.statusYamlMatchesConfig === false) {
      return [
        {
          path: "kit.currentPhaseNumber vs kit_workspace_status.current_kit_phase (SQLite)",
          reason: DOCTOR_KIT_PHASE_WORKSPACE_STATUS_MISMATCH
        }
      ];
    }
    return [];
  } finally {
    db.close();
  }
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
  const lines: string[] = [];
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
      if (uv >= 10) {
        const exportAbs = path.resolve(cwd, WORKSPACE_STATUS_DB_EXPORT_RELATIVE);
        if (fs.existsSync(exportAbs)) {
          const dbStat = fs.statSync(dbAbs);
          const exStat = fs.statSync(exportAbs);
          if (exStat.mtimeMs < dbStat.mtimeMs - 500) {
            lines.push(
              `Note: ${WORKSPACE_STATUS_DB_EXPORT_RELATIVE} may be stale (older mtime than planning SQLite). Regenerate: pnpm exec wk run export-workspace-status '{}' (non-authoritative export; see .ai/runbooks/workspace-status-sqlite.md).`
            );
          }
        }
      }
    } catch {
      lines.push("Kit SQLite schema (PRAGMA user_version): unavailable");
    }
  }
  lines.push("Native SQLite help: docs/maintainers/runbooks/native-sqlite-consumer-install.md");
  lines.push(
    "Team assignments / subagents: `pnpm exec wk run list-assignments '{}'`, `list-subagents` / `list-subagent-sessions` — rollups in `dashboard-summary`; runbook `.ai/runbooks/subagent-registry.md`; ADRs `docs/maintainers/adrs/ADR-team-execution-v1.md`, `ADR-subagent-registry-v1.md`."
  );
  lines.push("Persistence map (JSON): workspace-kit run get-kit-persistence-map '{}'");
  lines.push("Backend paths + recovery: docs/maintainers/runbooks/task-persistence-operator.md");
  const pol = getPlanningGenerationPolicy({ effectiveConfig: effective });
  lines.push(
    `Planning generation policy: ${pol} (tasks.planningGenerationPolicy — require/warn: pass expectedPlanningGeneration from prior reads; see ADR-planning-generation-optimistic-concurrency.md)`
  );
  return lines;
}

/** One-line Claude-layout plugin summary after doctor passes (read-only scan). */
export async function collectPluginDoctorSummaryLines(cwd: string): Promise<string[]> {
  try {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
    const res = discoverPluginPackages(cwd, effective);
    if (!res.ok) {
      return [`Plugin discovery: ${res.message} (fix roots or permissions; see plugins.discoveryRoots)`];
    }
    const bad = res.plugins.filter((p) => !p.manifestValid).length;
    return [
      `Claude-layout plugins: ${res.plugins.length} under plugins.discoveryRoots (${bad} with manifest/path validation issues) — workspace-kit run list-plugins '{}'`
    ];
  } catch {
    return [];
  }
}
