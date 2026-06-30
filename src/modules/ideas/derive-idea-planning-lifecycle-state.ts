import type { PlanArtifactReviewRecordV1 } from "../../core/planning/plan-artifact-review-record.js";
import type { PlanArtifactIndexStateV1 } from "../../core/planning/plan-artifact-storage.js";
import type { IdeaRecord } from "./idea-store.js";
import type { PlanningChatSessionRecord, PlanningChatSessionResponse } from "./planning-chat-session.js";

export type IdeaPlanningLifecycleState =
  | "open"
  | "planning"
  | "draft_ready"
  | "needs_revision"
  | "approval_ready"
  | "accepted"
  | "finalized"
  | "superseded";

type IdeaLifecycleIdeaLike =
  | Pick<IdeaRecord, "status" | "linkedPlanArtifact">
  | {
      status?: string | null;
      linkedPlanArtifact?: string | null;
    }
  | null
  | undefined;

type PlanningChatSessionLike =
  | Pick<PlanningChatSessionRecord, "status" | "currentPlanRef" | "completedAt">
  | Pick<PlanningChatSessionResponse, "status" | "currentPlanRef" | "completedAt">
  | {
      status?: string | null;
      currentPlanRef?: string | null;
      completedAt?: string | null;
    };

type PlanArtifactLike =
  | Pick<PlanArtifactIndexStateV1, "planRef" | "status">
  | {
      planRef?: string | null;
      status?: string | null;
    }
  | string
  | null
  | undefined;

type PlanArtifactReviewLike =
  | Pick<PlanArtifactReviewRecordV1, "planRef" | "passed" | "blockerCount" | "openQuestionCount" | "warningCount">
  | {
      planRef?: string | null;
      passed?: boolean | null;
      blockerCount?: number | null;
      openQuestionCount?: number | null;
      warningCount?: number | null;
    }
  | null
  | undefined;

export type PlanFinalizeSummary = {
  status?: string | null;
  dryRun?: boolean | null;
  count?: number | null;
  createdTasks?: unknown[] | null;
  planRef?: string | null;
};

export type DeriveIdeaPlanningLifecycleStateInput = {
  idea?: IdeaLifecycleIdeaLike;
  planningChatSession?: PlanningChatSessionLike | null;
  linkedPlanArtifact?: PlanArtifactLike;
  activeDraftPlanArtifact?: PlanArtifactLike;
  latestReview?: PlanArtifactReviewLike;
  finalizeResult?: PlanFinalizeSummary | null;
};

type NormalizedPlanArtifact = {
  planRef: string;
  status: string;
  present: boolean;
};

type NormalizedReview = {
  planRef: string;
  passed: boolean | null;
  blockerCount: number | null;
  present: boolean;
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedStatus(value: unknown): string {
  return trimmed(value).toLowerCase();
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePlanArtifact(value: PlanArtifactLike): NormalizedPlanArtifact {
  if (typeof value === "string") {
    const planRef = trimmed(value);
    return { planRef, status: "", present: planRef.length > 0 };
  }
  if (!value || typeof value !== "object") {
    return { planRef: "", status: "", present: false };
  }
  const planRef = trimmed(value.planRef);
  const status = normalizedStatus(value.status);
  return {
    planRef,
    status,
    present: planRef.length > 0 || status.length > 0
  };
}

function normalizeReview(value: PlanArtifactReviewLike): NormalizedReview {
  if (!value || typeof value !== "object") {
    return { planRef: "", passed: null, blockerCount: null, present: false };
  }
  const planRef = trimmed(value.planRef);
  const blockerCount = asFiniteNumber(value.blockerCount);
  return {
    planRef,
    passed: typeof value.passed === "boolean" ? value.passed : null,
    blockerCount,
    present:
      planRef.length > 0 ||
      typeof value.passed === "boolean" ||
      blockerCount !== null ||
      asFiniteNumber(value.openQuestionCount) !== null ||
      asFiniteNumber(value.warningCount) !== null
  };
}

function isPersistedFinalizeResult(value: PlanFinalizeSummary | null | undefined): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (normalizedStatus(value.status) === "finalized") {
    return true;
  }
  if (value.dryRun === true) {
    return false;
  }
  const count = asFiniteNumber(value.count);
  if (count !== null && count > 0) {
    return true;
  }
  return Array.isArray(value.createdTasks) && value.createdTasks.length > 0;
}

function deriveFromSession(session: PlanningChatSessionLike | null | undefined): IdeaPlanningLifecycleState | null {
  if (!session || typeof session !== "object") {
    return null;
  }
  const status = normalizedStatus(session.status);
  if (status === "active") {
    return "planning";
  }
  if (status === "draft_ready") {
    return "draft_ready";
  }
  if (status === "needs_revision") {
    return "needs_revision";
  }
  if (status === "approval_ready") {
    return "approval_ready";
  }
  if (status === "superseded") {
    return "superseded";
  }
  if (status === "completed" && trimmed(session.currentPlanRef).length > 0) {
    return "accepted";
  }
  return null;
}

function deriveFromIdea(idea: IdeaLifecycleIdeaLike): IdeaPlanningLifecycleState {
  if (!idea || typeof idea !== "object") {
    return "open";
  }
  if (trimmed(idea.linkedPlanArtifact).length > 0) {
    return "accepted";
  }
  const status = normalizedStatus(idea.status);
  if (status === "planning") {
    return "planning";
  }
  if (status === "planned") {
    return "accepted";
  }
  return "open";
}

/**
 * Locked precedence: finalized > accepted > review > active draft > session > idea.
 * Lower-fidelity signals are only used when higher-precedence evidence is absent.
 */
export function deriveIdeaPlanningLifecycleState(
  input: DeriveIdeaPlanningLifecycleStateInput
): IdeaPlanningLifecycleState {
  const idea = input.idea;
  const linkedPlan = normalizePlanArtifact(
    input.linkedPlanArtifact ??
      (idea && typeof idea === "object" ? (idea.linkedPlanArtifact ?? null) : null)
  );
  const activeDraft = normalizePlanArtifact(input.activeDraftPlanArtifact);
  const latestReview = normalizeReview(input.latestReview);

  if (isPersistedFinalizeResult(input.finalizeResult) || linkedPlan.status === "finalized") {
    return "finalized";
  }

  if (linkedPlan.status === "superseded") {
    return "superseded";
  }

  if (linkedPlan.status === "accepted" || linkedPlan.planRef.length > 0) {
    return "accepted";
  }

  const reviewMatchesDraft =
    latestReview.present &&
    (activeDraft.planRef.length === 0 || latestReview.planRef.length === 0 || latestReview.planRef === activeDraft.planRef);
  if (reviewMatchesDraft) {
    if (latestReview.passed === false || (latestReview.blockerCount !== null && latestReview.blockerCount > 0)) {
      return "needs_revision";
    }
    return "approval_ready";
  }

  if (activeDraft.status === "superseded") {
    return "superseded";
  }

  if (activeDraft.present) {
    return "draft_ready";
  }

  return deriveFromSession(input.planningChatSession) ?? deriveFromIdea(idea);
}
