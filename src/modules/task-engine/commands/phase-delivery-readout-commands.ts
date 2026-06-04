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
import { derivePublishArtifactsFragment } from "../derive-publish-artifacts-runtime.js";
import {
  defaultGatesOutputPath,
  deriveValidationsFragment
} from "../derive-validations-runtime.js";
import { buildReleaseEvidenceManifest, readPackageMetadata } from "../release-evidence-manifest.js";
import { resolveReleaseEvidenceCommandArgs } from "../release-evidence-fragments.js";
import { runPhaseStatus } from "../workspace-status-commands-runtime.js";
import { buildStrandedWorkReport } from "../stranded-work.js";
import { buildPhaseFocusDashboard } from "../dashboard/build-phase-focus-dashboard.js";
import { proposeReleaseVersion } from "../propose-release-version-runtime.js";
import { buildPhaseServiceSyncPreflight } from "../phase-service-sync-preflight.js";
import { buildPhaseProjectionCountGuardAsync } from "../sync-backends/git-event-log-phase-projection-guard.js";
import { wasWorkspacePhaseRolledOut } from "../dashboard/phase-delivery-status.js";
import {
  buildPhaseDrainDelta,
  buildPhaseReleaseOrchestrationState,
  parsePhaseDrainDeltaCursor
} from "../phase-release-orchestration-state-runtime.js";
import { listAssignments } from "../../team-execution/assignment-store.js";
import { runPrepareReleaseArtifactsCommand } from "../prepare-release-artifacts-runtime.js";
import { buildReleaseCloseoutResult } from "../release-closeout-result-runtime.js";

function readRequestedPhaseKey(args: Record<string, unknown>): string | null {
  return typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0 ? args.phaseKey.trim() : null;
}

function buildPhaseSelection(
  requestedPhaseKey: string | null,
  canonicalPhaseKey: string | null
): {
  requestedPhaseKey: string | null;
  selectedPhaseKey: string | null;
  operationalPhaseKey: string | null;
  source: "argument" | "canonical";
  canonicalPhaseKey: string | null;
  matchesCanonical: boolean | null;
  mismatch: boolean;
  mismatchSeverity: "none" | "warning" | "unknown";
  warning: string | null;
} {
  const selectedPhaseKey = requestedPhaseKey ?? canonicalPhaseKey;
  const matchesCanonical =
    selectedPhaseKey !== null && canonicalPhaseKey !== null ? selectedPhaseKey === canonicalPhaseKey : null;
  const mismatch = matchesCanonical === false;
  const mismatchSeverity = mismatch ? "warning" : matchesCanonical === null ? "unknown" : "none";
  return {
    requestedPhaseKey,
    selectedPhaseKey,
    operationalPhaseKey: selectedPhaseKey,
    source: requestedPhaseKey ? "argument" : "canonical",
    canonicalPhaseKey,
    matchesCanonical,
    mismatch,
    mismatchSeverity,
    warning: mismatch
      ? `Requested phase ${selectedPhaseKey} differs from canonical workspace phase ${canonicalPhaseKey}; output is scoped to the requested phase.`
      : null
  };
}

function phaseReleaseOrchestrationStateRef(phaseKey: string | null): {
  command: string;
  commandLine: string;
  instructionPath: string;
} {
  return {
    command: "phase-release-orchestration-state",
    commandLine: phaseKey
      ? `pnpm exec wk run phase-release-orchestration-state '${JSON.stringify({ phaseKey })}'`
      : "pnpm exec wk run phase-release-orchestration-state '{}'",
    instructionPath: "src/modules/task-engine/instructions/phase-release-orchestration-state.md"
  };
}

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

  if (command.name === "phase-focus-dashboard") {
    const argObj = args as Record<string, unknown>;
    const phaseKeyArg =
      typeof argObj.phaseKey === "string" && argObj.phaseKey.trim().length > 0
        ? argObj.phaseKey.trim()
        : undefined;
    const phaseFocus = buildPhaseFocusDashboard({
      ctx,
      planning,
      phaseKey: phaseKeyArg
    });
    const data: Record<string, unknown> = { phaseFocus };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-focus-dashboard",
      message: phaseFocus.phaseKey
        ? `Phase focus dashboard for phase ${phaseFocus.phaseKey}`
        : "Phase focus dashboard (no canonical phase key)",
      data
    };
  }

  if (command.name === "phase-status") {
    return await runPhaseStatus(ctx, args as Record<string, unknown>, {
      tasks: store.getActiveTasks(),
      db: planning.sqliteDual.getDatabase(),
      dbPath: planning.sqliteDual.dbPath
    });
  }

  if (command.name === "phase-release-orchestration-state") {
    const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
    const phaseRes = resolveCanonicalPhase({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus
    });
    const requestedPhaseKey = readRequestedPhaseKey(args);
    const phaseSelection = buildPhaseSelection(requestedPhaseKey, phaseRes.canonicalPhaseKey);
    const phaseKey = phaseSelection.selectedPhaseKey;
    const phaseState = buildPhaseReleaseOrchestrationState({
      workspacePath: ctx.workspacePath,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      tasks: store.getActiveTasks(),
      phaseKey,
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      rolledOut: phaseKey ? wasWorkspacePhaseRolledOut(planning.sqliteDual.getDatabase(), phaseKey) : false
    });
    const data: Record<string, unknown> = {
      ...phaseState,
      phaseSelection,
      canonicalPhase: phaseRes
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-release-orchestration-state",
      message: `Phase release orchestration verdict: ${phaseState.verdict}`,
      data
    };
  }

  if (command.name === "phase-drain-delta") {
    const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
    const phaseRes = resolveCanonicalPhase({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      workspaceStatus
    });
    const requestedPhaseKey = readRequestedPhaseKey(args);
    const phaseSelection = buildPhaseSelection(requestedPhaseKey, phaseRes.canonicalPhaseKey);
    const phaseKey = phaseSelection.selectedPhaseKey;
    const parsedCursor = Object.hasOwn(args, "cursor") ? parsePhaseDrainDeltaCursor(args.cursor) : null;
    const delta = buildPhaseDrainDelta({
      workspacePath: ctx.workspacePath,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      tasks: store.getActiveTasks(),
      assignments: listAssignments(planning.sqliteDual.getDatabase(), {}),
      phaseKey,
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      rolledOut: phaseKey ? wasWorkspacePhaseRolledOut(planning.sqliteDual.getDatabase(), phaseKey) : false,
      planningGeneration: planning.sqliteDual.getPlanningGeneration(),
      cursor: parsedCursor,
      taskLimit: typeof args.taskLimit === "number" ? args.taskLimit : undefined,
      assignmentLimit: typeof args.assignmentLimit === "number" ? args.assignmentLimit : undefined
    });
    const data: Record<string, unknown> = {
      ...delta,
      phaseSelection,
      canonicalPhase: phaseRes
    };
    if (Object.hasOwn(args, "cursor") && parsedCursor === null) {
      data.cursorAccepted = false;
      data.cursorStatus = "invalid";
      data.cursorStatusReason = "Cursor must match the phase-drain-delta schema and carry valid high-water marks.";
      data.refreshRecommendation = {
        mode: "full-refresh",
        reason: "invalid-cursor",
        ref: phaseReleaseOrchestrationStateRef(phaseKey)
      };
    }
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "phase-drain-delta",
      message:
        data.refreshRecommendation && (data.refreshRecommendation as { mode: string }).mode === "full-refresh"
          ? "Phase drain delta requires a safe full refresh"
          : `Phase drain delta returned ${delta.changedTasks.length} task change(s) and ${delta.changedAssignments.length} assignment change(s)`,
      data
    };
  }

  if (command.name === "propose-release-version") {
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
    try {
      const proposal = proposeReleaseVersion({
        workspacePath: ctx.workspacePath,
        phaseKey,
        tasks: store.getActiveTasks()
      });
      const data: Record<string, unknown> = {
        schemaVersion: 1,
        ...proposal,
        remediation: { instructionPath: "src/modules/task-engine/instructions/propose-release-version.md" }
      };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: true,
        code: "propose-release-version",
        message: `Recommend version ${proposal.recommended} (${proposal.bump} bump from ${proposal.currentVersion})`,
        data
      };
    } catch (e) {
      return {
        ok: false,
        code: "propose-release-version-failed",
        message: (e as Error).message,
        remediation: { instructionPath: "src/modules/task-engine/instructions/propose-release-version.md" }
      };
    }
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
    const serviceSync = await buildPhaseServiceSyncPreflight(ctx);
    const phaseProjection = await buildPhaseProjectionCountGuardAsync({
      workspacePath: ctx.workspacePath,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
      localTasks: activeTasks,
      phaseKey
    });
    const blockingFindingCount =
      preflight.violationCount +
      readiness.remainingCount +
      strandedWork.findings.length +
      serviceSync.blockingFindingCount +
      phaseProjection.blockingFindingCount;
    const data: Record<string, unknown> = {
      ...preflight,
      canonicalPhase: phaseRes,
      includeInProgress,
      readiness,
      strandedWork,
      serviceSync,
      phaseProjection,
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

  if (command.name === "derive-validations") {
    const argObj = args as Record<string, unknown>;
    const phaseKey = typeof argObj.phaseKey === "string" && argObj.phaseKey.trim() ? argObj.phaseKey.trim() : null;
    const packageMeta = readPackageMetadata(ctx.workspacePath);
    const releaseVersion =
      typeof argObj.releaseVersion === "string" && argObj.releaseVersion.trim()
        ? argObj.releaseVersion.trim()
        : packageMeta.version;
    const gatesOutputPath =
      typeof argObj.gatesOutputPath === "string" && argObj.gatesOutputPath.trim()
        ? argObj.gatesOutputPath.trim()
        : releaseVersion
          ? defaultGatesOutputPath(ctx.workspacePath, releaseVersion)
          : null;
    const fragment = deriveValidationsFragment({
      phaseKey,
      gatesOutputPath,
      conclusion: typeof argObj.conclusion === "string" ? argObj.conclusion : undefined
    });
    const data: Record<string, unknown> = { fragment };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "derive-validations",
      message: `Derived ${fragment.validations.length} validation record(s) from ${fragment.source}`,
      data
    };
  }

  if (command.name === "derive-publish-artifacts") {
    const argObj = args as Record<string, unknown>;
    const packageMeta = readPackageMetadata(ctx.workspacePath);
    const version =
      typeof argObj.version === "string" && argObj.version.trim()
        ? argObj.version.trim()
        : packageMeta.version;
    const packageName =
      typeof argObj.packageName === "string" && argObj.packageName.trim()
        ? argObj.packageName.trim()
        : packageMeta.packageName;
    if (!version || !packageName) {
      return {
        ok: false,
        code: "derive-publish-artifacts-missing-version",
        message: "derive-publish-artifacts requires version and packageName (or package.json defaults)."
      };
    }
    const fragment = derivePublishArtifactsFragment({
      workspacePath: ctx.workspacePath,
      version,
      packageName,
      distTag: typeof argObj.distTag === "string" ? argObj.distTag : undefined
    });
    const data: Record<string, unknown> = { fragment };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "derive-publish-artifacts",
      message:
        fragment.degraded.length > 0
          ? `Derived publishArtifacts with ${fragment.degraded.length} degraded signal(s)`
          : `Derived ${fragment.publishArtifacts.length} publish artifact record(s)`,
      data
    };
  }

  if (command.name === "release-evidence-manifest") {
    const argObj = args as Record<string, unknown>;
    const packageMeta = readPackageMetadata(ctx.workspacePath);
    const resolved = resolveReleaseEvidenceCommandArgs({
      workspacePath: ctx.workspacePath,
      commandArgs: argObj,
      packageVersion: packageMeta.version
    });
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.code,
        message: resolved.message,
        data: resolved.details ? { details: resolved.details } : undefined
      };
    }
    const result = buildReleaseEvidenceManifest({
      workspacePath: ctx.workspacePath,
      tasks: store.getActiveTasks(),
      commandArgs: resolved.args
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        data: result.details ? { details: result.details } : undefined
      };
    }
    const data: Record<string, unknown> = {
      manifest: result.manifest,
      resolvedFrom: resolved.sources
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "release-evidence-manifest",
      message: "Built release evidence manifest",
      data
    };
  }

  if (command.name === "prepare-release-artifacts") {
    const result = await runPrepareReleaseArtifactsCommand(ctx, args as Record<string, unknown>);
    if (result.ok && result.data) {
      attachPolicyMeta(result.data, ctx, planning.sqliteDual.getPlanningGeneration());
    }
    return result;
  }

  if (command.name === "release-closeout-result") {
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
    const result = buildReleaseCloseoutResult({
      workspacePath: ctx.workspacePath,
      tasks: store.getActiveTasks(),
      commandArgs: argObj,
      phaseKey,
      planningGeneration: planning.sqliteDual.getPlanningGeneration()
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        data: result.details ? { details: result.details, canonicalPhase: phaseRes } : { canonicalPhase: phaseRes },
        remediation: { instructionPath: "src/modules/task-engine/instructions/release-closeout-result.md" }
      };
    }
    const data: Record<string, unknown> = {
      ...result.packet,
      canonicalPhase: phaseRes
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "release-closeout-result",
      message: `Built final release closeout result for phase ${phaseKey ?? "unknown"}`,
      data,
      remediation: { instructionPath: "src/modules/task-engine/instructions/release-closeout-result.md" }
    };
  }

  return null;
}
