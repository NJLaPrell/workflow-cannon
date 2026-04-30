import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { buildAgentInstructionSurface } from "../../../core/agent-instruction-surface.js";
import { resolveRegistryAndConfig } from "../../../core/module-registry-resolve.js";
import { collectDoctorContractIssues } from "../../../cli/doctor-contract-validation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import { buildQueueHealthReport } from "../queue/queue-health.js";
import { getNextActions } from "../suggestions.js";
import { summarizeTeamAssignmentsForNextActions } from "../../team-execution/assignment-store.js";
import { buildMaintainerDeliveryHints } from "../maintainer-delivery-hints.js";

export async function composeAgentSessionSnapshotPayload(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): Promise<Record<string, unknown>> {
  const tasks = planning.taskStore.getActiveTasks();
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
  const suggestion = getNextActions(tasks);
  const qh = buildQueueHealthReport({
    tasks,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const doctorKitPhaseIssues: Array<{ path: string; reason: string }> = [];
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
  const teamExecutionContext = summarizeTeamAssignmentsForNextActions(
    planning.sqliteDual.getDatabase(),
    (id) => taskTitleById.get(id) ?? null
  );
  const maintainerDelivery = buildMaintainerDeliveryHints({
    tasks,
    canonicalPhaseKey: phaseRes.canonicalPhaseKey,
    suggestedNext: suggestion.suggestedNext ? { id: suggestion.suggestedNext.id } : null
  });
  return {
    schemaVersion: 1,
    refreshedAt: new Date().toISOString(),
    suggestedNext: suggestion.suggestedNext
      ? {
          id: suggestion.suggestedNext.id,
          title: suggestion.suggestedNext.title,
          status: suggestion.suggestedNext.status
        }
      : null,
    stateSummary: suggestion.stateSummary,
    queueHealthSummary: qh.summary,
    canonicalPhase: {
      canonicalPhaseKey: phaseRes.canonicalPhaseKey,
      phaseSource: phaseRes.source,
      configMatchesWorkspaceStatus: phaseRes.configMatchesWorkspaceStatus
    },
    doctorKitPhaseIssues,
    teamExecutionContext,
    maintainerDelivery
  };
}

/**
 * `agent-session-snapshot` and `agent-bootstrap` (after planning stores open).
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolveAgentBootstrapOrSnapshot(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): Promise<ModuleCommandResult | null> {
  if (command.name !== "agent-session-snapshot" && command.name !== "agent-bootstrap") {
    return null;
  }
  const args = command.args ?? {};
  if (command.name === "agent-bootstrap") {
    const doctorIssues = await collectDoctorContractIssues(ctx.workspacePath);
    if (doctorIssues.length > 0) {
      const data: Record<string, unknown> = { doctor: { ok: false, issues: doctorIssues } };
      attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
      return {
        ok: false,
        code: "agent-bootstrap-doctor-failed",
        message: `Doctor contract check failed (${doctorIssues.length} issue(s)); run workspace-kit doctor and fix reported paths.`,
        data
      };
    }
  }
  const snapshotData = await composeAgentSessionSnapshotPayload(ctx, planning);
  attachPolicyMeta(snapshotData, ctx, planning.sqliteDual.getPlanningGeneration());
  if (command.name === "agent-bootstrap") {
    snapshotData.doctor = { ok: true, issues: [] as Array<{ path: string; reason: string }> };
    snapshotData.cliFootguns = {
      canonicalInvoke: "pnpm exec wk run …",
      avoidPnpmRunWk:
        "`pnpm run wk run` can inject a stray `--` before the subcommand and break JSON argv — use `pnpm exec wk`",
      policyApprovalLanes:
        "Sensitive `wk run` commands: JSON `policyApproval` on argv; `WORKSPACE_KIT_POLICY_APPROVAL` is for init/upgrade/config only — `.ai/POLICY-APPROVAL.md`",
      planningGeneration:
        "When `tasks.planningGenerationPolicy` is require, pass `expectedPlanningGeneration` from `list-tasks`, `get-next-actions`, or a prior mutation response",
      discovery: {
        commandMenuJson: "pnpm exec wk run --json",
        doctorJson: "pnpm exec wk doctor --json",
        schemaOnly: "pnpm exec wk run <command> --schema-only '{}'",
        snippets: ".ai/agent-cli-snippets/INDEX.json"
      }
    };
    const projection = (args as Record<string, unknown>).projection;
    if (projection === "lean") {
      const { defaultRegistryModules } = await import("../../index.js");
      const { registry, effective } = await resolveRegistryAndConfig(
        ctx.workspacePath,
        defaultRegistryModules,
        (ctx.effectiveConfig ?? {}) as Record<string, unknown>
      );
      snapshotData.instructionSurface = buildAgentInstructionSurface(
        registry.getAllModules(),
        registry,
        {
          workspacePath: ctx.workspacePath,
          effectiveConfig: effective as Record<string, unknown>,
          projection: "lean"
        }
      );
    }
    return {
      ok: true,
      code: "agent-bootstrap",
      message: "Doctor passed; composed session snapshot for agent cold start",
      data: snapshotData
    };
  }
  return {
    ok: true,
    code: "agent-session-snapshot",
    message: "Read-only composed snapshot for session reload",
    data: snapshotData
  };
}
