import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { validateAgentActivityV1 } from "../../../core/validation/agent-orchestration/index.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import {
  buildAgentActivityLabel,
  clearAgentActivity,
  recordAgentActivity,
  resolveAgentActivityIdentity
} from "../agent-activity-recorder.js";
import {
  agentActivityLeaseToDashboardStatus,
  agentActivityLeaseToV1,
  deriveAgentActivityLifecycle,
  normalizeAgentActivityKind
} from "../agent-activity-store.js";

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanDetails(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function orchestrationValidationFailure(
  validated: Extract<ReturnType<typeof validateAgentActivityV1>, { ok: false }>
): ModuleCommandResult {
  const first = validated.issues?.[0];
  return {
    ok: false,
    code: first?.code ?? "invalid-agent-activity-v1",
    message: validated.message ?? "AgentActivity v1 validation failed.",
    remediation: { instructionPath: "src/modules/task-engine/instructions/set-agent-activity.md" },
    data: validated.issues ? { issues: validated.issues } : undefined
  };
}

export function resolveAgentActivityCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  const args = command.args ?? {};
  if (command.name === "set-agent-activity") {
    const kind = normalizeAgentActivityKind(args.kind);
    if (!kind) {
      return {
        ok: false,
        code: "invalid-agent-activity-kind",
        message: "set-agent-activity requires a supported kind.",
        remediation: { instructionPath: "src/modules/task-engine/instructions/set-agent-activity.md" }
      };
    }
    const identity = resolveAgentActivityIdentity(ctx, {
      activityId: args.activityId,
      agentId: args.agentId,
      sessionId: args.sessionId
    });
    const taskId = cleanText(args.taskId) ?? null;
    const commandName = cleanText(args.command) ?? null;
    const phaseKey = cleanText(args.phaseKey) ?? null;
    const prNumber = cleanNumber(args.prNumber);
    const version = cleanText(args.version) ?? null;
    const details = cleanDetails(args.details);
    const label =
      cleanText(args.label) ??
      buildAgentActivityLabel({ kind, taskId, command: commandName, phaseKey, prNumber, version, details });
    const now = cleanText(args.now) ?? new Date().toISOString();
    const ttlSeconds = cleanNumber(args.ttlSeconds);
    const ttl = ttlSeconds != null ? Math.min(3600, Math.max(30, Math.floor(ttlSeconds))) : 90;
    const expiresAt = new Date(Date.parse(now) + ttl * 1000).toISOString();
    const draftActivity = {
      activityId: identity.activityId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      agentDefinitionId: cleanText(args.agentDefinitionId),
      assignmentId: cleanText(args.assignmentId),
      taskId: taskId ?? undefined,
      phaseKey: phaseKey ?? undefined,
      kind,
      label,
      currentStep: cleanText(args.currentStep),
      command: commandName ?? undefined,
      hostHint: cleanText(args.hostHint),
      modelTier: cleanText(args.modelTier),
      modelHint: cleanText(args.modelHint),
      thinkingLevel: cleanText(args.thinkingLevel),
      updatedAt: now,
      expiresAt,
      details: details ?? undefined
    };
    const preflight = validateAgentActivityV1(draftActivity);
    if (!preflight.ok) {
      return orchestrationValidationFailure(preflight);
    }
    const lease = recordAgentActivity(ctx, planning, {
      activityId: identity.activityId,
      agentId: identity.agentId,
      sessionId: identity.sessionId,
      kind,
      label,
      agentDefinitionId: cleanText(args.agentDefinitionId),
      assignmentId: cleanText(args.assignmentId),
      currentStep: cleanText(args.currentStep),
      hostHint: cleanText(args.hostHint),
      modelTier: cleanText(args.modelTier),
      modelHint: cleanText(args.modelHint),
      thinkingLevel: cleanText(args.thinkingLevel),
      taskId,
      command: commandName,
      phaseKey,
      prNumber,
      version,
      details,
      now,
      ttlSeconds: ttl
    });
    const activityV1 = agentActivityLeaseToV1(lease);
    const lifecycle = deriveAgentActivityLifecycle(lease, now);
    return {
      ok: true,
      code: "agent-activity-set",
      message: lease.label,
      data: {
        schemaVersion: 1,
        lease,
        activityV1,
        lifecycle,
        agentStatus: agentActivityLeaseToDashboardStatus(lease, now)
      }
    };
  }

  if (command.name === "clear-agent-activity") {
    const changes = clearAgentActivity(ctx, planning, {
      activityId: cleanText(args.activityId),
      agentId: cleanText(args.agentId),
      sessionId: cleanText(args.sessionId),
      taskId: cleanText(args.taskId)
    });
    return {
      ok: true,
      code: "agent-activity-cleared",
      message: `Cleared ${String(changes)} agent activity lease(s).`,
      data: { schemaVersion: 1, changes }
    };
  }

  return null;
}
