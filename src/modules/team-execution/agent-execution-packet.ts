import type { TeamAssignmentMetadataV1 } from "../../contracts/team-execution-assignment-metadata.v1.js";
import { digestPayload } from "../task-engine/mutation-utils.js";
import type { ResolvedMaintainerDeliveryPolicyV1 } from "../task-engine/maintainer-delivery-policy-resolver.js";
import { inferTaskPhaseKey } from "../task-engine/phase-resolution.js";
import type { TaskEntity } from "../task-engine/types.js";
import type { ValidationRecommendation } from "../task-engine/commands/recommend-validation-commands.js";
import type { TeamAssignmentRow } from "./assignment-store.js";

export type AgentExecutionPacket = {
  schemaVersion: 1;
  packetKind: "assignment";
  packetLockStatus: "assignment_locked";
  assignmentId: string;
  assignmentStatus: TeamAssignmentRow["status"];
  workerId: string;
  supervisorId: string;
  taskId: string;
  phaseKey: string | null;
  assignmentIntent: string;
  title: string;
  summary: string | null;
  acceptanceCriteria: string[];
  ownedPaths: string[];
  readOnlyPaths: string[];
  forbiddenPaths: string[];
  sharedPaths: string[];
  requiresApprovalPaths: string[];
  baseBranch: string | null;
  suggestedWorkerBranch: string | null;
  validationCommands: Array<{ command: string; rationale: string }>;
  modelTier: string | null;
  handoffContract: {
    contractId: string | null;
    submitCommand: string;
    expectedAssignmentId: string;
    expectedWorkerId: string;
    refs: {
      instructions: string[];
    };
  };
  refs: {
    commands: string[];
    instructions: string[];
  };
  stopConditions: string[];
  packetDigest: string;
};

export type AgentExecutionDraftPacket = {
  schemaVersion: 1;
  packetKind: "draft";
  packetLockStatus: "draft_unlocked";
  assignmentId: null;
  assignmentStatus: "draft";
  workerId: null;
  supervisorId: null;
  taskId: string;
  phaseKey: string | null;
  assignmentIntent: string;
  title: string;
  summary: string | null;
  acceptanceCriteria: string[];
  ownedPaths: string[];
  readOnlyPaths: string[];
  forbiddenPaths: string[];
  sharedPaths: string[];
  requiresApprovalPaths: string[];
  baseBranch: string | null;
  suggestedWorkerBranch: string | null;
  validationCommands: Array<{ command: string; rationale: string }>;
  modelTier: string | null;
  recommendedAssignmentMetadata: TeamAssignmentMetadataV1;
  registerAssignmentRef: {
    command: "register-assignment";
    args: {
      executionTaskId: string;
      metadata: TeamAssignmentMetadataV1;
    };
    commandLine: string;
    refs: {
      instructions: string[];
    };
  };
  handoffContract: {
    contractId: string | null;
    submitCommand: string;
    expectedAssignmentId: null;
    expectedWorkerId: null;
    refs: {
      instructions: string[];
    };
  };
  refs: {
    commands: string[];
    instructions: string[];
  };
  stopConditions: string[];
  packetDigest: string;
};

type PacketBoundaries = Pick<
  AgentExecutionPacket,
  "ownedPaths" | "readOnlyPaths" | "forbiddenPaths" | "sharedPaths" | "requiresApprovalPaths"
>;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      out.push(trimmed);
    }
  }
  return Array.from(new Set(out));
}

function mergePathLists(...groups: unknown[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => readStringArray(group))));
}

function readMetadata(
  metadata: Record<string, unknown> | null
): TeamAssignmentMetadataV1 | null {
  if (!metadata || metadata.schemaVersion !== 1) {
    return null;
  }
  return metadata as TeamAssignmentMetadataV1;
}

export function readAgentExecutionPacketBoundaries(metadata: Record<string, unknown> | null): PacketBoundaries {
  const typed = readMetadata(metadata);
  return {
    ownedPaths: mergePathLists(typed?.ownedPaths, typed?.resources?.ownedPaths),
    readOnlyPaths: mergePathLists(typed?.resources?.readOnlyPaths),
    forbiddenPaths: mergePathLists(typed?.forbiddenPaths, typed?.resources?.forbiddenPaths),
    sharedPaths: mergePathLists(typed?.sharedPaths, typed?.resources?.sharedPaths),
    requiresApprovalPaths: mergePathLists(typed?.requiresApprovalPaths, typed?.resources?.requiresApprovalPaths)
  };
}

function readAssignmentIntent(metadata: TeamAssignmentMetadataV1 | null, task: TaskEntity): string {
  return (
    readString(metadata?.assignmentPromptSummary) ??
    readString(task.summary) ??
    readString(task.approach) ??
    task.title.trim()
  );
}

function readTaskMetadata(task: TaskEntity): Record<string, unknown> | null {
  return task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
    ? (task.metadata as Record<string, unknown>)
    : null;
}

function readTaskScope(task: TaskEntity): string[] {
  const metadata = readTaskMetadata(task);
  return mergePathLists(
    metadata?.ownedPaths,
    metadata?.technicalScope,
    metadata?.paths,
    (task as { technicalScope?: unknown }).technicalScope
  );
}

function readAcceptanceCriteria(task: TaskEntity): string[] {
  return Array.isArray(task.acceptanceCriteria)
    ? task.acceptanceCriteria.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readBaseBranch(args: { policy: ResolvedMaintainerDeliveryPolicyV1; task: TaskEntity }): string | null {
  const phaseKey = inferTaskPhaseKey(args.task);
  return (
    readString(args.policy.phaseIntegrationBranch) ??
    readString(args.policy.mergeTarget.branch) ??
    (phaseKey ? `release/phase-${phaseKey}` : null)
  );
}

function buildStopConditions(args: {
  assignment: TeamAssignmentRow;
  boundaries: PacketBoundaries;
  baseBranch: string | null;
}): string[] {
  const { assignment, boundaries, baseBranch } = args;
  const statusCondition =
    assignment.status === "assigned"
      ? "Stop if the assignment is no longer in 'assigned' status when you begin work."
      : `Stop: assignment status is '${assignment.status}', not 'assigned'; confirm supervisor intent before coding.`;
  const scopeCondition =
    boundaries.ownedPaths.length > 0
      ? "Stop if the required changes extend beyond the packet owned paths."
      : "Stop if the work requires modifying files before explicit owned paths are assigned.";
  const protectedCondition =
    boundaries.forbiddenPaths.length > 0 || boundaries.readOnlyPaths.length > 0
      ? "Stop if the change would touch read-only or forbidden paths from this packet."
      : "Stop if the change would touch files outside the explicit worker scope.";
  const approvalCondition =
    boundaries.requiresApprovalPaths.length > 0
      ? "Stop before editing requires-approval paths unless explicit approval is recorded."
      : "Stop if a required edit needs extra approval beyond the packet scope.";
  const branchCondition = baseBranch
    ? `Stop if the task branch is not based on '${baseBranch}' or can no longer target that branch.`
    : "Stop if the correct phase integration branch cannot be determined from the packet.";
  return [statusCondition, scopeCondition, protectedCondition, approvalCondition, branchCondition];
}

export function buildAgentExecutionPacket(args: {
  assignment: TeamAssignmentRow;
  task: TaskEntity;
  policy: ResolvedMaintainerDeliveryPolicyV1;
  validationRecommendations: ValidationRecommendation[];
}): AgentExecutionPacket {
  const typedMetadata = readMetadata(args.assignment.metadata);
  const boundaries = readAgentExecutionPacketBoundaries(args.assignment.metadata);
  const phaseKey = inferTaskPhaseKey(args.task);
  const baseBranch = readBaseBranch({ policy: args.policy, task: args.task });

  const packetWithoutDigest = {
    schemaVersion: 1 as const,
    packetKind: "assignment" as const,
    packetLockStatus: "assignment_locked" as const,
    assignmentId: args.assignment.id,
    assignmentStatus: args.assignment.status,
    workerId: args.assignment.workerId,
    supervisorId: args.assignment.supervisorId,
    taskId: args.task.id,
    phaseKey,
    assignmentIntent: readAssignmentIntent(typedMetadata, args.task),
    title: args.task.title,
    summary: readString(args.task.summary) ?? readString(args.task.approach),
    acceptanceCriteria: readAcceptanceCriteria(args.task),
    ownedPaths: boundaries.ownedPaths,
    readOnlyPaths: boundaries.readOnlyPaths,
    forbiddenPaths: boundaries.forbiddenPaths,
    sharedPaths: boundaries.sharedPaths,
    requiresApprovalPaths: boundaries.requiresApprovalPaths,
    baseBranch,
    suggestedWorkerBranch: readString(args.policy.taskBranchExample),
    validationCommands: args.validationRecommendations.slice(0, 5).map((recommendation) => ({
      command: recommendation.command,
      rationale: recommendation.rationale
    })),
    modelTier: readString(typedMetadata?.modelTier),
    handoffContract: {
      contractId: readString(typedMetadata?.handoffContractId),
      submitCommand: "submit-assignment-handoff",
      expectedAssignmentId: args.assignment.id,
      expectedWorkerId: args.assignment.workerId,
      refs: {
        instructions: [
          "AGENT_ORCHESTRATION_HANDOFF.md",
          "src/modules/team-execution/instructions/submit-assignment-handoff.md"
        ]
      }
    },
    refs: {
      commands: [
        "agent-execution-packet",
        "submit-assignment-handoff",
        "report-assignment-blocker"
      ],
      instructions: [
        args.policy.playbookPath,
        args.policy.playbookCursorRulePath,
        args.policy.machinePlaybooksPath,
        "src/modules/team-execution/instructions/agent-execution-packet.md",
        "src/modules/team-execution/instructions/report-assignment-blocker.md"
      ]
    },
    stopConditions: buildStopConditions({
      assignment: args.assignment,
      boundaries,
      baseBranch
    })
  };

  return {
    ...packetWithoutDigest,
    packetDigest: `sha256:${digestPayload(packetWithoutDigest)}`
  };
}

function buildDraftStopConditions(boundaries: PacketBoundaries, baseBranch: string | null): string[] {
  const branchCondition = baseBranch
    ? `Register the assignment against work that targets '${baseBranch}' before worker implementation begins.`
    : "Register the assignment only after the correct phase integration branch is known.";
  return [
    "Do not implement from this draft packet; register an assignment and fetch the locked assignment packet first.",
    boundaries.ownedPaths.length > 0
      ? "Refine owned paths before registration if the draft scope is broader than the intended worker task."
      : "Add explicit owned paths to the assignment metadata before worker implementation.",
    "Stop if the recommended metadata would grant access beyond this task's implementation scope.",
    branchCondition
  ];
}

function buildRegisterAssignmentCommandLine(taskId: string, metadata: TeamAssignmentMetadataV1): string {
  return `workspace-kit run register-assignment '${JSON.stringify({
    executionTaskId: taskId,
    supervisorId: "<supervisor-id>",
    workerId: "<worker-id>",
    metadata
  })}'`;
}

export function buildAgentExecutionDraftPacket(args: {
  task: TaskEntity;
  policy: ResolvedMaintainerDeliveryPolicyV1;
  validationRecommendations: ValidationRecommendation[];
}): AgentExecutionDraftPacket {
  const phaseKey = inferTaskPhaseKey(args.task);
  const baseBranch = readBaseBranch({ policy: args.policy, task: args.task });
  const ownedPaths = readTaskScope(args.task);
  const validationCommands = args.validationRecommendations.slice(0, 5).map((recommendation) => ({
    command: recommendation.command,
    rationale: recommendation.rationale
  }));
  const recommendedAssignmentMetadata: TeamAssignmentMetadataV1 = {
    schemaVersion: 1,
    agentDefinitionId: "task-worker",
    contextProfileId: "task_worker_context_v1",
    accessProfileId: "task_worker_strict_v1",
    handoffContractId: "implementation_handoff_v2",
    modelTier: "balanced",
    modelTierRationale: "Default draft recommendation for bounded task implementation.",
    modelTierRecommendation: {
      label: "tier_2",
      rationale: "Task-first draft packets default to balanced implementation depth until assignment-specific routing refines the tier."
    },
    assignmentPromptSummary: readAssignmentIntent(null, args.task),
    ownedPaths,
    validationCommands,
    resources: {
      ownedPaths,
      readOnlyPaths: [
        ".ai/playbooks/task-to-phase-branch.md",
        ".ai/AGENT-CLI-MAP.md",
        "AGENT_ORCHESTRATION_HANDOFF.md"
      ]
    },
    lockScope: {
      tasks: [args.task.id]
    }
  };
  const boundaries = readAgentExecutionPacketBoundaries(recommendedAssignmentMetadata);

  const packetWithoutDigest = {
    schemaVersion: 1 as const,
    packetKind: "draft" as const,
    packetLockStatus: "draft_unlocked" as const,
    assignmentId: null,
    assignmentStatus: "draft" as const,
    workerId: null,
    supervisorId: null,
    taskId: args.task.id,
    phaseKey,
    assignmentIntent: recommendedAssignmentMetadata.assignmentPromptSummary ?? args.task.title,
    title: args.task.title,
    summary: readString(args.task.summary) ?? readString(args.task.approach),
    acceptanceCriteria: readAcceptanceCriteria(args.task),
    ownedPaths: boundaries.ownedPaths,
    readOnlyPaths: boundaries.readOnlyPaths,
    forbiddenPaths: boundaries.forbiddenPaths,
    sharedPaths: boundaries.sharedPaths,
    requiresApprovalPaths: boundaries.requiresApprovalPaths,
    baseBranch,
    suggestedWorkerBranch: readString(args.policy.taskBranchExample),
    validationCommands,
    modelTier: recommendedAssignmentMetadata.modelTier ?? null,
    recommendedAssignmentMetadata,
    registerAssignmentRef: {
      command: "register-assignment" as const,
      args: {
        executionTaskId: args.task.id,
        metadata: recommendedAssignmentMetadata
      },
      commandLine: buildRegisterAssignmentCommandLine(args.task.id, recommendedAssignmentMetadata),
      refs: {
        instructions: ["src/modules/team-execution/instructions/register-assignment.md"]
      }
    },
    handoffContract: {
      contractId: recommendedAssignmentMetadata.handoffContractId,
      submitCommand: "submit-assignment-handoff",
      expectedAssignmentId: null,
      expectedWorkerId: null,
      refs: {
        instructions: [
          "AGENT_ORCHESTRATION_HANDOFF.md",
          "src/modules/team-execution/instructions/submit-assignment-handoff.md"
        ]
      }
    },
    refs: {
      commands: [
        "agent-execution-packet",
        "register-assignment",
        "submit-assignment-handoff",
        "report-assignment-blocker"
      ],
      instructions: [
        args.policy.playbookPath,
        args.policy.playbookCursorRulePath,
        args.policy.machinePlaybooksPath,
        "src/modules/team-execution/instructions/agent-execution-packet.md",
        "src/modules/team-execution/instructions/register-assignment.md",
        "src/modules/team-execution/instructions/report-assignment-blocker.md"
      ]
    },
    stopConditions: buildDraftStopConditions(boundaries, baseBranch)
  };

  return {
    ...packetWithoutDigest,
    packetDigest: `sha256:${digestPayload(packetWithoutDigest)}`
  };
}
