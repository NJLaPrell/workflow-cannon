import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { BuildPlanSessionSnapshotV1 } from "../../core/planning/build-plan-session-file.js";
import { BUILD_PLAN_SESSION_SIDECAR_REL } from "../../core/planning/build-plan-session-file.js";
import { archiveSidecarFile } from "../../core/state/module-state-sidecar-migration.js";
import { persistAllowlistedModuleStateWithPlanningSync } from "../task-engine/persistence/module-state-planning-events-runtime.js";

const MODULE_ID = "planning-build-session";

export async function persistBuildPlanSessionWithPlanningSync(
  ctx: ModuleLifecycleContext,
  snapshot: Omit<BuildPlanSessionSnapshotV1, "schemaVersion" | "updatedAt">,
  options?: { commandName?: string; clientMutationId?: string; policyApproval?: { confirmed: boolean; rationale: string } }
): Promise<ModuleCommandResult | null> {
  const full: BuildPlanSessionSnapshotV1 = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot
  };
  const result = await persistAllowlistedModuleStateWithPlanningSync({
    workspacePath: ctx.workspacePath,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    moduleId: MODULE_ID,
    state: full as unknown as Record<string, unknown>,
    updatedAt: full.updatedAt,
    documentSchemaVersion: 1,
    commandName: options?.commandName ?? "build-plan",
    clientMutationId: options?.clientMutationId,
    policyApproval: options?.policyApproval
  });
  await archiveSidecarFile(ctx.workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  return result;
}

export async function clearBuildPlanSessionWithPlanningSync(
  ctx: ModuleLifecycleContext,
  options?: { commandName?: string; clientMutationId?: string; policyApproval?: { confirmed: boolean; rationale: string } }
): Promise<ModuleCommandResult | null> {
  const result = await persistAllowlistedModuleStateWithPlanningSync({
    workspacePath: ctx.workspacePath,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    moduleId: MODULE_ID,
    state: {},
    removed: true,
    commandName: options?.commandName ?? "build-plan",
    clientMutationId: options?.clientMutationId,
    policyApproval: options?.policyApproval
  });
  await archiveSidecarFile(ctx.workspacePath, BUILD_PLAN_SESSION_SIDECAR_REL);
  return result;
}
