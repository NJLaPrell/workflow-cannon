/**
 * Kit-side dashboard slice refresh definitions (mirrors extension `dashboard-slice-registry.ts`).
 */
import type { DashboardServiceSliceName } from "../../contracts/dashboard-snapshot.js";

export type DashboardServiceSliceDefinition = {
  readonly name: DashboardServiceSliceName;
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
    command: "dashboard-summary",
    args: { projection: "overview" },
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
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "agentStatus", "agentGuidance", "suggestedNext"])
  },
  {
    name: "queue",
    command: "dashboard-summary",
    args: { projection: "queue" },
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
    command: "dashboard-summary",
    args: { projection: "queue" },
    source: "dashboard-summary:queue",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "ideas"])
  },
  {
    name: "team",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "teamExecution"])
  },
  {
    name: "subagents",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "subagentRegistry"])
  },
  {
    name: "checkpoints",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "taskCheckpoints"])
  },
  {
    name: "status",
    command: "dashboard-summary",
    args: { projection: "status" },
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
    command: "dashboard-summary",
    args: { projection: "queue" },
    source: "dashboard-summary:queue",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "phaseJournalStats", "pastPhaseNotes"])
  },
  {
    name: "cae",
    command: "cae-authoring-summary",
    args: { schemaVersion: 1 },
    source: "cae-authoring-summary",
    extractPayload: (data) => data
  },
  {
    name: "config",
    command: "dashboard-summary",
    args: { projection: "overview" },
    source: "dashboard-summary:overview",
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "systemStatus", "workspaceStatus"])
  }
];

export function lookupDashboardServiceSlice(name: string): DashboardServiceSliceDefinition | undefined {
  return DASHBOARD_SERVICE_SLICE_DEFINITIONS.find((entry) => entry.name === name);
}

export function listDashboardServiceSliceNames(): DashboardServiceSliceName[] {
  return DASHBOARD_SERVICE_SLICE_DEFINITIONS.map((entry) => entry.name);
}
