import { execFileSync } from "node:child_process";

import { buildPhaseCloseoutReadiness, buildPhaseDeliveryPreflight } from "./delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "./maintainer-delivery-policy-resolver.js";
import { inferTaskPhaseKey, parseLeadingPhaseOrdinal } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";
import { listAssignments, type TeamAssignmentRow } from "../team-execution/assignment-store.js";

export const PHASE_RELEASE_ORCHESTRATION_STATE_SCHEMA_VERSION = 1 as const;
export const PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT = 10;
export const PHASE_DRAIN_DELTA_SCHEMA_VERSION = 1 as const;
export const PHASE_DRAIN_DELTA_TASK_LIMIT = 10;
export const PHASE_DRAIN_DELTA_ASSIGNMENT_LIMIT = 10;
export const PHASE_DRAIN_DELTA_OVERFLOW_REF_LIMIT = 10;

export type PhaseReleasePathVerdict =
  | "ready-to-ship"
  | "tasks-remaining"
  | "blocked"
  | "closeout-pending"
  | "release-running"
  | "post-release";

export type PhaseReleaseCommandRef = {
  command: string;
  commandLine: string;
  instructionPath: string;
};

export type PhaseReleaseReadinessFinding = {
  taskId: string;
  title: string;
  status: string;
};

export type PhaseReleaseMissingArtifact = {
  taskId: string;
  title: string;
  status: string;
  code: string;
  message: string;
  evidenceRefs: string[];
};

export type PhaseReleasePublishSafetyReason = {
  code: string;
  message: string;
  ref: PhaseReleaseCommandRef;
};

export type PhaseReleasePathInputs = {
  phaseKey: string | null;
  currentKitPhase: string | null;
  gitBranch: string | null;
  releaseBranch: string | null;
  blockedCount: number;
  nonTerminalCount: number;
  closeoutPassed: boolean;
  preflightViolationCount: number;
  rolledOut: boolean;
};

export type PhaseDrainDeltaHighWaterMark = {
  updatedAt: string | null;
  ids: string[];
};

export type PhaseDrainDeltaCursor = {
  schemaVersion: 1;
  phaseKey: string | null;
  planningGeneration: number;
  verdict: PhaseReleasePathVerdict;
  task: PhaseDrainDeltaHighWaterMark;
  assignment: PhaseDrainDeltaHighWaterMark;
};

export type PhaseDrainDeltaTaskRow = {
  taskId: string;
  title: string;
  status: string;
  priority: string | null;
  updatedAt: string;
  blockedBy: string[];
};

export type PhaseDrainDeltaAssignmentRow = {
  assignmentId: string;
  executionTaskId: string;
  workerId: string;
  supervisorId: string;
  status: string;
  updatedAt: string;
  packetDigest: string | null;
};

export type PhaseDrainDeltaOverflow = {
  truncated: boolean;
  totalChanged: number;
  returnedCount: number;
  overflowCount: number;
  overflowRefs: string[];
};

export type PhaseDrainDeltaRefreshRecommendation = {
  mode: "delta" | "full-refresh";
  reason: string;
  ref: PhaseReleaseCommandRef;
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function parseIsoTime(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareRowCursor(updatedAt: string, id: string, cursor: PhaseDrainDeltaHighWaterMark): number {
  const rowTime = parseIsoTime(updatedAt);
  const cursorTime = parseIsoTime(cursor.updatedAt);
  if (rowTime === null && cursorTime === null) {
    return cursor.ids.includes(id) ? 0 : 1;
  }
  if (rowTime === null) {
    return -1;
  }
  if (cursorTime === null) {
    return 1;
  }
  if (rowTime !== cursorTime) {
    return rowTime - cursorTime;
  }
  return cursor.ids.includes(id) ? 0 : 1;
}

function isRowAfterCursor(updatedAt: string, id: string, cursor: PhaseDrainDeltaHighWaterMark): boolean {
  return compareRowCursor(updatedAt, id, cursor) > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeHighWaterMark(value: unknown): PhaseDrainDeltaHighWaterMark | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const updatedAt = record.updatedAt;
  const ids = record.ids;
  if (updatedAt !== null && typeof updatedAt !== "string") {
    return null;
  }
  if (!isStringArray(ids)) {
    return null;
  }
  if (typeof updatedAt === "string" && parseIsoTime(updatedAt) === null) {
    return null;
  }
  return { updatedAt: typeof updatedAt === "string" ? updatedAt : null, ids };
}

export function parsePhaseDrainDeltaCursor(value: unknown): PhaseDrainDeltaCursor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== PHASE_DRAIN_DELTA_SCHEMA_VERSION) {
    return null;
  }
  const planningGeneration = Number(record.planningGeneration);
  const verdict = record.verdict;
  const phaseKey = record.phaseKey;
  const task = normalizeHighWaterMark(record.task);
  const assignment = normalizeHighWaterMark(record.assignment);
  if (!Number.isInteger(planningGeneration) || planningGeneration < 0) {
    return null;
  }
  if (phaseKey !== null && typeof phaseKey !== "string") {
    return null;
  }
  if (
    verdict !== "ready-to-ship" &&
    verdict !== "tasks-remaining" &&
    verdict !== "blocked" &&
    verdict !== "closeout-pending" &&
    verdict !== "release-running" &&
    verdict !== "post-release"
  ) {
    return null;
  }
  if (!task || !assignment) {
    return null;
  }
  return {
    schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
    phaseKey: typeof phaseKey === "string" ? phaseKey : null,
    planningGeneration,
    verdict,
    task,
    assignment
  };
}

function buildHighWaterMark<T extends { updatedAt: string }>(
  rows: T[],
  readId: (row: T) => string
): PhaseDrainDeltaHighWaterMark {
  if (rows.length === 0) {
    return { updatedAt: null, ids: [] };
  }
  const sorted = [...rows].sort((left, right) => {
    const leftTime = parseIsoTime(left.updatedAt) ?? 0;
    const rightTime = parseIsoTime(right.updatedAt) ?? 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return readId(left).localeCompare(readId(right));
  });
  const latest = sorted.at(-1);
  if (!latest) {
    return { updatedAt: null, ids: [] };
  }
  const updatedAt = latest.updatedAt;
  return {
    updatedAt,
    ids: sorted.filter((row) => row.updatedAt === updatedAt).map(readId)
  };
}

function capRows<T extends { taskId?: string; assignmentId?: string }>(
  rows: T[],
  limit: number,
  formatOverflowRef: (row: T) => string
): { rows: T[]; overflow: PhaseDrainDeltaOverflow } {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const returned = rows.slice(0, boundedLimit);
  const overflowRows = rows.slice(boundedLimit);
  return {
    rows: returned,
    overflow: {
      truncated: overflowRows.length > 0,
      totalChanged: rows.length,
      returnedCount: returned.length,
      overflowCount: overflowRows.length,
      overflowRefs: overflowRows.slice(0, PHASE_DRAIN_DELTA_OVERFLOW_REF_LIMIT).map(formatOverflowRef)
    }
  };
}

function readTaskPriority(task: TaskEntity): string | null {
  return typeof task.priority === "string" && task.priority.trim().length > 0 ? task.priority : null;
}

function mapChangedTaskRow(task: TaskEntity, completedIds: Set<string>): PhaseDrainDeltaTaskRow {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    priority: readTaskPriority(task),
    updatedAt: task.updatedAt,
    blockedBy: (task.dependsOn ?? []).filter((depId) => !completedIds.has(depId))
  };
}

function readAssignmentPacketDigest(row: TeamAssignmentRow): string | null {
  const summary = row.orchestrationMetadataSummary;
  return typeof summary?.packetDigest === "string" && summary.packetDigest.trim().length > 0
    ? summary.packetDigest
    : null;
}

function mapChangedAssignmentRow(row: TeamAssignmentRow): PhaseDrainDeltaAssignmentRow {
  return {
    assignmentId: row.id,
    executionTaskId: row.executionTaskId,
    workerId: row.workerId,
    supervisorId: row.supervisorId,
    status: row.status,
    updatedAt: row.updatedAt,
    packetDigest: readAssignmentPacketDigest(row)
  };
}

function buildFullRefreshRecommendation(reason: string, phaseKey: string | null): PhaseDrainDeltaRefreshRecommendation {
  return {
    mode: "full-refresh",
    reason,
    ref: buildCommandRef("phase-release-orchestration-state", phaseKey)
  };
}

function buildDeltaRecommendation(phaseKey: string | null): PhaseDrainDeltaRefreshRecommendation {
  return {
    mode: "delta",
    reason: "cursor-valid",
    ref: buildCommandRef("phase-release-orchestration-state", phaseKey)
  };
}

function scopePhaseAssignments(tasks: TaskEntity[], phaseKey: string | null, assignments: TeamAssignmentRow[]): TeamAssignmentRow[] {
  if (!phaseKey) {
    return [];
  }
  const phaseTaskIds = new Set(
    tasks.filter((task) => !task.archived && inferTaskPhaseKey(task) === phaseKey).map((task) => task.id)
  );
  return assignments.filter((row) => phaseTaskIds.has(row.executionTaskId));
}

export function classifyPhaseReleasePath(inputs: PhaseReleasePathInputs): PhaseReleasePathVerdict {
  const blockedCount = nonNegative(inputs.blockedCount);
  const nonTerminalCount = nonNegative(inputs.nonTerminalCount);
  const preflightViolationCount = nonNegative(inputs.preflightViolationCount);
  const onReleaseBranch =
    typeof inputs.gitBranch === "string" &&
    typeof inputs.releaseBranch === "string" &&
    inputs.gitBranch.trim() === inputs.releaseBranch.trim();

  const phaseOrdinal = parseLeadingPhaseOrdinal(inputs.phaseKey);
  const currentOrdinal = parseLeadingPhaseOrdinal(inputs.currentKitPhase);
  const clearlyPastCurrent =
    phaseOrdinal !== null && currentOrdinal !== null && phaseOrdinal < currentOrdinal;

  if (inputs.rolledOut || clearlyPastCurrent) {
    return "post-release";
  }
  if (blockedCount > 0) {
    return "blocked";
  }
  if (nonTerminalCount > 0) {
    return "tasks-remaining";
  }
  if (!inputs.closeoutPassed || preflightViolationCount > 0) {
    return "closeout-pending";
  }
  if (!onReleaseBranch) {
    return "release-running";
  }
  return "ready-to-ship";
}

function readGitBranch(workspacePath: string): string | null {
  try {
    const out = execFileSync("git", ["-C", workspacePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return out && out !== "HEAD" ? out : null;
  } catch {
    return null;
  }
}

function summarizePhaseTasks(tasks: TaskEntity[], phaseKey: string | null): {
  completedCount: number;
  nonTerminalCount: number;
  blockedCount: number;
  readyUnblockedTop: Array<{ taskId: string; title: string }>;
  blockedTop: Array<{ taskId: string; title: string; blockedBy: string[] }>;
} {
  if (!phaseKey) {
    return {
      completedCount: 0,
      nonTerminalCount: 0,
      blockedCount: 0,
      readyUnblockedTop: [],
      blockedTop: []
    };
  }

  const scoped = tasks.filter((task) => !task.archived && inferTaskPhaseKey(task) === phaseKey);
  const completedIds = new Set(scoped.filter((task) => task.status === "completed").map((task) => task.id));

  const completedCount = scoped.filter((task) => task.status === "completed").length;
  const nonTerminalCount = scoped.filter((task) => task.status !== "completed" && task.status !== "cancelled").length;

  const readyUnblockedTop = scoped
    .filter((task) => task.status === "ready")
    .map((task) => {
      const blockedBy = (task.dependsOn ?? []).filter((depId) => !completedIds.has(depId));
      return { taskId: task.id, title: task.title, blockedBy };
    })
    .filter((task) => task.blockedBy.length === 0)
    .slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT)
    .map((task) => ({ taskId: task.taskId, title: task.title }));

  const blockedTop = scoped
    .filter((task) => task.status === "blocked")
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      blockedBy: (task.dependsOn ?? []).filter((depId) => !completedIds.has(depId))
    }))
    .slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT);

  return {
    completedCount,
    nonTerminalCount,
    blockedCount: blockedTop.length,
    readyUnblockedTop,
    blockedTop
  };
}

function nextActionForVerdict(verdict: PhaseReleasePathVerdict): string {
  switch (verdict) {
    case "blocked":
      return "Resolve blocked task decisions before release closeout.";
    case "tasks-remaining":
      return "Drain non-terminal phase tasks before attempting release closeout.";
    case "closeout-pending":
      return "Run phase-delivery-preflight findings to close evidence/readiness gaps.";
    case "release-running":
      return "Continue release execution on main/release automation and monitor checks.";
    case "post-release":
      return "Phase already rolled out; use release status/history commands for follow-up only.";
    default:
      return "Proceed with phase closeout and release sequence.";
  }
}

function commandLine(command: string, args?: Record<string, unknown>): string {
  return args
    ? `pnpm exec wk run ${command} '${JSON.stringify(args)}'`
    : `pnpm exec wk run ${command} '{}'`;
}

function buildCommandRef(command: string, phaseKey: string | null): PhaseReleaseCommandRef {
  switch (command) {
    case "phase-closeout-readiness":
      return {
        command,
        commandLine: commandLine(command, phaseKey ? { phaseKey } : undefined),
        instructionPath: "src/modules/task-engine/instructions/phase-closeout-readiness.md"
      };
    case "phase-delivery-preflight":
      return {
        command,
        commandLine: commandLine(command, phaseKey ? { phaseKey, includeInProgress: true } : { includeInProgress: true }),
        instructionPath: "src/modules/task-engine/instructions/phase-delivery-preflight.md"
      };
    case "phase-focus-dashboard":
      return {
        command,
        commandLine: commandLine(command, phaseKey ? { phaseKey } : undefined),
        instructionPath: "src/modules/task-engine/instructions/phase-focus-dashboard.md"
      };
    case "release-status":
      return {
        command,
        commandLine: commandLine(command),
        instructionPath: "src/modules/task-engine/instructions/release-status.md"
      };
    default:
      return {
        command,
        commandLine: commandLine(command, phaseKey ? { phaseKey } : undefined),
        instructionPath: "src/modules/task-engine/instructions/phase-release-orchestration-state.md"
      };
  }
}

function flattenRemainingTop(
  remainingByStatus: Partial<Record<string, Array<{ id: string; title: string }>>>
): PhaseReleaseReadinessFinding[] {
  const orderedStatuses = [
    "blocked",
    "in_progress",
    "awaiting_review",
    "awaiting_policy_approval",
    "awaiting_external_decision",
    "ready",
    "research",
    "proposed"
  ];
  const rows: PhaseReleaseReadinessFinding[] = [];
  for (const status of orderedStatuses) {
    const items = remainingByStatus[status] ?? [];
    for (const item of items) {
      rows.push({ taskId: item.id, title: item.title, status });
      if (rows.length >= PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT) {
        return rows;
      }
    }
  }
  return rows;
}

function summarizeMissingArtifacts(
  violations: Array<{
    taskId: string;
    title: string;
    status: string;
    code: string;
    message: string;
    missingFields: string[];
  }>
): PhaseReleaseMissingArtifact[] {
  return violations.slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT).map((violation) => ({
    taskId: violation.taskId,
    title: violation.title,
    status: violation.status,
    code: violation.code,
    message: violation.message,
    evidenceRefs: violation.missingFields.slice(0, 5)
  }));
}

function buildNextActionRef(
  verdict: PhaseReleasePathVerdict,
  phaseKey: string | null
): { summary: string; ref: PhaseReleaseCommandRef } {
  switch (verdict) {
    case "blocked":
      return {
        summary: "Inspect blocked phase tasks and unblock the next release-critical item.",
        ref: buildCommandRef("phase-focus-dashboard", phaseKey)
      };
    case "tasks-remaining":
      return {
        summary: "Inspect the remaining non-terminal phase tasks before attempting closeout.",
        ref: buildCommandRef("phase-closeout-readiness", phaseKey)
      };
    case "closeout-pending":
      return {
        summary: "Resolve missing delivery evidence and closeout findings.",
        ref: buildCommandRef("phase-delivery-preflight", phaseKey)
      };
    case "release-running":
      return {
        summary: "Monitor the in-flight release path and branch state.",
        ref: buildCommandRef("release-status", phaseKey)
      };
    case "post-release":
      return {
        summary: "Use release status/history commands for post-release follow-up.",
        ref: buildCommandRef("release-status", phaseKey)
      };
    default:
      return {
        summary: "Release closeout is ready; continue the release sequence on the phase branch.",
        ref: buildCommandRef("release-status", phaseKey)
      };
  }
}

function buildPublishSafety(args: {
  verdict: PhaseReleasePathVerdict;
  phaseKey: string | null;
  releaseBranch: string | null;
  gitBranch: string | null;
  blockedCount: number;
  nonTerminalCount: number;
  remainingCount: number;
  preflightViolationCount: number;
}): {
  status: "safe" | "blocked";
  safeToPublish: boolean;
  releaseBranch: string | null;
  gitBranch: string | null;
  reasons: PhaseReleasePublishSafetyReason[];
} {
  const reasons: PhaseReleasePublishSafetyReason[] = [];
  if (args.blockedCount > 0) {
    reasons.push({
      code: "blocked-tasks",
      message: `Phase has ${args.blockedCount} blocked task(s).`,
      ref: buildCommandRef("phase-focus-dashboard", args.phaseKey)
    });
  }
  if (args.nonTerminalCount > 0) {
    reasons.push({
      code: "tasks-remaining",
      message: `Phase has ${args.nonTerminalCount} non-terminal task(s).`,
      ref: buildCommandRef("phase-closeout-readiness", args.phaseKey)
    });
  }
  if (args.remainingCount > 0 || args.preflightViolationCount > 0) {
    reasons.push({
      code: "closeout-gaps",
      message:
        args.preflightViolationCount > 0
          ? `Preflight found ${args.preflightViolationCount} delivery evidence gap(s).`
          : `Closeout readiness still has ${args.remainingCount} unfinished task(s).`,
      ref: buildCommandRef("phase-delivery-preflight", args.phaseKey)
    });
  }
  if (args.verdict === "release-running") {
    reasons.push({
      code: "off-phase-branch",
      message: "Workspace is no longer on the phase integration branch.",
      ref: buildCommandRef("release-status", args.phaseKey)
    });
  }
  return {
    status: reasons.length === 0 ? "safe" : "blocked",
    safeToPublish: reasons.length === 0,
    releaseBranch: args.releaseBranch,
    gitBranch: args.gitBranch,
    reasons
  };
}

export function buildPhaseReleaseOrchestrationState(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown> | undefined;
  tasks: TaskEntity[];
  phaseKey: string | null;
  currentKitPhase: string | null;
  rolledOut: boolean;
}): {
  schemaVersion: 1;
  phaseKey: string | null;
  workspace: { currentKitPhase: string | null; releaseBranch: string | null; gitBranch: string | null };
  counts: {
    completedCount: number;
    nonTerminalCount: number;
    blockedCount: number;
    preflightViolationCount: number;
    readinessRemainingCount: number;
  };
  verdict: PhaseReleasePathVerdict;
  nextAction: string;
  nextActionRef: {
    summary: string;
    ref: PhaseReleaseCommandRef;
  };
  readiness: {
    status: "ready" | "action-required";
    passed: boolean;
    closeoutPassed: boolean;
    deliveryEvidencePassed: boolean;
    remainingCount: number;
    missingArtifactCount: number;
    remainingTop: PhaseReleaseReadinessFinding[];
    missingArtifactsTop: PhaseReleaseMissingArtifact[];
  };
  publishSafety: {
    status: "safe" | "blocked";
    safeToPublish: boolean;
    releaseBranch: string | null;
    gitBranch: string | null;
    reasons: PhaseReleasePublishSafetyReason[];
  };
  readyUnblockedTop: Array<{ taskId: string; title: string }>;
  blockedTop: Array<{ taskId: string; title: string; blockedBy: string[] }>;
  refs: {
    commands: string[];
    instructions: string[];
  };
} {
  const taskSummary = summarizePhaseTasks(args.tasks, args.phaseKey);
  const readiness = buildPhaseCloseoutReadiness({ tasks: args.tasks, phaseKey: args.phaseKey });

  const policyContextByTaskId = Object.fromEntries(
    args.tasks.map((task) => {
      const resolved = resolveMaintainerDeliveryPolicy({
        effectiveConfig: args.effectiveConfig,
        task
      });
      return [task.id, buildDeliveryEvidencePolicyContext(resolved)];
    })
  );
  const preflight = buildPhaseDeliveryPreflight({
    tasks: args.tasks,
    phaseKey: args.phaseKey,
    includeInProgress: true,
    policyContextByTaskId
  });

  const releaseBranch = args.phaseKey ? `release/phase-${args.phaseKey}` : null;
  const gitBranch = readGitBranch(args.workspacePath);
  const verdict = classifyPhaseReleasePath({
    phaseKey: args.phaseKey,
    currentKitPhase: args.currentKitPhase,
    gitBranch,
    releaseBranch,
    blockedCount: taskSummary.blockedCount,
    nonTerminalCount: taskSummary.nonTerminalCount,
    closeoutPassed: readiness.passed,
    preflightViolationCount: preflight.violationCount,
    rolledOut: args.rolledOut
  });
  const nextActionRef = buildNextActionRef(verdict, args.phaseKey);
  const readinessRemainingTop = flattenRemainingTop(readiness.remainingByStatus);
  const missingArtifactsTop = summarizeMissingArtifacts(preflight.violations);
  const publishSafety = buildPublishSafety({
    verdict,
    phaseKey: args.phaseKey,
    releaseBranch,
    gitBranch,
    blockedCount: taskSummary.blockedCount,
    nonTerminalCount: taskSummary.nonTerminalCount,
    remainingCount: readiness.remainingCount,
    preflightViolationCount: preflight.violationCount
  });

  return {
    schemaVersion: PHASE_RELEASE_ORCHESTRATION_STATE_SCHEMA_VERSION,
    phaseKey: args.phaseKey,
    workspace: {
      currentKitPhase: args.currentKitPhase,
      releaseBranch,
      gitBranch
    },
    counts: {
      completedCount: taskSummary.completedCount,
      nonTerminalCount: taskSummary.nonTerminalCount,
      blockedCount: taskSummary.blockedCount,
      preflightViolationCount: preflight.violationCount,
      readinessRemainingCount: readiness.remainingCount
    },
    verdict,
    nextAction: nextActionForVerdict(verdict),
    nextActionRef,
    readiness: {
      status: readiness.passed && preflight.violationCount === 0 ? "ready" : "action-required",
      passed: readiness.passed && preflight.violationCount === 0,
      closeoutPassed: readiness.passed,
      deliveryEvidencePassed: preflight.violationCount === 0,
      remainingCount: readiness.remainingCount,
      missingArtifactCount: preflight.violationCount,
      remainingTop: readinessRemainingTop,
      missingArtifactsTop
    },
    publishSafety,
    readyUnblockedTop: taskSummary.readyUnblockedTop,
    blockedTop: taskSummary.blockedTop,
    refs: {
      commands: [
        "phase-closeout-readiness",
        "phase-delivery-preflight",
        "phase-focus-dashboard",
        "release-status"
      ],
      instructions: [
        "src/modules/task-engine/instructions/phase-release-orchestration-state.md",
        "src/modules/task-engine/instructions/phase-delivery-preflight.md",
        "src/modules/task-engine/instructions/phase-closeout-readiness.md"
      ]
    }
  };
}

export function buildPhaseDrainDelta(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown> | undefined;
  tasks: TaskEntity[];
  assignments: TeamAssignmentRow[];
  phaseKey: string | null;
  currentKitPhase: string | null;
  rolledOut: boolean;
  planningGeneration: number;
  cursor?: PhaseDrainDeltaCursor | null;
  taskLimit?: number;
  assignmentLimit?: number;
}): {
  schemaVersion: 1;
  phaseKey: string | null;
  planningGeneration: number;
  refreshRecommendation: PhaseDrainDeltaRefreshRecommendation;
  cursorAccepted: boolean;
  cursorStatus: "valid" | "invalid" | "stale" | "initial";
  cursorStatusReason: string;
  nextCursor: PhaseDrainDeltaCursor;
  phasePath: {
    changed: boolean;
    verdict: PhaseReleasePathVerdict;
    nextAction: string;
    nextActionRef: {
      summary: string;
      ref: PhaseReleaseCommandRef;
    };
  };
  changedTasks: PhaseDrainDeltaTaskRow[];
  changedAssignments: PhaseDrainDeltaAssignmentRow[];
  newlyReadyTop: Array<{ taskId: string; title: string; priority: string | null }>;
  blockedDecisionTop: Array<{ taskId: string; title: string; blockedBy: string[] }>;
  submittedAssignmentsTop: Array<{ assignmentId: string; executionTaskId: string; workerId: string }>;
  overflow: {
    changedTasks: PhaseDrainDeltaOverflow;
    changedAssignments: PhaseDrainDeltaOverflow;
  };
} {
  const phaseState = buildPhaseReleaseOrchestrationState({
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig,
    tasks: args.tasks,
    phaseKey: args.phaseKey,
    currentKitPhase: args.currentKitPhase,
    rolledOut: args.rolledOut
  });
  const scopedTasks = args.phaseKey
    ? args.tasks.filter((task) => !task.archived && inferTaskPhaseKey(task) === args.phaseKey)
    : [];
  const scopedAssignments = scopePhaseAssignments(args.tasks, args.phaseKey, args.assignments);
  const nextCursor: PhaseDrainDeltaCursor = {
    schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
    phaseKey: args.phaseKey,
    planningGeneration: args.planningGeneration,
    verdict: phaseState.verdict,
    task: buildHighWaterMark(scopedTasks, (row) => row.id),
    assignment: buildHighWaterMark(scopedAssignments, (row) => row.id)
  };

  const cursor = args.cursor ?? null;
  if (!cursor) {
    return {
      schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
      phaseKey: args.phaseKey,
      planningGeneration: args.planningGeneration,
      refreshRecommendation: buildFullRefreshRecommendation("initial-cursor-required", args.phaseKey),
      cursorAccepted: false,
      cursorStatus: "initial",
      cursorStatusReason: "Provide the prior nextCursor from phase-drain-delta or perform a full refresh first.",
      nextCursor,
      phasePath: {
        changed: true,
        verdict: phaseState.verdict,
        nextAction: phaseState.nextAction,
        nextActionRef: phaseState.nextActionRef
      },
      changedTasks: [],
      changedAssignments: [],
      newlyReadyTop: [],
      blockedDecisionTop: [],
      submittedAssignmentsTop: [],
      overflow: {
        changedTasks: {
          truncated: false,
          totalChanged: 0,
          returnedCount: 0,
          overflowCount: 0,
          overflowRefs: []
        },
        changedAssignments: {
          truncated: false,
          totalChanged: 0,
          returnedCount: 0,
          overflowCount: 0,
          overflowRefs: []
        }
      }
    };
  }

  if (cursor.phaseKey !== args.phaseKey) {
    return {
      schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
      phaseKey: args.phaseKey,
      planningGeneration: args.planningGeneration,
      refreshRecommendation: buildFullRefreshRecommendation("phase-mismatch", args.phaseKey),
      cursorAccepted: false,
      cursorStatus: "stale",
      cursorStatusReason: "Cursor phase does not match the selected phase.",
      nextCursor,
      phasePath: {
        changed: true,
        verdict: phaseState.verdict,
        nextAction: phaseState.nextAction,
        nextActionRef: phaseState.nextActionRef
      },
      changedTasks: [],
      changedAssignments: [],
      newlyReadyTop: [],
      blockedDecisionTop: [],
      submittedAssignmentsTop: [],
      overflow: {
        changedTasks: { truncated: false, totalChanged: 0, returnedCount: 0, overflowCount: 0, overflowRefs: [] },
        changedAssignments: { truncated: false, totalChanged: 0, returnedCount: 0, overflowCount: 0, overflowRefs: [] }
      }
    };
  }

  if (
    compareRowCursor(nextCursor.task.updatedAt ?? "", "", cursor.task) < 0 ||
    compareRowCursor(nextCursor.assignment.updatedAt ?? "", "", cursor.assignment) < 0
  ) {
    return {
      schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
      phaseKey: args.phaseKey,
      planningGeneration: args.planningGeneration,
      refreshRecommendation: buildFullRefreshRecommendation("cursor-ahead-of-store", args.phaseKey),
      cursorAccepted: false,
      cursorStatus: "stale",
      cursorStatusReason: "Cursor high-water marks are ahead of the current store projection.",
      nextCursor,
      phasePath: {
        changed: true,
        verdict: phaseState.verdict,
        nextAction: phaseState.nextAction,
        nextActionRef: phaseState.nextActionRef
      },
      changedTasks: [],
      changedAssignments: [],
      newlyReadyTop: [],
      blockedDecisionTop: [],
      submittedAssignmentsTop: [],
      overflow: {
        changedTasks: { truncated: false, totalChanged: 0, returnedCount: 0, overflowCount: 0, overflowRefs: [] },
        changedAssignments: { truncated: false, totalChanged: 0, returnedCount: 0, overflowCount: 0, overflowRefs: [] }
      }
    };
  }

  const completedIds = new Set(scopedTasks.filter((task) => task.status === "completed").map((task) => task.id));
  const changedTaskRows = scopedTasks
    .filter((task) => isRowAfterCursor(task.updatedAt, task.id, cursor.task))
    .sort((left, right) => {
      const leftTime = parseIsoTime(left.updatedAt) ?? 0;
      const rightTime = parseIsoTime(right.updatedAt) ?? 0;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    })
    .map((task) => mapChangedTaskRow(task, completedIds));
  const changedAssignmentRows = scopedAssignments
    .filter((row) => isRowAfterCursor(row.updatedAt, row.id, cursor.assignment))
    .sort((left, right) => {
      const leftTime = parseIsoTime(left.updatedAt) ?? 0;
      const rightTime = parseIsoTime(right.updatedAt) ?? 0;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    })
    .map(mapChangedAssignmentRow);
  const cappedTasks = capRows(
    changedTaskRows,
    args.taskLimit ?? PHASE_DRAIN_DELTA_TASK_LIMIT,
    (row) => `task:${row.taskId}`
  );
  const cappedAssignments = capRows(
    changedAssignmentRows,
    args.assignmentLimit ?? PHASE_DRAIN_DELTA_ASSIGNMENT_LIMIT,
    (row) => `assignment:${row.assignmentId}`
  );

  return {
    schemaVersion: PHASE_DRAIN_DELTA_SCHEMA_VERSION,
    phaseKey: args.phaseKey,
    planningGeneration: args.planningGeneration,
    refreshRecommendation: buildDeltaRecommendation(args.phaseKey),
    cursorAccepted: true,
    cursorStatus: "valid",
    cursorStatusReason: "Cursor matches the current phase and high-water marks are monotonic.",
    nextCursor,
    phasePath: {
      changed: cursor.verdict !== phaseState.verdict,
      verdict: phaseState.verdict,
      nextAction: phaseState.nextAction,
      nextActionRef: phaseState.nextActionRef
    },
    changedTasks: cappedTasks.rows,
    changedAssignments: cappedAssignments.rows,
    newlyReadyTop: changedTaskRows
      .filter((row) => row.status === "ready" && row.blockedBy.length === 0)
      .slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT)
      .map((row) => ({ taskId: row.taskId, title: row.title, priority: row.priority })),
    blockedDecisionTop: changedTaskRows
      .filter((row) => row.status === "blocked" || row.status === "awaiting_review" || row.status === "awaiting_policy_approval" || row.status === "awaiting_external_decision")
      .slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT)
      .map((row) => ({ taskId: row.taskId, title: row.title, blockedBy: row.blockedBy })),
    submittedAssignmentsTop: changedAssignmentRows
      .filter((row) => row.status === "submitted" || row.status === "blocked")
      .slice(0, PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT)
      .map((row) => ({
        assignmentId: row.assignmentId,
        executionTaskId: row.executionTaskId,
        workerId: row.workerId
      })),
    overflow: {
      changedTasks: cappedTasks.overflow,
      changedAssignments: cappedAssignments.overflow
    }
  };
}
