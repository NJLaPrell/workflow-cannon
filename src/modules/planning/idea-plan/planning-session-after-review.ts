import type Sqlite from "better-sqlite3";
import type { PlanArtifactV1 } from "../../../core/planning/plan-artifact-v1.js";
import type { PlanArtifactReviewRecordV1 } from "../../../core/planning/plan-artifact-review-record.js";
import { isIdeaId } from "../idea-row/idea-store.js";
import {
  getPlanningChatSession,
  updatePlanningChatSession,
  type PlanningChatSessionRecord,
  type PlanningChatSessionStatus
} from "./planning-chat-session.js";

const REVIEW_SESSION_FROM: PlanningChatSessionStatus[] = [
  "draft_ready",
  "needs_revision",
  "approval_ready"
];

export function promotePlanningSessionAfterReview(
  db: Sqlite.Database,
  artifact: PlanArtifactV1,
  reviewRecord: PlanArtifactReviewRecordV1,
  nowIso: string,
  explicit?: { ideaId?: string; sessionId?: string }
): PlanningChatSessionRecord | null {
  const ideaId =
    explicit?.ideaId?.trim() ||
    (typeof artifact.provenance?.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "");
  if (!ideaId || !isIdeaId(ideaId)) {
    return null;
  }
  const existing = getPlanningChatSession(db, ideaId);
  if (!existing) {
    return null;
  }
  const sessionId = explicit?.sessionId?.trim() || existing.sessionId;
  if (sessionId !== existing.sessionId) {
    return null;
  }
  const chatSessionRef =
    typeof artifact.provenance?.chatSessionRef === "string" ? artifact.provenance.chatSessionRef.trim() : "";
  if (!explicit?.sessionId && chatSessionRef && chatSessionRef !== existing.sessionId) {
    return null;
  }
  if (!REVIEW_SESSION_FROM.includes(existing.status)) {
    return null;
  }
  const planRef = artifact.planRef.trim();
  if (!planRef) {
    return null;
  }
  const status: PlanningChatSessionStatus = reviewRecord.blockerCount > 0 ? "needs_revision" : "approval_ready";
  return updatePlanningChatSession(
    db,
    {
      ideaId,
      sessionId: existing.sessionId,
      status,
      summary: reviewRecord.reviewSummary,
      currentPlanRef: planRef,
      currentPlanVersion: artifact.version
    },
    nowIso
  );
}
