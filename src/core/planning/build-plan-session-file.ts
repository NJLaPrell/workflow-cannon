import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { persistAllowlistedModuleStateWithPlanningSync } from "../../modules/task-engine/persistence/module-state-planning-events-runtime.js";
import {
  archiveSidecarFile,
  persistModuleStateRow,
  readSidecarJsonFile
} from "../state/module-state-sidecar-migration.js";
import { UnifiedStateDb } from "../state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";

export const BUILD_PLAN_SESSION_SIDECAR_REL = path.join(
  ".workspace-kit",
  "planning",
  "build-plan-session.json"
);

const MODULE_ID = "planning-build-session";
const STATE_SCHEMA = 1;

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

function dbRelativePath(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): string {
  return planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig
  } as ModuleLifecycleContext);
}

function parseSession(raw: unknown): BuildPlanSessionSnapshotV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const parsed = raw as BuildPlanSessionSnapshotV1;
  if (parsed.schemaVersion !== 1 || typeof parsed.planningType !== "string") {
    return null;
  }
  if (typeof parsed.resumeCli !== "string") {
    return null;
  }
  return parsed;
}

export async function persistBuildPlanSession(
  workspacePath: string,
  snapshot: Omit<BuildPlanSessionSnapshotV1, "schemaVersion" | "updatedAt">,
  effectiveConfig?: Record<string, unknown>,
  options?: { commandName?: string; clientMutationId?: string; policyApproval?: { confirmed: boolean; rationale: string } }
): Promise<ModuleCommandResult | null> {
  const full: BuildPlanSessionSnapshotV1 = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot
  };
  const result = await persistAllowlistedModuleStateWithPlanningSync({
    workspacePath,
    effectiveConfig,
    moduleId: MODULE_ID,
    state: full as unknown as Record<string, unknown>,
    updatedAt: full.updatedAt,
    documentSchemaVersion: STATE_SCHEMA,
    commandName: options?.commandName ?? "persist-build-plan-session",
    clientMutationId: options?.clientMutationId,
    policyApproval: options?.policyApproval
  });
  await archiveSidecarFile(workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  return result;
}

export async function clearBuildPlanSession(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>,
  options?: { commandName?: string; clientMutationId?: string; policyApproval?: { confirmed: boolean; rationale: string } }
): Promise<ModuleCommandResult | null> {
  const result = await persistAllowlistedModuleStateWithPlanningSync({
    workspacePath,
    effectiveConfig,
    moduleId: MODULE_ID,
    state: {},
    removed: true,
    commandName: options?.commandName ?? "clear-build-plan-session",
    clientMutationId: options?.clientMutationId,
    policyApproval: options?.policyApproval
  });
  await archiveSidecarFile(workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  return result;
}

export async function readBuildPlanSession(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<BuildPlanSessionSnapshotV1 | null> {
  const rel = dbRelativePath(workspacePath, effectiveConfig);
  const db = new UnifiedStateDb(workspacePath, rel);
  const row = db.getModuleState(MODULE_ID);
  if (row?.state) {
    return parseSession(row.state);
  }
  const sidecar = await readSidecarJsonFile(workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  if (sidecar.ok) {
    const parsed = parseSession(sidecar.value);
    if (parsed) {
      persistModuleStateRow({
        workspacePath,
        databaseRelativePath: rel,
        moduleId: MODULE_ID,
        stateSchemaVersion: STATE_SCHEMA,
        state: parsed as unknown as Record<string, unknown>
      });
      await archiveSidecarFile(workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
      return parsed;
    }
  }
  if ("corrupt" in sidecar && sidecar.corrupt) {
    await archiveSidecarFile(workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  }
  return null;
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
