import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import {
  buildAgentActivityLabel,
  clearAgentActivity,
  recordAgentActivity
} from "../agent-activity-recorder.js";
import { agentActivityLeaseToDashboardStatus, normalizeAgentActivityKind } from "../agent-activity-store.js";

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
    const taskId = cleanText(args.taskId) ?? null;
    const commandName = cleanText(args.command) ?? null;
    const phaseKey = cleanText(args.phaseKey) ?? null;
    const prNumber = cleanNumber(args.prNumber);
    const version = cleanText(args.version) ?? null;
    const lease = recordAgentActivity(ctx, planning, {
      activityId: cleanText(args.activityId),
      agentId: cleanText(args.agentId),
      sessionId: cleanText(args.sessionId),
      kind,
      label:
        cleanText(args.label) ??
        buildAgentActivityLabel({ kind, taskId, command: commandName, phaseKey, prNumber, version }),
      taskId,
      command: commandName,
      phaseKey,
      prNumber,
      version,
      details: cleanDetails(args.details),
      ttlSeconds: cleanNumber(args.ttlSeconds)
    });
    return {
      ok: true,
      code: "agent-activity-set",
      message: lease.label,
      data: {
        schemaVersion: 1,
        lease,
        agentStatus: agentActivityLeaseToDashboardStatus(lease)
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