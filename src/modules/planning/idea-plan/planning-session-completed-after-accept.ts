import type Sqlite from "better-sqlite3";
import type { PlanArtifactV1 } from "../../../core/planning/plan-artifact-v1.js";
import { isIdeaId } from "../idea-row/idea-store.js";
import {
  getPlanningChatSession,
  updatePlanningChatSession,
  type PlanningChatSessionRecord,
  type PlanningChatSessionStatus
} from "./planning-chat-session.js";

const ACCEPT_COMPLETION_FROM: PlanningChatSessionStatus[] = [
  "approval_ready",
  "completed"
];

export function completePlanningSessionAfterPlanAccept(
  db: Sqlite.Database,
  artifact: PlanArtifactV1,
  nowIso: string
): PlanningChatSessionRecord | null {
  const ideaId =
    typeof artifact.provenance?.sourceIdeaId === "string" ? artifact.provenance.sourceIdeaId.trim() : "";
  if (!ideaId || !isIdeaId(ideaId)) {
    return null;
  }
  const existing = getPlanningChatSession(db, ideaId);
  if (!existing || !ACCEPT_COMPLETION_FROM.includes(existing.status)) {
    return null;
  }
  const chatSessionRef =
    typeof artifact.provenance?.chatSessionRef === "string" ? artifact.provenance.chatSessionRef.trim() : "";
  if (chatSessionRef && chatSessionRef !== existing.sessionId) {
    return null;
  }
  const planRef = artifact.planRef.trim();
  if (!planRef) {
    return null;
  }
  return updatePlanningChatSession(
    db,
    {
      ideaId,
      sessionId: existing.sessionId,
      status: "completed",
      currentPlanRef: planRef,
      currentPlanVersion: artifact.version
    },
    nowIso
  );
}
