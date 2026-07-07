/**
 * Kit-side dashboard slice refresh definitions (mirrors extension `dashboard-slice-registry.ts`).
 */
import type { DashboardServiceSliceName } from "../../contracts/dashboard-snapshot.js";
import type { DashboardServicePollGroup } from "./poll-groups.js";

export type DashboardServiceSliceDefinition = {
  readonly name: DashboardServiceSliceName;
  readonly pollGroup: DashboardServicePollGroup;
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly extractPayload: (data: Record<string, unknown>) => Record<string, unknown>;
};

function pick(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in data) {
      out[key] = data[key];
    }
  }
  return out;
}

const SHARED_META_KEYS = [
  "schemaVersion",
  "planningGeneration",
  "planningGenerationPolicy",
  "taskStoreLastUpdated",
  "dashboardProjection"
] as const;

export const DASHBOARD_SERVICE_SLICE_DEFINITIONS: readonly DashboardServiceSliceDefinition[] = [
  {
    name: "overview",
    pollGroup: "critical",
    command: "dashboard-overview-slice",
    args: {},
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [
        ...SHARED_META_KEYS,
        "stateSummary",
        "suggestedNext",
        "workspaceStatus",
        "planArtifact",
        "humanGatesSummary",
        "approvalQueue",
        "taskStateProjection",
        "readyQueueCount",
        "readyQueueBreakdown",
        "blockedSummary",
        "completedSummary",
        "cancelledSummary",
        "dependencyOverview",
        "currentPhaseDelivery",
        "deliveredPhaseKeys",
        "rolledOutPhaseKeys",
        "phaseReleaseDates",
        "legacyDeliveredMaxOrdinal",
        "phaseKeysWithActiveQueueWork"
      ])
  },
  {
    name: "phase",
    pollGroup: "critical",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [
        ...SHARED_META_KEYS,
        "systemStatus",
        "workspaceStatus",
        "currentPhaseDelivery",
        "deliveredPhaseKeys",
        "rolledOutPhaseKeys",
        "phaseReleaseDates",
        "legacyDeliveredMaxOrdinal",
        "phaseKeysWithActiveQueueWork"
      ])
  },
  {
    name: "agent",
    pollGroup: "critical",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "agentStatus", "agentGuidance", "suggestedNext"])
  },
  {
    name: "planArtifact",
    pollGroup: "critical",
    command: "dashboard-ops-slice",
    args: {},
    source: "dashboard-ops-slice",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "planArtifact", "workspaceStatus", "brainstormingIdeas"])
  },
  {
    name: "agentActivity",
    pollGroup: "live",
    command: "dashboard-agent-activity-slice",
    args: {},
    source: "dashboard-summary:agentActivity",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "agentActivitySummary"])
  },
  {
    name: "queue",
    pollGroup: "queue",
    command: "dashboard-queue-slice",
    args: {},
    source: "dashboard-summary:queue",
    extractPayload: (data) =>
      pick(data, [
        ...SHARED_META_KEYS,
        "proposedImprovementsSummary",
        "proposedExecutionSummary",
        "readyImprovementsSummary",
        "readyExecutionSummary",
        "readyQueueTop",
        "readyQueueCount",
        "readyQueueBreakdown",
        "blockedSummary",
        "completedSummary",
        "cancelledSummary",
        "wishlist",
        "blockingAnalysis",
        "dependencyOverview",
        "planningSession",
        "transcriptChurnResearchSummary"
      ])
  },
  {
    name: "ideas",
    pollGroup: "queue",
    command: "dashboard-queue-slice",
    args: {},
    source: "dashboard-queue-slice",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "ideas", "brainstormingIdeas"])
  },
  {
    name: "team",
    pollGroup: "ops",
    command: "dashboard-summary",
    args: { projection: "status" },
    source: "dashboard-summary:status",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "teamExecution"])
  },
  {
    name: "subagents",
    pollGroup: "ops",
    command: "dashboard-summary",
    args: { projection: "status" },
    source: "dashboard-summary:status",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "subagentRegistry"])
  },
  {
    name: "checkpoints",
    pollGroup: "ops",
    command: "dashboard-summary",
    args: { projection: "status" },
    source: "dashboard-summary:status",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "taskCheckpoints"])
  },
  {
    name: "status",
    pollGroup: "status",
    command: "dashboard-status-slice",
    args: {},
    source: "dashboard-summary:status",
    extractPayload: (data) =>
      pick(data, [
        ...SHARED_META_KEYS,
        "systemStatus",
        "agentStatus",
        "agentGuidance",
        "taskStateProjection",
        "workspaceStatus"
      ])
  },
  {
    name: "phaseJournal",
    pollGroup: "manual",
    command: "dashboard-summary",
    args: { projection: "queue" },
    source: "dashboard-summary:queue",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "phaseJournalStats", "pastPhaseNotes"])
  },
  {
    name: "cae",
    pollGroup: "manual",
    command: "cae-authoring-summary",
    args: { schemaVersion: 1 },
    source: "cae-authoring-summary",
    extractPayload: (data) => data
  },
  {
    name: "config",
    pollGroup: "manual",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "systemStatus", "workspaceStatus"])
  },
  {
    name: "agentTypes",
    pollGroup: "live",
    command: "dashboard-agent-types-slice",
    args: {},
    source: "dashboard-agent-types-slice",
    extractPayload: (data) => data
  },
  {
    name: "terminalTasks",
    pollGroup: "manual",
    command: "dashboard-terminal-tasks-page",
    args: { status: "completed", limit: 10 },
    source: "dashboard-terminal-tasks",
    extractPayload: (data) => data
  }
];

export function lookupDashboardServiceSlice(name: string): DashboardServiceSliceDefinition | undefined {
  return DASHBOARD_SERVICE_SLICE_DEFINITIONS.find((entry) => entry.name === name);
}

export function listDashboardServiceSliceNames(): DashboardServiceSliceName[] {
  return DASHBOARD_SERVICE_SLICE_DEFINITIONS.map((entry) => entry.name);
}
