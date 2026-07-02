import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardBrainstormingIdeasRollup,
  DashboardBrainstormingIdeaRow
} from "../../../contracts/dashboard-summary-run.js";
import { readIdeaPlanArtifact } from "../../ideas/idea-plan-artifact-storage.js";
import { readActiveDraftPlanArtifact } from "../../ideas/idea-planning-metadata.js";
import { listIdeas } from "../../ideas/idea-store.js";
import { listPlanningChatSessions } from "../../ideas/planning-chat-session.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { mapBrainstormSynthesisForDashboard } from "./build-dashboard-brainstorm-synthesis.js";

function emptyBrainstormingIdeasRollup(): DashboardBrainstormingIdeasRollup {
  return {
    schemaVersion: 1,
    available: false,
    count: 0,
    top: []
  };
}

function resolveIdeaPlanRef(
  db: ReturnType<SqliteDualPlanningStore["getDatabase"]>,
  idea: { id: string; linkedPlanArtifact?: string },
  session:
    | {
        status: string;
        currentPlanRef?: string;
      }
    | undefined,
  activeDraftPlanRef: string | undefined
): string | undefined {
  if (activeDraftPlanRef) {
    return activeDraftPlanRef;
  }
  if (session && session.status !== "completed" && session.currentPlanRef) {
    return session.currentPlanRef;
  }
  if (idea.linkedPlanArtifact) {
    return idea.linkedPlanArtifact;
  }
  if (session?.status === "completed" && session.currentPlanRef) {
    return session.currentPlanRef;
  }
  return undefined;
}

export function buildDashboardBrainstormingIdeasRollup(
  ctx: ModuleLifecycleContext,
  sqliteDual: SqliteDualPlanningStore | undefined,
  needsQueueRollups: boolean
): DashboardBrainstormingIdeasRollup {
  if (!needsQueueRollups || !sqliteDual) {
    return emptyBrainstormingIdeasRollup();
  }
  try {
    const db = sqliteDual.getDatabase();
    const ideas = listIdeas(db);
    const sessions = new Map(listPlanningChatSessions(db).map((session) => [session.ideaId, session]));
    const rows: DashboardBrainstormingIdeaRow[] = [];

    for (const idea of ideas) {
      const session = sessions.get(idea.id);
      const planRef = resolveIdeaPlanRef(
        db,
        idea,
        session,
        readActiveDraftPlanArtifact(db, idea.id)
      );
      if (!planRef) {
        continue;
      }
      const document = readIdeaPlanArtifact(ctx.workspacePath, planRef);
      if (!document || document.status !== "brainstorming") {
        continue;
      }
      const synthesis = mapBrainstormSynthesisForDashboard(document.brainstorm);
      rows.push({
        ideaId: idea.id,
        title: idea.title,
        planRef: document.planRef,
        planId: document.planId,
        status: "brainstorming",
        ...(synthesis ? { synthesis } : {})
      });
    }

    return {
      schemaVersion: 1,
      available: true,
      count: rows.length,
      top: rows
    };
  } catch {
    return emptyBrainstormingIdeasRollup();
  }
}
