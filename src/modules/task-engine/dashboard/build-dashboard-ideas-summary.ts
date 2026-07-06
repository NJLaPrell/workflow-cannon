import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardIdeaPlanArtifactSummary,
  DashboardIdeaRow,
  DashboardIdeasSummary
} from "../../../contracts/dashboard-summary-run.js";
import { readLatestPlanArtifact, readPlanArtifactIndex } from "../../../core/planning/plan-artifact-storage.js";
import { readActiveDraftPlanArtifact } from "../../ideas/idea-planning-metadata.js";
import { listIdeaPlanArtifacts, readIdeaPlanArtifact } from "../../ideas/idea-plan-artifact-storage.js";
import type { IdeaPlanDocument } from "../../ideas/idea-plan-types.js";
import { listIdeas } from "../../ideas/idea-store.js";
import { listPlanningChatSessions } from "../../ideas/planning-chat-session.js";
import { parsePlanIdFromPlanArtifactRef } from "../plan-artifact-execute-policy.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { mapBrainstormSynthesisForDashboard } from "./build-dashboard-brainstorm-synthesis.js";
import { mapBrainstormSessionsForDashboard } from "./map-dashboard-brainstorm-sessions.js";

function emptyIdeasSummary(): DashboardIdeasSummary {
  return {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    openCount: 0,
    planningCount: 0,
    plannedCount: 0,
    top: []
  };
}

function normalizePhaseKey(latestArtifact: unknown): string | undefined {
  if (!latestArtifact || typeof latestArtifact !== "object") {
    return undefined;
  }
  const phaseRecommendations = Array.isArray((latestArtifact as { phaseRecommendations?: unknown[] }).phaseRecommendations)
    ? ((latestArtifact as { phaseRecommendations: unknown[] }).phaseRecommendations as Array<Record<string, unknown>>)
    : [];
  const primary =
    phaseRecommendations.find((row) => row?.isPrimary === true) ??
    phaseRecommendations.find((row) => typeof row?.phaseKey === "string" && row.phaseKey.trim().length > 0);
  const phaseKey = typeof primary?.phaseKey === "string" ? primary.phaseKey.trim() : "";
  return phaseKey.length > 0 ? phaseKey : undefined;
}

function buildIdeaPlanArtifactSummary(
  ctx: ModuleLifecycleContext,
  planRef: string | undefined,
  cache: Map<string, DashboardIdeaPlanArtifactSummary | null>
): DashboardIdeaPlanArtifactSummary | undefined {
  const normalizedRef = typeof planRef === "string" ? planRef.trim() : "";
  if (normalizedRef.length === 0) {
    return undefined;
  }
  if (cache.has(normalizedRef)) {
    return cache.get(normalizedRef) ?? undefined;
  }
  const planId = parsePlanIdFromPlanArtifactRef(normalizedRef);
  if (!planId) {
    cache.set(normalizedRef, null);
    return undefined;
  }
  const index = readPlanArtifactIndex(
    ctx.workspacePath,
    planId,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  if (index && index.planRef === normalizedRef) {
    const latestArtifact = readLatestPlanArtifact(ctx.workspacePath, planId);
    const ideaPlan = readIdeaPlanArtifact(ctx.workspacePath, normalizedRef);
    const latestStatus =
      latestArtifact && typeof latestArtifact === "object"
        ? String((latestArtifact as Record<string, unknown>).status ?? "").trim()
        : "";
    const effectiveStatus =
      ideaPlan?.status ?? (latestStatus.length > 0 ? latestStatus : index.status);
    const brainstormSynthesis = mapBrainstormSynthesisForDashboard(ideaPlan?.brainstorm);
    const brainstormSessions = mapBrainstormSessionsForDashboard(ideaPlan?.brainstorm?.sessions);
    const latestReview =
      index.latestReview &&
      index.latestReview.planRef === index.planRef &&
      index.latestReview.reviewedVersion === index.currentVersion
        ? {
            planRef: index.latestReview.planRef,
            passed: index.latestReview.passed,
            blockerCount: index.latestReview.blockerCount,
            warningCount: index.latestReview.warningCount,
            openQuestionCount: index.latestReview.openQuestionCount
          }
        : undefined;
    const phaseKey = normalizePhaseKey(latestArtifact);
    const summary: DashboardIdeaPlanArtifactSummary = {
      planId,
      planRef: index.planRef,
      status: effectiveStatus,
      version: typeof ideaPlan?.version === "number" ? ideaPlan.version : index.currentVersion,
      ...(latestReview ? { latestReview } : {}),
      ...(brainstormSynthesis ? { brainstormSynthesis } : {}),
      ...(brainstormSessions.length > 0 ? { brainstormSessions } : {}),
      ...(phaseKey ? { phaseKey } : {})
    };
    cache.set(normalizedRef, summary);
    return summary;
  }
  const ideaPlan = readIdeaPlanArtifact(ctx.workspacePath, normalizedRef);
  if (ideaPlan) {
    const brainstormSynthesis = mapBrainstormSynthesisForDashboard(ideaPlan.brainstorm);
    const brainstormSessions = mapBrainstormSessionsForDashboard(ideaPlan.brainstorm?.sessions);
    const summary: DashboardIdeaPlanArtifactSummary = {
      planId: ideaPlan.planId,
      planRef: ideaPlan.planRef,
      status: ideaPlan.status,
      version: ideaPlan.version,
      ...(brainstormSynthesis ? { brainstormSynthesis } : {}),
      ...(brainstormSessions.length > 0 ? { brainstormSessions } : {})
    };
    cache.set(normalizedRef, summary);
    return summary;
  }
  cache.set(normalizedRef, null);
  return undefined;
}

function buildDashboardIdeaRow(
  ctx: ModuleLifecycleContext,
  row: Record<string, unknown>,
  cache: Map<string, DashboardIdeaPlanArtifactSummary | null>,
  recoveredIdeaPlansByIdeaId: Map<string, IdeaPlanDocument>
): DashboardIdeaRow {
  const idea = row as DashboardIdeaRow;
  const planningChatSession =
    row.planningChatSession && typeof row.planningChatSession === "object"
      ? (row.planningChatSession as DashboardIdeaRow["planningChatSession"])
      : undefined;
  const ideaId = typeof row.id === "string" ? row.id.trim() : "";
  const fallbackIdeaPlan = ideaId.length > 0 ? recoveredIdeaPlansByIdeaId.get(ideaId) : undefined;
  const fallbackIdeaPlanRef = fallbackIdeaPlan?.planRef;
  const activeDraftPlanRef =
    buildIdeaPlanArtifactSummary(
      ctx,
      typeof row.activeDraftPlanArtifact === "string" ? row.activeDraftPlanArtifact : undefined,
      cache
    ) ??
    buildIdeaPlanArtifactSummary(
      ctx,
      planningChatSession && planningChatSession.status !== "completed" ? planningChatSession.currentPlanRef : undefined,
      cache
    ) ??
    buildIdeaPlanArtifactSummary(
      ctx,
      fallbackIdeaPlan && fallbackIdeaPlan.status !== "idea" ? fallbackIdeaPlanRef : undefined,
      cache
    );
  const linkedPlanSummary =
    buildIdeaPlanArtifactSummary(
      ctx,
      typeof row.linkedPlanArtifact === "string" ? row.linkedPlanArtifact : undefined,
      cache
    ) ??
    buildIdeaPlanArtifactSummary(
      ctx,
      planningChatSession?.status === "completed" ? planningChatSession.currentPlanRef : undefined,
      cache
    ) ??
    buildIdeaPlanArtifactSummary(
      ctx,
      fallbackIdeaPlan && fallbackIdeaPlan.status === "idea" ? fallbackIdeaPlanRef : undefined,
      cache
    );
  return {
    ...idea,
    ...(activeDraftPlanRef ? { activeDraftPlanArtifactSummary: activeDraftPlanRef } : {}),
    ...(linkedPlanSummary ? { linkedPlanArtifactSummary: linkedPlanSummary } : {})
  };
}

export function buildDashboardIdeasSummary(
  ctx: ModuleLifecycleContext,
  sqliteDual: SqliteDualPlanningStore | undefined,
  needsQueueRollups: boolean
): DashboardIdeasSummary {
  if (!needsQueueRollups || !sqliteDual) {
    return emptyIdeasSummary();
  }
  try {
    const db = sqliteDual.getDatabase();
    const ideas = listIdeas(db);
    const sessions = new Map(listPlanningChatSessions(db).map((session) => [session.ideaId, session]));
    const planSummaryCache = new Map<string, DashboardIdeaPlanArtifactSummary | null>();
    const recoveredIdeaPlansByIdeaId = new Map<string, IdeaPlanDocument>();
    for (const document of listIdeaPlanArtifacts(ctx.workspacePath)) {
      if (!recoveredIdeaPlansByIdeaId.has(document.ideaId)) {
        recoveredIdeaPlansByIdeaId.set(document.ideaId, document);
      }
    }
    return {
      schemaVersion: 1,
      available: true,
      totalCount: ideas.length,
      openCount: ideas.filter((idea) => idea.status === "open").length,
      planningCount: ideas.filter((idea) => idea.status === "planning").length,
      plannedCount: ideas.filter((idea) => idea.status === "planned").length,
      top: ideas.slice(0, 15).map((idea) => {
        const session = sessions.get(idea.id);
        const activeDraftPlanArtifact = readActiveDraftPlanArtifact(db, idea.id);
        const base: Record<string, unknown> = {
          ...idea,
          ...(activeDraftPlanArtifact ? { activeDraftPlanArtifact } : {})
        };
        if (session) {
          base.planningChatSession = {
            schemaVersion: 1,
            ideaId: session.ideaId,
            status: session.status,
            updatedAt: session.updatedAt,
            ...(session.resumePrompt ? { resumePrompt: session.resumePrompt } : {}),
            ...(session.summary ? { summary: session.summary } : {}),
            ...(session.currentPlanRef ? { currentPlanRef: session.currentPlanRef } : {}),
            ...(typeof session.currentPlanVersion === "number"
              ? { currentPlanVersion: session.currentPlanVersion }
              : {}),
            ...(session.completedAt ? { completedAt: session.completedAt } : {})
          };
        }
        return buildDashboardIdeaRow(ctx, base, planSummaryCache, recoveredIdeaPlansByIdeaId);
      })
    };
  } catch {
    return emptyIdeasSummary();
  }
}
