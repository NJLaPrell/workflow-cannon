import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { buildPhaseDeliveryPreflight } from "../delivery-evidence.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import { buildReleaseEvidenceManifest } from "../release-evidence-manifest.js";
import { runPhaseStatus } from "../workspace-status-commands-runtime.js";

/**
 * Phase / release readout commands that need an open task store + SQLite dual reader.
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolvePhaseDeliveryReadoutCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};
  const store = planning.taskStore;

  if (command.name === "phase-status") {
    return await runPhaseStatus(ctx, args as Record<string, unknown>, {
      tasks: store.getActiveTasks(),
      db: planning.sqliteDual.getDatabase(),
      dbPath: planning.sqliteDual.dbPath
    });
  }

  if (command.name === "phase-delivery-preflight") {
    const argObj = args as Record<string, unknown>;
    const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
    const phaseRes = resolveCanonicalPhase({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus
    });
    const phaseKey =
      typeof argObj.phaseKey === "string" && argObj.phaseKey.trim().length > 0
        ? argObj.phaseKey.trim()
        : phaseRes.canonicalPhaseKey;
    const includeInProgress =
      typeof argObj.includeInProgress === "boolean" ? argObj.includeInProgress : true;
    const preflight = buildPhaseDeliveryPreflight({
      tasks: store.getActiveTasks(),
      phaseKey,
      includeInProgress
    });
    const data: Record<string, unknown> = {
      ...preflight,
      canonicalPhase: phaseRes,
      includeInProgress
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-delivery-preflight",
      message:
        preflight.violationCount === 0
          ? "Phase delivery evidence preflight passed"
          : `Phase delivery evidence preflight found ${preflight.violationCount} violation(s)`,
      data
    };
  }

  if (command.name === "release-evidence-manifest") {
    const result = buildReleaseEvidenceManifest({
      workspacePath: ctx.workspacePath,
      tasks: store.getActiveTasks(),
      commandArgs: args as Record<string, unknown>
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        data: result.details ? { details: result.details } : undefined
      };
    }
    const data: Record<string, unknown> = { manifest: result.manifest };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "release-evidence-manifest",
      message: "Built release evidence manifest",
      data
    };
  }

  return null;
}
