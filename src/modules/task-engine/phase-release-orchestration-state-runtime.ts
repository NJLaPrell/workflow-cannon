import { execFileSync } from "node:child_process";

import { buildPhaseCloseoutReadiness, buildPhaseDeliveryPreflight } from "./delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "./maintainer-delivery-policy-resolver.js";
import { inferTaskPhaseKey, parseLeadingPhaseOrdinal } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

export const PHASE_RELEASE_ORCHESTRATION_STATE_SCHEMA_VERSION = 1 as const;
export const PHASE_RELEASE_ORCHESTRATION_TOP_LIMIT = 10;

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

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
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
        commandLine: commandLine(command),
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