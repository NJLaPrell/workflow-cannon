/**
 * Vendored from `src/modules/task-engine/dashboard/enrich-dashboard-agent-activity-summary.ts`.
 * The VSIX ships without `@workflow-cannon/workspace-kit` node_modules — keep this mirror aligned.
 */

import type {
  DashboardAgentActivityRow,
  DashboardAgentActivitySummary,
  DashboardAgentRegistrySessionSummary,
  DashboardAgentRegistrySessionTopOpenSessionRow
} from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";

const MODEL_TIER_LABELS: Record<string, string> = {
  cheap_fast: "Fast",
  balanced: "Balanced",
  high_reasoning: "High reasoning",
  specialist: "Specialist",
  human_review: "Human review",
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3"
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function modelTierLabel(modelTier: string | null | undefined): string | null {
  const tier = cleanText(modelTier);
  if (!tier) {
    return null;
  }
  return MODEL_TIER_LABELS[tier] ?? titleCase(tier);
}

function resolveRegistrySessionForRow(
  row: DashboardAgentActivityRow,
  sessions: DashboardAgentRegistrySessionTopOpenSessionRow[]
): DashboardAgentRegistrySessionTopOpenSessionRow | null {
  if (sessions.length === 0) {
    return null;
  }
  const activityId = cleanText(row.refs.activityId);
  if (activityId) {
    const byActivity = sessions.find((session) => cleanText(session.currentActivityId) === activityId);
    if (byActivity) {
      return byActivity;
    }
  }
  const assignmentId = cleanText(row.refs.assignmentId ?? row.work.assignmentId);
  if (assignmentId) {
    const byAssignment = sessions.find((session) => cleanText(session.currentAssignmentId) === assignmentId);
    if (byAssignment) {
      return byAssignment;
    }
  }
  const sessionId = cleanText(row.refs.sessionId ?? row.work.sessionId);
  if (sessionId) {
    const bySession = sessions.find((session) => session.sessionId === sessionId);
    if (bySession) {
      return bySession;
    }
  }
  const agentId = cleanText(row.refs.agentId);
  if (agentId) {
    const byAgent = sessions.find((session) => session.agentId === agentId);
    if (byAgent) {
      return byAgent;
    }
  }
  return null;
}

function mergeAgentProfileWithRegistrySession(
  profile: DashboardAgentActivityRow["agentProfile"] | undefined,
  session: DashboardAgentRegistrySessionTopOpenSessionRow
): DashboardAgentActivityRow["agentProfile"] {
  const tierLabel = modelTierLabel(session.modelTier);
  const next = {
    agentType: profile?.agentType ?? null,
    model: profile?.model ?? null,
    thinkingLevel: profile?.thinkingLevel ?? tierLabel,
    agentNameOrId: profile?.agentNameOrId ?? cleanText(session.agentId) ?? null
  };
  if (!next.agentType && !next.model && !next.thinkingLevel && !next.agentNameOrId) {
    return undefined;
  }
  return next;
}

function enrichActivityRow(
  row: DashboardAgentActivityRow,
  sessions: DashboardAgentRegistrySessionTopOpenSessionRow[]
): DashboardAgentActivityRow {
  const session = resolveRegistrySessionForRow(row, sessions);
  if (!session) {
    return row;
  }
  const agentProfile = mergeAgentProfileWithRegistrySession(row.agentProfile, session);
  if (agentProfile === row.agentProfile) {
    return row;
  }
  return { ...row, agentProfile };
}

/** Fill missing model/thinking/agent identity on activity rows from agent registry open sessions. */
export function enrichDashboardAgentActivitySummaryWithRegistrySessions(
  summary: DashboardAgentActivitySummary,
  sessions: DashboardAgentRegistrySessionSummary | null | undefined
): DashboardAgentActivitySummary {
  if (!sessions?.available || !Array.isArray(sessions.topOpenSessions) || sessions.topOpenSessions.length === 0) {
    return summary;
  }
  const openSessions = sessions.topOpenSessions;
  return {
    ...summary,
    main: summary.main ? enrichActivityRow(summary.main, openSessions) : null,
    active: summary.active.map((row) => enrichActivityRow(row, openSessions)),
    needsAttention: summary.needsAttention.map((row) => enrichActivityRow(row, openSessions))
  };
}
