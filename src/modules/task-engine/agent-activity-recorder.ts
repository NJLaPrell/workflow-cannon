import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { DashboardAgentStatusKind } from "../../contracts/dashboard-summary-run.js";
import type { OpenedPlanningStores } from "./persistence/planning-open.js";
import type { TaskEntity } from "./types.js";
import {
  clearAgentActivityLeases,
  normalizeAgentActivityKind,
  setAgentActivityLease,
  type AgentActivityLease
} from "./agent-activity-store.js";

const DEFAULT_AGENT_ID = "workflow-cannon";
const DEFAULT_SESSION_ID = "default";
const DEFAULT_TTL_SECONDS = 10 * 60;

export type AgentActivityIdentityInput = {
  activityId?: unknown;
  agentId?: unknown;
  sessionId?: unknown;
};

export type RecordAgentActivityInput = AgentActivityIdentityInput & {
  kind: DashboardAgentStatusKind;
  label?: string | null;
  taskId?: string | null;
  command?: string | null;
  phaseKey?: string | null;
  prNumber?: number | null;
  version?: string | null;
  details?: Record<string, unknown> | null;
  now?: string | null;
  ttlSeconds?: number | null;
};

export type ClearAgentActivityInput = AgentActivityIdentityInput & {
  taskId?: string | null;
};

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function detailsText(details: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!details) return "";
  for (const key of keys) {
    const value = cleanText(details[key]);
    if (value) return value;
  }
  return "";
}

function positiveInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function pullRequestNumberFromUrl(value: unknown): number | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const match = raw.match(/\/pull\/(\d+)(?:\b|$|[/?#])/);
  return match ? positiveInteger(match[1]) : null;
}

function resolvePullRequestNumber(args: {
  prNumber?: number | null;
  details?: Record<string, unknown> | null;
}): number | null {
  return (
    positiveInteger(args.prNumber) ??
    positiveInteger(args.details?.prNumber) ??
    positiveInteger(args.details?.pullRequestNumber) ??
    positiveInteger(args.details?.pr_number) ??
    pullRequestNumberFromUrl(args.details?.prUrl) ??
    pullRequestNumberFromUrl(args.details?.pullRequestUrl)
  );
}

function resolveVersion(args: { version?: string | null; details?: Record<string, unknown> | null }): string {
  return cleanText(args.version) || detailsText(args.details, ["releaseVersion", "version", "buildVersion"]);
}

function resolvePhaseKey(args: { phaseKey?: string | null; details?: Record<string, unknown> | null }): string {
  return cleanText(args.phaseKey) || detailsText(args.details, ["phaseKey", "phase"]);
}

function formatPhaseLabel(phaseKey: string): string {
  return /^phase\b/i.test(phaseKey) ? phaseKey : `Phase ${phaseKey}`;
}

function resolveReviewItem(args: { taskId?: string | null; details?: Record<string, unknown> | null }): string {
  return (
    cleanText(args.taskId) ||
    detailsText(args.details, ["reviewItemId", "approvalItemId", "itemId", "taskId", "approvalId"])
  );
}

function resolveValidationLabel(args: {
  command?: string | null;
  details?: Record<string, unknown> | null;
}): string {
  return detailsText(args.details, ["validationLabel", "validationCommand", "checkName"]) || cleanText(args.command);
}

function cleanTtlSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TTL_SECONDS;
  return Math.min(60 * 60, Math.max(30, Math.floor(n)));
}

export function resolveAgentActivityIdentity(
  ctx: ModuleLifecycleContext,
  input: AgentActivityIdentityInput = {}
): { agentId: string; sessionId: string; activityId: string } {
  const agentId = cleanText(input.agentId, cleanText(ctx.resolvedActor, DEFAULT_AGENT_ID));
  const sessionId = cleanText(input.sessionId, cleanText(process.env.WORKSPACE_KIT_AGENT_SESSION_ID, DEFAULT_SESSION_ID));
  const activityId = cleanText(input.activityId, `current:${agentId}:${sessionId}`);
  return { agentId, sessionId, activityId };
}

export function buildAgentActivityLabel(args: {
  kind: DashboardAgentStatusKind;
  taskId?: string | null;
  command?: string | null;
  phaseKey?: string | null;
  prNumber?: number | null;
  version?: string | null;
  details?: Record<string, unknown> | null;
}): string {
  const taskId = cleanText(args.taskId);
  const command = cleanText(args.command);
  switch (args.kind) {
    case "planning":
      return "Planning Interview";
    case "blocked":
      return taskId ? `Blocked on Task ${taskId}` : "Blocked";
    case "working_task":
      return taskId ? `Working on Task ${taskId}` : "Working on Task";
    case "validating":
      return resolveValidationLabel(args) ? `Validating ${resolveValidationLabel(args)}` : "Validating";
    case "releasing":
      if (resolveVersion(args)) return `Releasing Build ${resolveVersion(args)}`;
      if (resolvePhaseKey(args)) return `Releasing ${formatPhaseLabel(resolvePhaseKey(args))}`;
      return "Releasing";
    case "reviewing_pr":
      return resolvePullRequestNumber(args) != null
        ? `Reviewing Pull Request ${String(resolvePullRequestNumber(args))}`
        : "Reviewing Pull Request";
    case "reviewing_item":
      return resolveReviewItem(args) ? `Reviewing Item ${resolveReviewItem(args)}` : "Reviewing Item";
    case "awaiting_policy_approval":
      return resolveReviewItem(args)
        ? `Awaiting Policy Approval for ${resolveReviewItem(args)}`
        : "Awaiting Policy Approval";
    case "awaiting_human_gate":
      return command ? `Awaiting Human Gate for ${command}` : "Awaiting Human Gate";
    case "delegating_task":
      return taskId ? `Delegating Task ${taskId}` : "Delegating Task";
    case "ready_task":
      return taskId ? `Ready Task ${taskId}` : "Ready Task";
    case "unavailable":
      return "Unavailable";
    case "awaiting_instruction":
    default:
      return "Awaiting Instruction";
  }
}

export function recordAgentActivity(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  input: RecordAgentActivityInput
): AgentActivityLease {
  if (!normalizeAgentActivityKind(input.kind)) {
    throw new Error(`Unsupported agent activity kind '${String(input.kind)}'`);
  }
  const identity = resolveAgentActivityIdentity(ctx, input);
  const now = cleanText(input.now, new Date().toISOString());
  const ttlMs = cleanTtlSeconds(input.ttlSeconds) * 1000;
  const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
  const label = cleanText(input.label, buildAgentActivityLabel(input));
  const leaseInput = {
    ...identity,
    kind: input.kind,
    label,
    now,
    expiresAt,
    taskId: cleanText(input.taskId) || null,
    command: cleanText(input.command) || null,
    phaseKey: cleanText(input.phaseKey) || null,
    prNumber: input.prNumber ?? null,
    version: cleanText(input.version) || null,
    details: input.details ?? null
  };
  try {
    return setAgentActivityLease(planning.sqliteDual.getDatabase(), leaseInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!leaseInput.taskId || !message.includes("FOREIGN KEY")) {
      throw err;
    }
    return setAgentActivityLease(planning.sqliteDual.getDatabase(), {
      ...leaseInput,
      taskId: null,
      details: { ...(leaseInput.details ?? {}), taskId: leaseInput.taskId }
    });
  }
}

export function recordAgentActivityBestEffort(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  input: RecordAgentActivityInput
): AgentActivityLease | null {
  try {
    return recordAgentActivity(ctx, planning, input);
  } catch {
    return null;
  }
}

export function clearAgentActivity(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  input: ClearAgentActivityInput = {}
): number {
  const identity = resolveAgentActivityIdentity(ctx, input);
  return clearAgentActivityLeases(planning.sqliteDual.getDatabase(), {
    activityId: cleanText(input.activityId) || identity.activityId,
    agentId: cleanText(input.agentId) || undefined,
    sessionId: cleanText(input.sessionId) || undefined
  });
}

export function clearAgentActivityBestEffort(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  input: ClearAgentActivityInput = {}
): number {
  try {
    return clearAgentActivity(ctx, planning, input);
  } catch {
    return 0;
  }
}

export function recordTaskTransitionActivityBestEffort(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: { task: TaskEntity | undefined; taskId: string; action: string; command: string }
): void {
  if (args.action === "start" || args.action === "unblock") {
    recordAgentActivityBestEffort(ctx, planning, {
      kind: "working_task",
      taskId: args.taskId,
      command: args.command,
      phaseKey: args.task?.phaseKey ?? null
    });
    return;
  }
  if (args.action === "block") {
    recordAgentActivityBestEffort(ctx, planning, {
      kind: "blocked",
      taskId: args.taskId,
      command: args.command,
      phaseKey: args.task?.phaseKey ?? null
    });
    return;
  }
  if (["complete", "pause", "cancel", "decline", "reject"].includes(args.action)) {
    clearAgentActivityBestEffort(ctx, planning, { taskId: args.taskId });
  }
}