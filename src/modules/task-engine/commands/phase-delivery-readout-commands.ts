import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { buildPhaseCloseoutReadiness, buildPhaseDeliveryPreflight } from "../delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import { buildReleaseEvidenceManifest } from "../release-evidence-manifest.js";
import { runPhaseStatus } from "../workspace-status-commands-runtime.js";
import { buildStrandedWorkReport } from "../stranded-work.js";

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

  if (command.name === "phase-closeout-readiness" || command.name === "phase-delivery-preflight") {
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
    const activeTasks = store.getActiveTasks();
    const readiness = buildPhaseCloseoutReadiness({ tasks: activeTasks, phaseKey });

    if (command.name === "phase-closeout-readiness") {
      const data: Record<string, unknown> = {
        ...readiness,
        canonicalPhase: phaseRes
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "phase-closeout-readiness",
        message: readiness.passed
          ? "Phase closeout readiness passed"
          : `Phase closeout readiness found ${readiness.remainingCount} unfinished task(s)`,
        data
      };
    }

    const effectiveConfig = ctx.effectiveConfig as Record<string, unknown> | undefined;
    const policyContextByTaskId = Object.fromEntries(
      activeTasks.map((task) => {
        const resolved = resolveMaintainerDeliveryPolicy({ effectiveConfig, task });
        return [task.id, buildDeliveryEvidencePolicyContext(resolved)];
      })
    );
    const preflight = buildPhaseDeliveryPreflight({
      tasks: activeTasks,
      phaseKey,
      includeInProgress,
      policyContextByTaskId
    });
    const baseRef = typeof argObj.baseRef === "string" && argObj.baseRef.trim().length > 0 ? argObj.baseRef.trim() : null;
    const strandedWork = buildStrandedWorkReport({
      workspacePath: ctx.workspacePath,
      tasks: activeTasks,
      phaseKey,
      baseRef
    });
    const blockingFindingCount =
      preflight.violationCount + readiness.remainingCount + strandedWork.findings.length;
    const data: Record<string, unknown> = {
      ...preflight,
      canonicalPhase: phaseRes,
      includeInProgress,
      readiness,
      strandedWork,
      blockingFindingCount
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-delivery-preflight",
      message:
        blockingFindingCount === 0
          ? "Phase delivery evidence preflight passed"
          : `Phase delivery preflight found ${blockingFindingCount} blocking finding(s)`,
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
