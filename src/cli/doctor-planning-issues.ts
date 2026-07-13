import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import { resolveRegistryAndConfig, collectDeprecatedModuleConfigDoctorSummaryLines } from "../core/module-registry-resolve.js";
import {
  configKitPhaseKeyFromEffective,
  parseKitPhaseNumberFromYaml
} from "../modules/task-engine/phase-resolution.js";
import { validatePlanningPersistenceForDoctor } from "../modules/task-engine/doctor-planning-persistence.js";
import { collectDoctorTaskStateProjectionIssues } from "../modules/task-engine/doctor-task-state-projection.js";
import { collectDoctorTaskStateShadowIssues } from "../modules/task-engine/doctor-task-state-shadow.js";
import { collectDoctorTaskStateGitHealthIssues } from "../modules/task-engine/doctor-task-state-git-health.js";
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
import { formatNodeRuntimeIdentity } from "../core/native-sqlite-diagnostics.js";
import { readRuntimeStamp } from "../core/runtime-contract.js";
import { defaultRegistryModules } from "../modules/index.js";
import { discoverPluginPackages } from "../modules/plugins/discovery.js";
import {
  formatResolvedCanonicalBackendLine,
  resolveCanonicalBackend
} from "../modules/task-engine/persistence/canonical-backend-config.js";
import { readTasksCanonicalAuthority } from "../modules/task-engine/persistence/task-state-canonical-authority.js";
import { resolveEnabledPlanningSyncDomains } from "../modules/task-engine/persistence/planning-canonical-sync-domains.js";
import { buildWorkspaceCoordinationStatus } from "../modules/task-engine/coordination/build-workspace-coordination-status.js";

export type DoctorPlanningIssue = { path: string; reason: string };

const DOCTOR_CANONICAL_BACKEND_CONFLICT = "canonical-backend-config-conflict";
const DOCTOR_CANONICAL_BACKEND_HOSTED_NOT_IMPLEMENTED = "canonical-backend-hosted-not-implemented";
const DOCTOR_WORKER_BRANCH_TASK_DB_DIRTY = "worker-branch-task-db-dirty";

export function collectDoctorCanonicalBackendConfigIssues(
  effective: Record<string, unknown>
): DoctorPlanningIssue[] {
  const resolved = resolveCanonicalBackend(effective);
  const issues: DoctorPlanningIssue[] = [];
  if (resolved.configConflict) {
    issues.push({
      path: ".workspace-kit/config.json tasks.canonicalBackend / tasks.canonicalAuthority",
      reason: DOCTOR_CANONICAL_BACKEND_CONFLICT
    });
  }
  if (resolved.type === "hosted" && !resolved.hostedImplemented) {
    issues.push({
      path: ".workspace-kit/config.json tasks.canonicalBackend.type",
      reason: DOCTOR_CANONICAL_BACKEND_HOSTED_NOT_IMPLEMENTED
    });
  }
  return issues;
}

function collectWorkerBranchTaskDatabaseIssues(
  cwd: string,
  effective: Record<string, unknown>
): DoctorPlanningIssue[] {
  try {
    const coordination = buildWorkspaceCoordinationStatus({
      runtimeVersion: "doctor",
      workspacePath: cwd,
      effectiveConfig: effective
    } as ModuleLifecycleContext);
    if (coordination.authorityRole === "worker" && coordination.taskDatabaseGitDirty) {
      return [
        {
          path: coordination.taskDatabaseRelativePath,
          reason: DOCTOR_WORKER_BRANCH_TASK_DB_DIRTY
        }
      ];
    }
  } catch {
    /* best-effort advisory only */
  }
  return [];
}

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
    const projectionIssues = await collectDoctorTaskStateProjectionIssues(cwd, effective);
    const shadowIssues = await collectDoctorTaskStateShadowIssues(cwd, effective);
    const gitHealthIssues = await collectDoctorTaskStateGitHealthIssues(cwd, effective);
    const backendIssues = collectDoctorCanonicalBackendConfigIssues(effective);
    const workerDbIssues = collectWorkerBranchTaskDatabaseIssues(cwd, effective);
    return [
      ...persistence,
      ...phaseIssues,
      ...projectionIssues,
      ...shadowIssues,
      ...gitHealthIssues,
      ...backendIssues,
      ...workerDbIssues
    ];
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
  lines.push(...collectDeprecatedModuleConfigDoctorSummaryLines(effective as Record<string, unknown>));
  const dbRel = planningSqliteDatabaseRelativePath({
    workspacePath: cwd,
    effectiveConfig: effective,
    runtimeVersion: "doctor"
  } as ModuleLifecycleContext);
  const rel = path.relative(cwd, path.resolve(cwd, dbRel)) || dbRel;
  lines.push(`Effective task persistence: sqlite — DB path: ${rel} (canonical runtime truth; maintainer YAML/JSON exports are non-authoritative snapshots — see kit_export_envelope on export-workspace-status / export-feature-taxonomy-json)`);
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
        try {
          let Database: typeof DatabaseCtor;
          ({ default: Database } = await import("better-sqlite3"));
          const ro = new Database(dbAbs, { readonly: true });
          try {
            if (workspaceStatusTableAvailable(ro)) {
              const ws = readWorkspaceStatusSnapshotFromKitSqliteDb(ro);
              if (ws) {
                const dbPhase = parseKitPhaseNumberFromYaml(ws.currentKitPhase);
                const cfgPhase = configKitPhaseKeyFromEffective(effective);
                if (dbPhase !== null && cfgPhase !== null && dbPhase !== cfgPhase) {
                  lines.push(
                    `Note: kit.currentPhaseNumber (${cfgPhase}) differs from kit_workspace_status (${dbPhase}); runtime readers use SQLite. Align config for operator UX if you want them to match (see .ai/runbooks/workspace-status-sqlite.md).`
                  );
                }
              }
            }
          } finally {
            ro.close();
          }
        } catch {
          /* optional advisory */
        }
      }
    } catch {
      lines.push("Kit SQLite schema (PRAGMA user_version): unavailable");
    }
  }
  const stampRead = readRuntimeStamp(cwd);
  if (stampRead.ok) {
    const stampedArch = stampRead.stamp.arch;
    const hostArch = os.arch();
    if (stampedArch === process.arch && stampedArch === hostArch) {
      lines.push(`Native SQLite architecture status: aligned (stamp=${stampedArch}, runtime=${process.arch}, host=${hostArch})`);
    } else {
      lines.push(
        `Native SQLite architecture status: mismatch (stamp=${stampedArch}, runtime=${process.arch}, host=${hostArch}) — run pnpm rebuild better-sqlite3 under the host architecture.`
      );
    }
  }
  lines.push(`Native SQLite runtime: ${formatNodeRuntimeIdentity()}`);
  lines.push("Native SQLite help: docs/maintainers/runbooks/native-sqlite-consumer-install.md");
  lines.push(
    "Team assignments / subagents: `pnpm exec wk run list-assignments '{}'`, `list-subagents` / `list-subagent-sessions` — rollups in `dashboard-summary`; runbook `.ai/runbooks/subagent-registry.md`; ADRs `docs/maintainers/adrs/ADR-team-execution-v1.md`, `ADR-subagent-registry-v1.md`."
  );
  lines.push("Persistence map (JSON): workspace-kit run get-kit-persistence-map '{}'");
  lines.push(
    "Planning SQLite recovery (before risky edits): pnpm exec wk run backup-planning-sqlite '{\"outputPath\":\".workspace-kit/backups/planning-pre-repair.db\"}' ; pnpm exec wk run task-persistence-readiness '{}'"
  );
  lines.push("Backend paths + recovery: docs/maintainers/runbooks/task-persistence-operator.md");
  const pol = getPlanningGenerationPolicy({ effectiveConfig: effective });
  lines.push(
    `Planning generation policy: ${pol} (tasks.planningGenerationPolicy — require/warn: pass expectedPlanningGeneration from prior reads; see ADR-planning-generation-optimistic-concurrency.md)`
  );
  lines.push(formatResolvedCanonicalBackendLine(resolveCanonicalBackend(effective)));
  if (readTasksCanonicalAuthority(effective) === "git-event-log") {
    const domains = resolveEnabledPlanningSyncDomains({ effectiveConfig: effective });
    lines.push(
      `Planning canonical sync domains (git-event-log): ${domains.join(", ")} — configure planning.canonicalSync.domains or explain-config path planning.canonicalSync.domains`
    );
  }
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
