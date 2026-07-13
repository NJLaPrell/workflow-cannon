import type Sqlite from "better-sqlite3";
import type { PlanArtifactV1 } from "../../../core/planning/plan-artifact-v1.js";
import { isIdeaId } from "../idea-row/idea-store.js";
import {
  getPlanningChatSession,
  updatePlanningChatSession,
  type PlanningChatSessionRecord,
  type PlanningChatSessionStatus
} from "./planning-chat-session.js";

const DRAFT_READY_PROMOTION_FROM: PlanningChatSessionStatus[] = [
  "active",
  "draft_ready",
  "needs_revision"
];

export function promotePlanningSessionToDraftReadyAfterDraftPersist(
  db: Sqlite.Database,
  artifact: PlanArtifactV1,
  nowIso: string
): PlanningChatSessionRecord | null {
  const ideaId =
    typeof artifact.provenance?.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "";
  if (!ideaId || !isIdeaId(ideaId)) return null;
  const existing = getPlanningChatSession(db, ideaId);
  if (!existing) return null;
  const chatSessionRef =
    typeof artifact.provenance?.chatSessionRef === "string" ? artifact.provenance.chatSessionRef.trim() : "";
  if (chatSessionRef && chatSessionRef !== existing.sessionId) return null;
  if (!DRAFT_READY_PROMOTION_FROM.includes(existing.status)) return null;
  const planRef = artifact.planRef.trim();
  if (!planRef) return null;
  return updatePlanningChatSession(
    db,
    {
      ideaId,
      sessionId: existing.sessionId,
      status: "draft_ready",
      currentPlanRef: planRef,
      currentPlanVersion: artifact.version
    },
    nowIso
  );
}
