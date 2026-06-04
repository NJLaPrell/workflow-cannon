import { execFileSync } from "node:child_process";

import { buildPhaseCloseoutReadiness, buildPhaseDeliveryPreflight } from "./delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "./maintainer-delivery-policy-resolver.js";
import { inferTaskPhaseKey } from "./phase-resolution.js";
import type { TaskEntity } from "./types.js";

export const PHASE_RELEASE_STATE_SCHEMA_VERSION = 1 as const;
export const PHASE_RELEASE_STATE_REQUIREMENT_LIMIT = 10;

export type PhaseReleaseStateCommandRef = {
  command: string;
  commandLine: string;
  instructionPath: string;
};

export type PhaseReleaseStateRequirement = {
  code: string;
  message: string;
  taskId?: string;
  title?: string;
  status?: string;
  ref: PhaseReleaseStateCommandRef;
};

function commandLine(command: string, args?: Record<string, unknown>): string {
  return args
    ? `pnpm exec wk run ${command} '${JSON.stringify(args)}'`
    : `pnpm exec wk run ${command} '{}'`;
}

function commandRef(command: string, phaseKey: string | null): PhaseReleaseStateCommandRef {
  if (command === "phase-delivery-preflight") {
    return {
      command,
      commandLine: commandLine(command, phaseKey ? { phaseKey, includeInProgress: true } : { includeInProgress: true }),
      instructionPath: "src/modules/task-engine/instructions/phase-delivery-preflight.md"
    };
  }
  if (command === "phase-closeout-readiness") {
    return {
      command,
      commandLine: commandLine(command, phaseKey ? { phaseKey } : undefined),
      instructionPath: "src/modules/task-engine/instructions/phase-closeout-readiness.md"
    };
  }
  if (command === "prepare-release-artifacts") {
    return {
      command,
      commandLine: commandLine(command, phaseKey ? { phaseKey, dryRun: true } : { dryRun: true }),
      instructionPath: "src/modules/task-engine/instructions/prepare-release-artifacts.md"
    };
  }
  return {
    command,
    commandLine: commandLine(command, phaseKey ? { phaseKey } : undefined),
    instructionPath: "src/modules/task-engine/instructions/phase-release-state.md"
  };
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

function phaseTasks(tasks: TaskEntity[], phaseKey: string | null): TaskEntity[] {
  return phaseKey ? tasks.filter((task) => !task.archived && inferTaskPhaseKey(task) === phaseKey) : [];
}

function compactRequirements(args: {
  phaseKey: string | null;
  remainingByStatus: Partial<Record<string, Array<{ id: string; title: string }>>>;
  preflightViolations: Array<{
    taskId: string;
    title: string;
    status: string;
    code: string;
    message: string;
  }>;
  onReleaseBranch: boolean;
}): PhaseReleaseStateRequirement[] {
  const requirements: PhaseReleaseStateRequirement[] = [];
  for (const [status, rows] of Object.entries(args.remainingByStatus)) {
    for (const row of rows ?? []) {
      requirements.push({
        code: "task-not-terminal",
        message: `Task '${row.id}' is still ${status}.`,
        taskId: row.id,
        title: row.title,
        status,
        ref: commandRef("phase-closeout-readiness", args.phaseKey)
      });
      if (requirements.length >= PHASE_RELEASE_STATE_REQUIREMENT_LIMIT) {
        return requirements;
      }
    }
  }
  for (const violation of args.preflightViolations) {
    requirements.push({
      code: violation.code,
      message: violation.message,
      taskId: violation.taskId,
      title: violation.title,
      status: violation.status,
      ref: commandRef("phase-delivery-preflight", args.phaseKey)
    });
    if (requirements.length >= PHASE_RELEASE_STATE_REQUIREMENT_LIMIT) {
      return requirements;
    }
  }
  if (!args.onReleaseBranch) {
    requirements.push({
      code: "wrong-branch",
      message: "Workspace is not on the phase release branch.",
      ref: commandRef("phase-release-state", args.phaseKey)
    });
  }
  return requirements;
}

export function buildPhaseReleaseState(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown> | undefined;
  tasks: TaskEntity[];
  phaseKey: string | null;
  currentKitPhase: string | null;
  planningGeneration: number;
  gitBranch?: string | null;
}): {
  schemaVersion: 1;
  packetKind: "phaseReleaseState";
  phaseKey: string | null;
  currentKitPhase: string | null;
  releaseBranch: string | null;
  gitBranch: string | null;
  completedExecutionTaskCount: number;
  canProceedToRelease: boolean;
  publishSafety: {
    safeToPublish: boolean;
    status: "safe" | "blocked";
    reasons: PhaseReleaseStateRequirement[];
  };
  missingRequirements: PhaseReleaseStateRequirement[];
  refs: {
    nextRef: PhaseReleaseStateCommandRef;
    commands: string[];
    instructions: string[];
  };
  planningGeneration: number;
} {
  const scoped = phaseTasks(args.tasks, args.phaseKey);
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
  const gitBranch = args.gitBranch === undefined ? readGitBranch(args.workspacePath) : args.gitBranch;
  const onReleaseBranch = Boolean(releaseBranch && gitBranch === releaseBranch);
  const missingRequirements = compactRequirements({
    phaseKey: args.phaseKey,
    remainingByStatus: readiness.remainingByStatus,
    preflightViolations: preflight.violations,
    onReleaseBranch
  });
  const canProceedToRelease = readiness.passed && preflight.violationCount === 0 && onReleaseBranch;

  return {
    schemaVersion: PHASE_RELEASE_STATE_SCHEMA_VERSION,
    packetKind: "phaseReleaseState",
    phaseKey: args.phaseKey,
    currentKitPhase: args.currentKitPhase,
    releaseBranch,
    gitBranch,
    completedExecutionTaskCount: scoped.filter((task) => task.type === "execution" && task.status === "completed").length,
    canProceedToRelease,
    publishSafety: {
      safeToPublish: canProceedToRelease,
      status: canProceedToRelease ? "safe" : "blocked",
      reasons: missingRequirements
    },
    missingRequirements,
    refs: {
      nextRef: canProceedToRelease
        ? commandRef("prepare-release-artifacts", args.phaseKey)
        : commandRef("phase-closeout-readiness", args.phaseKey),
      commands: ["phase-release-state", "phase-closeout-readiness", "phase-delivery-preflight", "prepare-release-artifacts"],
      instructions: [
        "src/modules/task-engine/instructions/phase-release-state.md",
        "src/modules/task-engine/instructions/phase-closeout-readiness.md",
        "src/modules/task-engine/instructions/phase-delivery-preflight.md",
        "src/modules/task-engine/instructions/prepare-release-artifacts.md"
      ]
    },
    planningGeneration: args.planningGeneration
  };
}
