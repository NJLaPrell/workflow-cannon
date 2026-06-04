import type { AgentModelTier } from "../../contracts/agent-orchestration.js";
import type {
  TeamAssignmentMetadataV1,
  WorkerPacketModelTierRecommendation
} from "../../contracts/team-execution-assignment-metadata.v1.js";
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
  modelTierRecommendation: WorkerPacketModelTierRecommendation;
  modelTierRationale: string;
  modelTierEscalationTriggers: string[];
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
  modelTierRecommendation: WorkerPacketModelTierRecommendation;
  modelTierRationale: string;
  modelTierEscalationTriggers: string[];
  boundaryRecommendations: PacketBoundaryRecommendations;
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

type PacketModelTierDecision = {
  modelTier: AgentModelTier;
  recommendation: WorkerPacketModelTierRecommendation;
  rationale: string;
  escalationTriggers: string[];
};

type PacketBoundaryRecommendation = {
  boundary: "owned" | "read_only" | "forbidden" | "shared" | "requires_approval";
  path: string;
  confidence: "high" | "medium" | "low";
  source: "task-metadata" | "technical-scope" | "packet-default" | "policy-default";
  advisory: boolean;
  rationale: string;
};

type PacketBoundaryRecommendations = {
  ownedPaths: PacketBoundaryRecommendation[];
  readOnlyPaths: PacketBoundaryRecommendation[];
  forbiddenPaths: PacketBoundaryRecommendation[];
  sharedPaths: PacketBoundaryRecommendation[];
  requiresApprovalPaths: PacketBoundaryRecommendation[];
};

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

function readTaskScopeEntries(task: TaskEntity): Array<{ path: string; source: "task-metadata" | "technical-scope" }> {
  const metadata = readTaskMetadata(task);
  const entries: Array<{ path: string; source: "task-metadata" | "technical-scope" }> = [];
  for (const path of mergePathLists(metadata?.ownedPaths, metadata?.paths)) {
    entries.push({ path, source: "task-metadata" });
  }
  for (const path of mergePathLists(metadata?.technicalScope, (task as { technicalScope?: unknown }).technicalScope)) {
    if (!entries.some((entry) => entry.path === path)) {
      entries.push({ path, source: "technical-scope" });
    }
  }
  return entries;
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

function readTaskText(task: TaskEntity): string {
  return [
    task.title,
    task.summary,
    task.approach,
    task.description,
    task.risk,
    ...(Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function topLevelPathOwners(paths: string[]): Set<string> {
  return new Set(
    paths
      .map((path) => path.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
      .filter(Boolean)
      .map((path) => {
        const [first, second] = path.split("/");
        return first === "src" && second === "modules" ? `${first}/${second}/${path.split("/")[2] ?? ""}` : first;
      })
  );
}

function mapPacketLabelToModelTier(label: WorkerPacketModelTierRecommendation["label"]): AgentModelTier {
  if (label === "tier_1") {
    return "cheap_fast";
  }
  if (label === "tier_2") {
    return "balanced";
  }
  return "high_reasoning";
}

function mapModelTierToPacketLabel(modelTier: string | null): WorkerPacketModelTierRecommendation["label"] | null {
  if (modelTier === "cheap_fast") {
    return "tier_1";
  }
  if (modelTier === "balanced") {
    return "tier_2";
  }
  if (modelTier === "high_reasoning" || modelTier === "specialist" || modelTier === "human_review") {
    return "tier_3";
  }
  return null;
}

function containsRiskTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function buildModelTierDecision(args: {
  task: TaskEntity;
  boundaries: PacketBoundaries;
  metadata: TeamAssignmentMetadataV1 | null;
  packetKind: "assignment" | "draft";
}): PacketModelTierDecision {
  const text = readTaskText(args.task);
  const ownedPaths = args.boundaries.ownedPaths;
  const owners = topLevelPathOwners(ownedPaths);
  const triggers: string[] = [];
  const riskyTerms = [
    "release",
    "publish",
    "pre-release",
    "policy",
    "approval",
    "schema",
    "migration",
    "security",
    "auth",
    "rollback",
    "unsafe",
    "ambiguous",
    "cross-module",
    "orchestration"
  ];
  const matchedTerms = riskyTerms.filter((term) => containsRiskTerm(text, term));
  if (matchedTerms.length > 0) {
    triggers.push(`risk terms: ${matchedTerms.slice(0, 4).join(", ")}`);
  }
  if (args.boundaries.requiresApprovalPaths.length > 0) {
    triggers.push("approval-gated paths are present");
  }
  if (ownedPaths.length > 5) {
    triggers.push(`broad owned path count (${ownedPaths.length})`);
  }
  if (owners.size > 2) {
    triggers.push(`cross-area path ownership (${owners.size} areas)`);
  }

  const explicitModelTier = readString(args.metadata?.modelTier);
  const explicitLabel = mapModelTierToPacketLabel(explicitModelTier);
  if (explicitLabel === "tier_3") {
    triggers.push(`explicit metadata modelTier '${explicitModelTier}'`);
  }

  let label: WorkerPacketModelTierRecommendation["label"] = "tier_2";
  if (triggers.length > 0) {
    label = "tier_3";
  } else if (explicitLabel) {
    label = explicitLabel;
  } else if (
    ownedPaths.length > 0 &&
    ownedPaths.length <= 2 &&
    owners.size <= 1 &&
    !text.match(/\b(implement|runtime|command|orchestrat|packet|contract|state)\b/)
  ) {
    label = "tier_1";
  }

  const modelTier = mapPacketLabelToModelTier(label);
  const rationale =
    label === "tier_1"
      ? "Narrow, low-risk task scope can run on the lightest packet tier."
      : label === "tier_2"
        ? "Bounded implementation work without escalation triggers fits the default worker tier."
        : `Escalated for ${args.packetKind} packet because ${triggers.join("; ")}.`;

  return {
    modelTier,
    recommendation: { label, rationale },
    rationale,
    escalationTriggers: triggers
  };
}

function isPathLike(value: string): boolean {
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) {
    return false;
  }
  return (
    trimmed.includes("/") ||
    trimmed.includes("*") ||
    trimmed.startsWith(".") ||
    /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|scss|html)$/.test(trimmed)
  );
}

function toOwnedBoundaryRecommendation(entry: {
  path: string;
  source: "task-metadata" | "technical-scope";
}): PacketBoundaryRecommendation {
  const pathLike = isPathLike(entry.path);
  const confidence = pathLike ? (entry.source === "task-metadata" ? "high" : "medium") : "low";
  return {
    boundary: "owned",
    path: entry.path,
    confidence,
    source: entry.source,
    advisory: confidence === "low",
    rationale: pathLike
      ? `Derived from ${entry.source} as a candidate owned path.`
      : `Kept advisory because '${entry.path}' is not a concrete repo path or glob.`
  };
}

function defaultReadOnlyRecommendation(path: string): PacketBoundaryRecommendation {
  return {
    boundary: "read_only",
    path,
    confidence: "high",
    source: "packet-default",
    advisory: false,
    rationale: "Packet instruction reference should be read, not edited, for worker execution."
  };
}

function outsideOwnedRecommendation(): PacketBoundaryRecommendation {
  return {
    boundary: "forbidden",
    path: "<outside-owned-paths>",
    confidence: "medium",
    source: "policy-default",
    advisory: true,
    rationale: "Treat paths outside explicit owned recommendations as out of scope unless the assignment is refined."
  };
}

function buildDraftBoundaryRecommendations(task: TaskEntity): PacketBoundaryRecommendations {
  const ownedPaths = readTaskScopeEntries(task).map(toOwnedBoundaryRecommendation);
  const readOnlyPaths = [
    ".ai/playbooks/task-to-phase-branch.md",
    ".ai/AGENT-CLI-MAP.md",
    "AGENT_ORCHESTRATION_HANDOFF.md"
  ].map(defaultReadOnlyRecommendation);
  return {
    ownedPaths,
    readOnlyPaths,
    forbiddenPaths: [outsideOwnedRecommendation()],
    sharedPaths: [],
    requiresApprovalPaths: []
  };
}

function materializeRecommendedPaths(recommendations: PacketBoundaryRecommendation[]): string[] {
  return recommendations
    .filter((recommendation) => recommendation.confidence !== "low")
    .map((recommendation) => recommendation.path);
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
  const modelTierDecision = buildModelTierDecision({
    task: args.task,
    boundaries,
    metadata: typedMetadata,
    packetKind: "assignment"
  });

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
    modelTier: readString(typedMetadata?.modelTier) ?? modelTierDecision.modelTier,
    modelTierRecommendation: modelTierDecision.recommendation,
    modelTierRationale: modelTierDecision.rationale,
    modelTierEscalationTriggers: modelTierDecision.escalationTriggers,
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
  const boundaryRecommendations = buildDraftBoundaryRecommendations(args.task);
  const ownedPaths = materializeRecommendedPaths(boundaryRecommendations.ownedPaths);
  const readOnlyPaths = materializeRecommendedPaths(boundaryRecommendations.readOnlyPaths);
  const validationCommands = args.validationRecommendations.slice(0, 5).map((recommendation) => ({
    command: recommendation.command,
    rationale: recommendation.rationale
  }));
  const draftBoundaries: PacketBoundaries = {
    ownedPaths,
    readOnlyPaths,
    forbiddenPaths: [],
    sharedPaths: [],
    requiresApprovalPaths: []
  };
  const modelTierDecision = buildModelTierDecision({
    task: args.task,
    boundaries: draftBoundaries,
    metadata: null,
    packetKind: "draft"
  });
  const recommendedAssignmentMetadata: TeamAssignmentMetadataV1 = {
    schemaVersion: 1,
    agentDefinitionId: "task-worker",
    contextProfileId: "task_worker_context_v1",
    accessProfileId: "task_worker_strict_v1",
    handoffContractId: "implementation_handoff_v2",
    modelTier: modelTierDecision.modelTier,
    modelTierRationale: modelTierDecision.rationale,
    modelTierRecommendation: modelTierDecision.recommendation,
    assignmentPromptSummary: readAssignmentIntent(null, args.task),
    ownedPaths,
    validationCommands,
    resources: {
      ownedPaths,
      readOnlyPaths: draftBoundaries.readOnlyPaths
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
    modelTierRecommendation: modelTierDecision.recommendation,
    modelTierRationale: modelTierDecision.rationale,
    modelTierEscalationTriggers: modelTierDecision.escalationTriggers,
    boundaryRecommendations,
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
