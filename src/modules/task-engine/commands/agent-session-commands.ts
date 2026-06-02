import { randomUUID } from "node:crypto";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { buildAgentInstructionSurface } from "../../../core/agent-instruction-surface.js";
import { resolveRegistryAndConfig } from "../../../core/module-registry-resolve.js";
import { collectDoctorContractIssues } from "../../../cli/doctor-contract-validation.js";
import {
  assertAgentSessionsKitSchema,
  getSession,
  insertSession,
  listSessions,
  updateSessionPointers,
  updateSessionStatus,
  type AgentSessionRow
} from "../../agent-sessions/agent-session-store.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { readOptionalExpectedPlanningGeneration } from "../mutation-utils.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import { buildQueueHealthReport } from "../queue/queue-health.js";
import { getNextActions } from "../suggestions.js";
import { summarizeTeamAssignmentsForNextActions } from "../../team-execution/assignment-store.js";
import { buildMaintainerDeliveryHints } from "../maintainer-delivery-hints.js";
import { buildPhaseJournalSnapshotSummary } from "../phase-journal/phase-journal-snapshot-summary.js";
import { buildTaskIntakeReadoutBundle } from "../task-intake-readout-hints.js";
import { buildWorkspaceCoordinationStatus } from "../coordination/build-workspace-coordination-status.js";
import { isWishlistIntakeTask } from "../wishlist/wishlist-intake.js";
import { buildPhaseFocusDashboard } from "../dashboard/build-phase-focus-dashboard.js";
import { summarizeAgentRegistrySessionsForAgentSnapshot } from "../agent-registry-session-summary.js";

const AGENT_SESSION_HOST_HINTS = new Set(["cursor", "vscode", "cli", "manual"]);
const AGENT_SESSION_STATUSES = new Set(["open", "closed"]);

const OPEN_AGENT_SESSION_INSTRUCTION = "src/modules/task-engine/instructions/open-agent-session.md";
const UPDATE_AGENT_SESSION_INSTRUCTION = "src/modules/task-engine/instructions/update-agent-session.md";
const CLOSE_AGENT_SESSION_INSTRUCTION = "src/modules/task-engine/instructions/close-agent-session.md";
const GET_AGENT_SESSION_INSTRUCTION = "src/modules/task-engine/instructions/get-agent-session.md";

type BridgedSubagentSession = {
  kind: "subagent-session-v1";
  subagentSessionId: string;
  subagentId: string;
  executionTaskId: string | null;
  status: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readRequiredId(args: Record<string, unknown>, key: string): string | null {
  const raw = args[key];
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalId(args: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.hasOwn(args, key)) {
    return undefined;
  }
  const raw = args[key];
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalHostHint(
  args: Record<string, unknown>,
  key: string
): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  if (!Object.hasOwn(args, key)) {
    return { ok: true, value: undefined };
  }
  const raw = args[key];
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: `${key} must be one of: cursor, vscode, cli, manual` };
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { ok: true, value: null };
  }
  if (!AGENT_SESSION_HOST_HINTS.has(normalized)) {
    return { ok: false, message: `${key} must be one of: cursor, vscode, cli, manual` };
  }
  return { ok: true, value: normalized };
}

function readOptionalModelTier(args: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(args, "modelTier")) {
    return undefined;
  }
  const raw = args.modelTier;
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalMetadata(args: Record<string, unknown>): Record<string, unknown> | null | undefined {
  if (!Object.hasOwn(args, "metadata")) {
    return undefined;
  }
  const raw = args.metadata;
  if (raw === null) {
    return null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function readBridgeFromMetadata(metadata: Record<string, unknown> | null): BridgedSubagentSession | null {
  if (!metadata) {
    return null;
  }
  const rawBridge = metadata.bridge;
  if (!rawBridge || typeof rawBridge !== "object" || Array.isArray(rawBridge)) {
    return null;
  }
  const bridge = rawBridge as Record<string, unknown>;
  if (bridge.kind !== "subagent-session-v1") {
    return null;
  }
  if (typeof bridge.subagentSessionId !== "string" || bridge.subagentSessionId.trim().length === 0) {
    return null;
  }
  if (typeof bridge.subagentId !== "string" || bridge.subagentId.trim().length === 0) {
    return null;
  }
  if (bridge.executionTaskId !== null && typeof bridge.executionTaskId !== "string") {
    return null;
  }
  if (typeof bridge.status !== "string" || bridge.status.trim().length === 0) {
    return null;
  }
  return {
    kind: "subagent-session-v1",
    subagentSessionId: bridge.subagentSessionId,
    subagentId: bridge.subagentId,
    executionTaskId: bridge.executionTaskId,
    status: bridge.status
  };
}

function withDerivedBridge(row: AgentSessionRow): Record<string, unknown> {
  const bridge = readBridgeFromMetadata(row.metadata);
  return {
    ...row,
    bridge
  };
}

function readBridgedSubagentSession(
  db: import("better-sqlite3").Database,
  args: Record<string, unknown>
):
  | { ok: true; bridge: BridgedSubagentSession | null }
  | { ok: false; code: string; message: string; remediationPath?: string } {
  if (!Object.hasOwn(args, "subagentSessionId")) {
    return { ok: true, bridge: null };
  }
  const subagentSessionId = readRequiredId(args, "subagentSessionId");
  if (!subagentSessionId) {
    return {
      ok: false,
      code: "invalid-args",
      message: "subagentSessionId must be a non-empty string"
    };
  }
  const row = db
    .prepare(
      "SELECT id, definition_id, execution_task_id, status FROM kit_subagent_sessions WHERE id = ?"
    )
    .get(subagentSessionId) as
    | { id: string; definition_id: string; execution_task_id: string | null; status: string }
    | undefined;
  if (!row) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Subagent session '${subagentSessionId}' not found`,
      remediationPath: GET_AGENT_SESSION_INSTRUCTION
    };
  }
  return {
    ok: true,
    bridge: {
      kind: "subagent-session-v1",
      subagentSessionId: row.id,
      subagentId: row.definition_id,
      executionTaskId: row.execution_task_id,
      status: row.status
    }
  };
}

function mergeBridgeMetadata(
  metadata: Record<string, unknown> | null,
  bridge: BridgedSubagentSession | null
): Record<string, unknown> | null {
  if (!bridge) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    bridge
  };
}

export function resolveAgentSessionRecordCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  const name = command.name;
  if (
    name !== "open-agent-session" &&
    name !== "get-agent-session" &&
    name !== "list-agent-sessions" &&
    name !== "update-agent-session" &&
    name !== "close-agent-session"
  ) {
    return null;
  }

  const schemaOk = assertAgentSessionsKitSchema(planning.sqliteDual.dbPath);
  if (!schemaOk.ok) {
    return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
  }

  const args = command.args ?? {};
  const db = planning.sqliteDual.getDatabase();
  const planningGen = planning.sqliteDual.getPlanningGeneration();

  if (name === "list-agent-sessions") {
    const agentId = readOptionalId(args, "agentId");
    if (Object.hasOwn(args, "agentId") && agentId === undefined) {
      return { ok: false, code: "invalid-args", message: "agentId must be a string when provided" };
    }
    let status: string | undefined;
    if (Object.hasOwn(args, "status")) {
      const raw = readRequiredId(args, "status");
      if (!raw || !AGENT_SESSION_STATUSES.has(raw)) {
        return { ok: false, code: "invalid-args", message: "status must be one of: open, closed" };
      }
      status = raw;
    }
    const sessions = listSessions(db, {
      ...(typeof agentId === "string" ? { agentId } : {}),
      ...(typeof status === "string" ? { status } : {})
    }).map(withDerivedBridge);
    const data: Record<string, unknown> = {
      schemaVersion: 1,
      sessions,
      count: sessions.length
    };
    attachPolicyMeta(data, ctx, planningGen);
    return {
      ok: true,
      code: "agent-sessions-listed",
      message: `${sessions.length} session(s)`,
      data
    };
  }

  if (name === "get-agent-session") {
    const sessionId = readRequiredId(args, "sessionId");
    if (!sessionId) {
      return {
        ok: false,
        code: "invalid-args",
        message: "get-agent-session requires sessionId",
        remediation: { instructionPath: GET_AGENT_SESSION_INSTRUCTION }
      };
    }
    const session = getSession(db, sessionId);
    if (!session) {
      return { ok: false, code: "task-not-found", message: `Session '${sessionId}' not found` };
    }
    const data: Record<string, unknown> = { schemaVersion: 1, session: withDerivedBridge(session) };
    attachPolicyMeta(data, ctx, planningGen);
    return {
      ok: true,
      code: "agent-session-retrieved",
      message: `Session '${sessionId}'`,
      data
    };
  }

  const instructionPath =
    name === "open-agent-session"
      ? OPEN_AGENT_SESSION_INSTRUCTION
      : name === "update-agent-session"
        ? UPDATE_AGENT_SESSION_INSTRUCTION
        : CLOSE_AGENT_SESSION_INSTRUCTION;
  const gate = planningGenPolicyGate(ctx, args, instructionPath, planningGen);
  if (gate.block) {
    return gate.block;
  }

  if (name === "open-agent-session") {
    const sessionId = readOptionalId(args, "sessionId");
    if (Object.hasOwn(args, "sessionId") && sessionId === undefined) {
      return { ok: false, code: "invalid-args", message: "sessionId must be a string when provided" };
    }
    const resolvedSessionId = typeof sessionId === "string" ? sessionId : randomUUID();
    if (getSession(db, resolvedSessionId)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: `Session '${resolvedSessionId}' already exists`
      };
    }

    const bridgeRead = readBridgedSubagentSession(db, args);
    if (!bridgeRead.ok) {
      return {
        ok: false,
        code: bridgeRead.code,
        message: bridgeRead.message,
        ...(bridgeRead.remediationPath
          ? { remediation: { instructionPath: bridgeRead.remediationPath } }
          : {})
      };
    }
    const bridged = bridgeRead.bridge;

    const hostHint = readOptionalHostHint(args, "hostHint");
    if (!hostHint.ok) {
      return { ok: false, code: "invalid-args", message: hostHint.message };
    }
    const modelTier = readOptionalModelTier(args);
    if (Object.hasOwn(args, "modelTier") && modelTier === undefined) {
      return { ok: false, code: "invalid-args", message: "modelTier must be a string when provided" };
    }
    const metadata = readOptionalMetadata(args);
    if (Object.hasOwn(args, "metadata") && metadata === undefined) {
      return { ok: false, code: "invalid-args", message: "metadata must be an object when provided" };
    }
    const currentAssignmentId = readOptionalId(args, "currentAssignmentId");
    if (Object.hasOwn(args, "currentAssignmentId") && currentAssignmentId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentAssignmentId must be a string when provided" };
    }
    const currentActivityId = readOptionalId(args, "currentActivityId");
    if (Object.hasOwn(args, "currentActivityId") && currentActivityId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentActivityId must be a string when provided" };
    }
    const currentTaskId = readOptionalId(args, "currentTaskId");
    if (Object.hasOwn(args, "currentTaskId") && currentTaskId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentTaskId must be a string when provided" };
    }

    const explicitAgentId = readOptionalId(args, "agentId");
    if (Object.hasOwn(args, "agentId") && explicitAgentId === undefined) {
      return { ok: false, code: "invalid-args", message: "agentId must be a string when provided" };
    }
    const agentId =
      typeof explicitAgentId === "string"
        ? explicitAgentId
        : bridged
          ? `subagent:${bridged.subagentId}`
          : null;
    if (!agentId) {
      return {
        ok: false,
        code: "invalid-args",
        message: "open-agent-session requires agentId or subagentSessionId",
        remediation: { instructionPath: OPEN_AGENT_SESSION_INSTRUCTION }
      };
    }

    const now = nowIso();
    const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(args);
    const txOptions = {
      persistScope: "incremental" as const,
      ...(expectedPlanningGeneration !== undefined ? { expectedPlanningGeneration } : {}),
      ...(typeof currentTaskId === "string" ? { dirtyTaskIds: [currentTaskId] } : {})
    };
    planning.sqliteDual.withTransaction(() => {
      insertSession(db, {
        id: resolvedSessionId,
        agentId,
        hostHint: hostHint.value ?? null,
        modelTier: modelTier ?? null,
        currentAssignmentId: currentAssignmentId ?? null,
        currentActivityId: currentActivityId ?? null,
        currentTaskId: currentTaskId ?? null,
        status: "open",
        metadata: mergeBridgeMetadata(metadata ?? null, bridged),
        now
      });
    }, txOptions);

    const session = getSession(db, resolvedSessionId)!;
    const data: Record<string, unknown> = { schemaVersion: 1, session: withDerivedBridge(session) };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
    return {
      ok: true,
      code: "agent-session-opened",
      message: `Opened session '${resolvedSessionId}'`,
      data
    };
  }

  if (name === "update-agent-session") {
    const sessionId = readRequiredId(args, "sessionId");
    if (!sessionId) {
      return {
        ok: false,
        code: "invalid-args",
        message: "update-agent-session requires sessionId",
        remediation: { instructionPath: UPDATE_AGENT_SESSION_INSTRUCTION }
      };
    }
    const existing = getSession(db, sessionId);
    if (!existing) {
      return { ok: false, code: "task-not-found", message: `Session '${sessionId}' not found` };
    }
    if (existing.status !== "open") {
      return {
        ok: false,
        code: "invalid-transition",
        message: `Session '${sessionId}' is '${existing.status}' and cannot be updated`
      };
    }

    const hostHint = readOptionalHostHint(args, "hostHint");
    if (!hostHint.ok) {
      return { ok: false, code: "invalid-args", message: hostHint.message };
    }
    const modelTier = readOptionalModelTier(args);
    if (Object.hasOwn(args, "modelTier") && modelTier === undefined) {
      return { ok: false, code: "invalid-args", message: "modelTier must be a string when provided" };
    }
    const metadata = readOptionalMetadata(args);
    if (Object.hasOwn(args, "metadata") && metadata === undefined) {
      return { ok: false, code: "invalid-args", message: "metadata must be an object when provided" };
    }
    const currentAssignmentId = readOptionalId(args, "currentAssignmentId");
    if (Object.hasOwn(args, "currentAssignmentId") && currentAssignmentId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentAssignmentId must be a string when provided" };
    }
    const currentActivityId = readOptionalId(args, "currentActivityId");
    if (Object.hasOwn(args, "currentActivityId") && currentActivityId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentActivityId must be a string when provided" };
    }
    const currentTaskId = readOptionalId(args, "currentTaskId");
    if (Object.hasOwn(args, "currentTaskId") && currentTaskId === undefined) {
      return { ok: false, code: "invalid-args", message: "currentTaskId must be a string when provided" };
    }
    const bridgeRead = readBridgedSubagentSession(db, args);
    if (!bridgeRead.ok) {
      return {
        ok: false,
        code: bridgeRead.code,
        message: bridgeRead.message,
        ...(bridgeRead.remediationPath
          ? { remediation: { instructionPath: bridgeRead.remediationPath } }
          : {})
      };
    }
    const bridged = bridgeRead.bridge;

    const nextHostHint = hostHint.value !== undefined ? hostHint.value : existing.hostHint;
    const nextModelTier = modelTier !== undefined ? modelTier : existing.modelTier;
    const nextAssignmentId =
      currentAssignmentId !== undefined ? currentAssignmentId : existing.currentAssignmentId;
    const nextActivityId = currentActivityId !== undefined ? currentActivityId : existing.currentActivityId;
    const nextTaskId = currentTaskId !== undefined ? currentTaskId : existing.currentTaskId;
    const baseMetadata = metadata !== undefined ? metadata : existing.metadata;
    const nextMetadata = mergeBridgeMetadata(baseMetadata, bridged);

    const now = nowIso();
    const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(args);
    const txOptions = {
      persistScope: "incremental" as const,
      ...(expectedPlanningGeneration !== undefined ? { expectedPlanningGeneration } : {}),
      ...(typeof nextTaskId === "string" ? { dirtyTaskIds: [nextTaskId] } : {})
    };
    planning.sqliteDual.withTransaction(() => {
      updateSessionPointers(db, {
        id: sessionId,
        hostHint: nextHostHint,
        modelTier: nextModelTier,
        currentAssignmentId: nextAssignmentId,
        currentActivityId: nextActivityId,
        currentTaskId: nextTaskId,
        metadata: nextMetadata,
        now
      });
    }, txOptions);

    const session = getSession(db, sessionId)!;
    const data: Record<string, unknown> = { schemaVersion: 1, session: withDerivedBridge(session) };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
    return {
      ok: true,
      code: "agent-session-updated",
      message: `Updated session '${sessionId}'`,
      data
    };
  }

  const sessionId = readRequiredId(args, "sessionId");
  if (!sessionId) {
    return {
      ok: false,
      code: "invalid-args",
      message: "close-agent-session requires sessionId",
      remediation: { instructionPath: CLOSE_AGENT_SESSION_INSTRUCTION }
    };
  }
  const existing = getSession(db, sessionId);
  if (!existing) {
    return { ok: false, code: "task-not-found", message: `Session '${sessionId}' not found` };
  }

  const now = nowIso();
  const expectedPlanningGeneration = readOptionalExpectedPlanningGeneration(args);
  const txOptions = {
    persistScope: "incremental" as const,
    ...(expectedPlanningGeneration !== undefined ? { expectedPlanningGeneration } : {}),
    ...(typeof existing.currentTaskId === "string" ? { dirtyTaskIds: [existing.currentTaskId] } : {})
  };
  planning.sqliteDual.withTransaction(() => {
    updateSessionStatus(db, sessionId, "closed", now);
  }, txOptions);

  const session = getSession(db, sessionId)!;
  const data: Record<string, unknown> = { schemaVersion: 1, session: withDerivedBridge(session) };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration(), gate.warnings);
  return {
    ok: true,
    code: "agent-session-closed",
    message: `Closed session '${sessionId}'`,
    data
  };
}

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
  const agentRegistrySessionContext = summarizeAgentRegistrySessionsForAgentSnapshot(
    planning.sqliteDual.getDatabase(),
    planning.sqliteDual.dbPath
  );
  const maintainerDelivery = buildMaintainerDeliveryHints({
    tasks,
    canonicalPhaseKey: phaseRes.canonicalPhaseKey,
    suggestedNext: suggestion.suggestedNext ? { id: suggestion.suggestedNext.id } : null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const proposedHeadlineTasks = tasks
    .filter((t) => t.status === "proposed" && !isWishlistIntakeTask(t))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 5);
  const intakeBundle = buildTaskIntakeReadoutBundle({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    suggestedNext: suggestion.suggestedNext,
    proposedHeadlineTasks: proposedHeadlineTasks.length > 0 ? proposedHeadlineTasks : undefined
  });
  const phaseJournal = buildPhaseJournalSnapshotSummary(
    planning.sqliteDual.getDatabase(),
    phaseRes.canonicalPhaseKey
  );
  let workspaceCoordination: Record<string, unknown> | undefined;
  try {
    const c = buildWorkspaceCoordinationStatus(ctx);
    workspaceCoordination = {
      posture: c.posture,
      authorityRole: c.authorityRole,
      discoverCommand: "pnpm exec wk run workspace-coordination-status '{}'"
    };
  } catch {
    workspaceCoordination = undefined;
  }
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
    agentRegistrySessionContext,
    maintainerDelivery,
    ...intakeBundle,
    ...(phaseJournal ? { phaseJournal } : {}),
    ...(workspaceCoordination ? { workspaceCoordination } : {})
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
        listCommands: "pnpm exec wk run --list-commands",
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
    if (projection === "phaseFocus") {
      const phaseKeyArg =
        typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0
          ? args.phaseKey.trim()
          : undefined;
      snapshotData.phaseFocus = buildPhaseFocusDashboard({
        ctx,
        planning,
        phaseKey: phaseKeyArg
      });
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
