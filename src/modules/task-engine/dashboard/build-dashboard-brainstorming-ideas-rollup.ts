import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardBrainstormingIdeasRollup,
  DashboardBrainstormingIdeaRow
} from "../../../contracts/dashboard-summary-run.js";
import { listIdeaPlanArtifacts, listIdeas, readIdeaPlanArtifact } from "./planning-barrel-imports.js";
import { readActiveDraftPlanArtifact } from "../../ideas/idea-planning-metadata.js";
import { listPlanningChatSessions } from "../../ideas/planning-chat-session.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { mapBrainstormSynthesisForDashboard } from "./build-dashboard-brainstorm-synthesis.js";
import { mapBrainstormSessionsForDashboard } from "./map-dashboard-brainstorm-sessions.js";

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
    const recoveredIdeaPlansByIdeaId = new Map<string, string>();
    for (const document of listIdeaPlanArtifacts(ctx.workspacePath)) {
      if (!recoveredIdeaPlansByIdeaId.has(document.ideaId)) {
        recoveredIdeaPlansByIdeaId.set(document.ideaId, document.planRef);
      }
    }
    const rows: DashboardBrainstormingIdeaRow[] = [];

    for (const idea of ideas) {
      const session = sessions.get(idea.id);
      const planRef = resolveIdeaPlanRef(
        db,
        idea,
        session,
        readActiveDraftPlanArtifact(db, idea.id)
      ) ?? recoveredIdeaPlansByIdeaId.get(idea.id);
      if (!planRef) {
        continue;
      }
      const document = readIdeaPlanArtifact(ctx.workspacePath, planRef);
      if (!document || document.status !== "brainstorming") {
        continue;
      }
      const synthesis = mapBrainstormSynthesisForDashboard(document.brainstorm);
      const brainstormSessions = mapBrainstormSessionsForDashboard(document.brainstorm?.sessions);
      rows.push({
        ideaId: idea.id,
        title: idea.title,
        planRef: document.planRef,
        planId: document.planId,
        status: "brainstorming",
        ...(synthesis ? { synthesis } : {}),
        ...(brainstormSessions.length > 0 ? { sessions: brainstormSessions } : {})
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
