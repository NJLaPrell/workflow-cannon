import type { IdeaPlanDocument, IdeaPlanStatus } from "./idea-plan-types.js";
import { computeBrainstormReadiness } from "../brainstorm/brainstorm-readiness.js";
import type { PlanningChatSessionStatus } from "./planning-chat-session.js";

export const PLANNER_GOLDEN_PATH_STAGES = [
  "first_run",
  "idea",
  "brainstorming",
  "planning",
  "reviewed",
  "accepted",
  "delivered"
] as const;

export type PlannerGoldenPathStage = (typeof PLANNER_GOLDEN_PATH_STAGES)[number];

export type PlannerFlowBlocker = {
  code: string;
  message: string;
  severity: "info" | "warn" | "block";
};

export type PlannerFlowReadyRun = {
  args: Record<string, unknown>;
  argv: string;
};

export type PlannerFlowRecommendedNextCommand = {
  command: string;
  rationale: string;
  readyRun: PlannerFlowReadyRun;
};

export type PlannerFlowStatusSnapshot = {
  responseSchemaVersion: 1;
  goldenPathStage: PlannerGoldenPathStage;
  ideaCount: number;
  ideaId?: string;
  planRef?: string;
  planId?: string;
  documentStatus?: IdeaPlanStatus;
  sessionStatus?: PlanningChatSessionStatus;
  blockers: PlannerFlowBlocker[];
  mismatches: PlannerFlowBlocker[];
  recommendedNextCommand: PlannerFlowRecommendedNextCommand;
};

const SESSION_PLANNING_STATUSES: readonly PlanningChatSessionStatus[] = [
  "active",
  "draft_ready",
  "needs_revision",
  "approval_ready"
];

function buildArgv(command: string, args: Record<string, unknown>): string {
  return `workspace-kit run ${command} '${JSON.stringify(args)}'`;
}

function buildReadyRun(command: string, args: Record<string, unknown>): PlannerFlowReadyRun {
  return { args, argv: buildArgv(command, args) };
}

function mutatingReadyArgs(
  base: Record<string, unknown>,
  planningGeneration: number,
  planningPolicy: string
): Record<string, unknown> {
  const args: Record<string, unknown> = { ...base };
  if (planningPolicy === "require") {
    args.expectedPlanningGeneration = planningGeneration;
  }
  args.policyApproval = {
    confirmed: true,
    rationale: "<human-approved rationale>"
  };
  return args;
}

export function detectPlannerFlowMismatches(
  documentStatus: IdeaPlanStatus | undefined,
  sessionStatus: PlanningChatSessionStatus | undefined
): PlannerFlowBlocker[] {
  if (!documentStatus || !sessionStatus) {
    return [];
  }

  const mismatches: PlannerFlowBlocker[] = [];

  if (
    documentStatus === "brainstorming" &&
    (SESSION_PLANNING_STATUSES as readonly string[]).includes(sessionStatus)
  ) {
    mismatches.push({
      code: "session-document-status-mismatch",
      message:
        "Planning chat session is in a planning lifecycle state while the unified IdeaPlan document is still brainstorming.",
      severity: "warn"
    });
  }

  if (documentStatus === "planning" && sessionStatus === "completed") {
    mismatches.push({
      code: "session-completed-document-planning",
      message:
        "Planning chat session is completed but the unified IdeaPlan document is still in planning — accept or reconcile before continuing.",
      severity: "warn"
    });
  }

  if (sessionStatus === "draft_ready" && documentStatus === "brainstorming") {
    mismatches.push({
      code: "session-draft-ready-document-brainstorming",
      message:
        "Planning chat session is draft_ready while the unified IdeaPlan document is still brainstorming.",
      severity: "warn"
    });
  }

  if (
    sessionStatus === "completed" &&
    documentStatus !== "accepted" &&
    documentStatus !== "delivered"
  ) {
    mismatches.push({
      code: "session-completed-document-not-accepted",
      message:
        "Planning chat session is completed but the unified IdeaPlan document has not reached accepted or delivered.",
      severity: "warn"
    });
  }

  if (sessionStatus === "draft_ready" && (documentStatus === "accepted" || documentStatus === "delivered")) {
    mismatches.push({
      code: "session-draft-ready-document-terminal",
      message:
        "Planning chat session is still draft_ready while the unified IdeaPlan document is already accepted or delivered.",
      severity: "warn"
    });
  }

  return mismatches;
}

export function resolveGoldenPathStage(
  ideaCount: number,
  documentStatus: IdeaPlanStatus | undefined
): PlannerGoldenPathStage {
  if (ideaCount === 0) {
    return "first_run";
  }
  if (!documentStatus) {
    return "idea";
  }
  if (documentStatus === "idea") {
    return "idea";
  }
  if (documentStatus === "brainstorming") {
    return "brainstorming";
  }
  if (documentStatus === "planning") {
    return "planning";
  }
  if (documentStatus === "reviewed") {
    return "reviewed";
  }
  if (documentStatus === "accepted") {
    return "accepted";
  }
  return "delivered";
}

export function buildPlannerFlowBlockers(input: {
  goldenPathStage: PlannerGoldenPathStage;
  ideaCount: number;
  ideaId?: string;
  planRef?: string;
  document?: IdeaPlanDocument | null;
  mismatches: PlannerFlowBlocker[];
}): PlannerFlowBlocker[] {
  const blockers: PlannerFlowBlocker[] = [...input.mismatches];

  if (input.goldenPathStage === "first_run") {
    blockers.push({
      code: "ideas-inventory-empty",
      message: "No Ideas rows exist yet — capture the first idea before running brainstorm or planning commands.",
      severity: "block"
    });
    return blockers;
  }

  if (!input.planRef) {
    blockers.push({
      code: "idea-plan-missing",
      message: `Idea ${input.ideaId ?? "unknown"} has no linked unified IdeaPlan document.`,
      severity: "block"
    });
    return blockers;
  }

  if (input.goldenPathStage === "brainstorming" && input.document) {
    const readiness = computeBrainstormReadiness(input.document.brainstorm);
    if (!readiness.readyForPlanning) {
      blockers.push({
        code: "brainstorm-incomplete",
        message: `Brainstorm section is ${readiness.completenessPercent}% complete — finish required guided inputs before complete-brainstorm.`,
        severity: "info"
      });
    }
  }

  if (input.goldenPathStage === "reviewed" && input.document?.review?.passed === false) {
    blockers.push({
      code: "plan-review-failed",
      message: "Latest plan review did not pass — revise the plan before acceptance.",
      severity: "block"
    });
  }

  return blockers;
}

export function buildRecommendedNextCommand(input: {
  goldenPathStage: PlannerGoldenPathStage;
  ideaId?: string;
  planRef?: string;
  planId?: string;
  document?: IdeaPlanDocument | null;
  sessionStatus?: PlanningChatSessionStatus;
  planningGeneration: number;
  planningPolicy: string;
}): PlannerFlowRecommendedNextCommand {
  const { goldenPathStage, ideaId, planRef, planId, document, sessionStatus, planningGeneration, planningPolicy } =
    input;

  if (goldenPathStage === "first_run") {
    return {
      command: "create-idea",
      rationale: "Capture the first operator idea so brainstorm and planning commands have a unified IdeaPlan anchor.",
      readyRun: buildReadyRun(
        "create-idea",
        mutatingReadyArgs({ title: "<idea title>" }, planningGeneration, planningPolicy)
      )
    };
  }

  if (goldenPathStage === "idea" && planRef) {
    return {
      command: "start-brainstorm-session",
      rationale: "Begin guided brainstorming on the unified IdeaPlan document (or call start-idea-planning to skip brainstorming).",
      readyRun: buildReadyRun(
        "start-brainstorm-session",
        mutatingReadyArgs({ planRef }, planningGeneration, planningPolicy)
      )
    };
  }

  if (goldenPathStage === "brainstorming" && planRef) {
    const readiness = computeBrainstormReadiness(document?.brainstorm);
    if (readiness.readyForPlanning) {
      return {
        command: "complete-brainstorm",
        rationale: "Brainstorm inputs are complete — transition the unified document brainstorming → planning.",
        readyRun: buildReadyRun(
          "complete-brainstorm",
          mutatingReadyArgs(
            { planRef, operatorConfirmedBrainstormComplete: true },
            planningGeneration,
            planningPolicy
          )
        )
      };
    }
    return {
      command: "update-brainstorm-session",
      rationale: "Continue filling brainstorm guided inputs on the active session.",
      readyRun: buildReadyRun(
        "update-brainstorm-session",
        mutatingReadyArgs({ planRef, sessionIndex: 0 }, planningGeneration, planningPolicy)
      )
    };
  }

  if (goldenPathStage === "planning") {
    if (!sessionStatus || sessionStatus === "abandoned" || sessionStatus === "superseded") {
      return {
        command: "start-idea-planning",
        rationale: "Start or resume planner-chat for the idea and advance the unified document into planning.",
        readyRun: buildReadyRun(
          "start-idea-planning",
          mutatingReadyArgs({ ideaId }, planningGeneration, planningPolicy)
        )
      };
    }
    if (sessionStatus === "approval_ready" && planRef) {
      return {
        command: "review-plan-artifact",
        rationale: "Run the plan review gate before acceptance.",
        readyRun: buildReadyRun(
          "review-plan-artifact",
          mutatingReadyArgs({ planRef }, planningGeneration, planningPolicy)
        )
      };
    }
    if (sessionStatus === "draft_ready" && planRef) {
      return {
        command: "draft-plan-artifact",
        rationale: "Persist the draft-ready planner session into the unified IdeaPlan artifact for review.",
        readyRun: buildReadyRun(
          "draft-plan-artifact",
          mutatingReadyArgs({ planRef, persist: true }, planningGeneration, planningPolicy)
        )
      };
    }
    return {
      command: "update-idea-planning-session",
      rationale: "Advance the durable planning chat session for this idea.",
      readyRun: buildReadyRun(
        "update-idea-planning-session",
        mutatingReadyArgs({ ideaId, status: "draft_ready" }, planningGeneration, planningPolicy)
      )
    };
  }

  if (goldenPathStage === "reviewed" && planRef) {
    return {
      command: "accept-plan-artifact",
      rationale: "Accept the reviewed unified IdeaPlan document to unlock finalize and delivery.",
      readyRun: buildReadyRun(
        "accept-plan-artifact",
        mutatingReadyArgs({ planRef }, planningGeneration, planningPolicy)
      )
    };
  }

  if (goldenPathStage === "accepted" && planId) {
    return {
      command: "finalize-plan-to-phase",
      rationale: "Preview or persist phase-scoped tasks from the accepted plan.",
      readyRun: buildReadyRun("finalize-plan-to-phase", {
        planId,
        dryRun: true,
        ...(planningPolicy === "require" ? { expectedPlanningGeneration: planningGeneration } : {})
      })
    };
  }

  if (goldenPathStage === "delivered" && planRef) {
    return {
      command: "check-delivery-status",
      rationale: "Query delivery task refs and confirm delivered-state transition when tasks finish.",
      readyRun: buildReadyRun("check-delivery-status", {
        planRef,
        ...(planningPolicy === "require" ? { expectedPlanningGeneration: planningGeneration } : {})
      })
    };
  }

  return {
    command: "list-ideas",
    rationale: "Inspect the Ideas inventory and pick an ideaId for targeted flow status.",
    readyRun: buildReadyRun("list-ideas", {})
  };
}

export function buildPlannerFlowStatusSnapshot(input: {
  ideaCount: number;
  ideaId?: string;
  planRef?: string;
  planId?: string;
  document?: IdeaPlanDocument | null;
  sessionStatus?: PlanningChatSessionStatus;
  planningGeneration: number;
  planningPolicy: string;
}): PlannerFlowStatusSnapshot {
  const documentStatus = input.document?.status;
  const goldenPathStage = resolveGoldenPathStage(input.ideaCount, documentStatus);
  const mismatches = detectPlannerFlowMismatches(documentStatus, input.sessionStatus);
  const blockers = buildPlannerFlowBlockers({
    goldenPathStage,
    ideaCount: input.ideaCount,
    ideaId: input.ideaId,
    planRef: input.planRef,
    document: input.document,
    mismatches
  });
  const recommendedNextCommand = buildRecommendedNextCommand({
    goldenPathStage,
    ideaId: input.ideaId,
    planRef: input.planRef,
    planId: input.planId,
    document: input.document,
    sessionStatus: input.sessionStatus,
    planningGeneration: input.planningGeneration,
    planningPolicy: input.planningPolicy
  });

  return {
    responseSchemaVersion: 1,
    goldenPathStage,
    ideaCount: input.ideaCount,
    ...(input.ideaId ? { ideaId: input.ideaId } : {}),
    ...(input.planRef ? { planRef: input.planRef } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
    ...(documentStatus ? { documentStatus } : {}),
    ...(input.sessionStatus ? { sessionStatus: input.sessionStatus } : {}),
    blockers,
    mismatches,
    recommendedNextCommand
  };
}
