import type { DashboardMutationKind } from "./dashboard-section-invalidation.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";

export type DashboardPollGroupId = "critical" | "live" | "queue" | "ops" | "status";

export const DASHBOARD_POLL_GROUP_INTERVAL_MS: Readonly<Record<DashboardPollGroupId, number>> = {
  critical: 2000,
  live: 3000,
  queue: 5000,
  ops: 10000,
  status: 30000
};

export type DashboardSliceDescriptor = {
  readonly name: DashboardSliceName;
  readonly sectionId: DashboardSectionId;
  readonly command: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly pollGroup: DashboardPollGroupId | "manual";
  /** When true, interval ticks skip unless section is visible. */
  readonly visibleOnly: boolean;
  readonly freshnessTtlMs: number | null;
  /** Handoff freshness SLA — mirrors `freshnessTtlMs` for store/poller gates. */
  readonly freshnessSlaMs: number | null;
  readonly staleOnMutationKinds: readonly DashboardMutationKind[];
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

export const DASHBOARD_SLICE_REGISTRY: readonly DashboardSliceDescriptor[] = [
  {
    name: "overview",
    sectionId: "overview",
    command: "dashboard-overview-slice",
    args: {},
    pollGroup: "critical",
    visibleOnly: false,
    freshnessTtlMs: 5_000,
    freshnessSlaMs: 5_000,
    staleOnMutationKinds: ["overview", "task-queue", "ideas", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [
        ...SHARED_META_KEYS,
        "stateSummary",
        "suggestedNext",
        "workspaceStatus",
        "humanGatesSummary",
        "approvalQueue",
        "taskStateProjection",
        // Overview projection still ships planArtifact for eager planning cards.
        "planArtifact",
        // Queue rollups are owned by the `queue` slice (`projection: "queue"`). Overview
        // projection intentionally zeros these — merging them clobbers hydrated task data.
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
    sectionId: "phase-roster",
    command: "dashboard-overview-slice",
    args: {},
    pollGroup: "critical",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["overview", "task-queue", "status", "phase-journal", "workspace-wide"],
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
    name: "planArtifact",
    sectionId: "plan-artifact",
    // Lightweight ops slice (planArtifact + workspaceStatus only) — avoids the
    // full doctor/CAE/git-drift scan `dashboard-status-slice`/`projection:"status"`
    // pays for, since this is the highest-frequency ("critical", 2s) poll tier.
    command: "dashboard-ops-slice",
    args: {},
    pollGroup: "critical",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["overview", "task-queue", "plan-artifact", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "planArtifact", "workspaceStatus", "brainstormingIdeas"])
  },
  {
    name: "agent",
    sectionId: "overview",
    command: "dashboard-overview-slice",
    args: {},
    pollGroup: "critical",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["overview", "task-queue", "config", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "agentStatus", "agentGuidance", "suggestedNext"])
  },
  {
    name: "agentActivity",
    sectionId: "overview",
    command: "dashboard-agent-activity-slice",
    args: {},
    pollGroup: "live",
    visibleOnly: true,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "workspace-wide"],
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "agentActivitySummary"])
  },
  {
    name: "agentTypes",
    sectionId: "overview",
    command: "dashboard-agent-types-slice",
    args: {},
    pollGroup: "live",
    visibleOnly: true,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "subagentRegistry", "agentRegistrySessions"])
  },
  {
    name: "queue",
    sectionId: "queue",
    command: "dashboard-queue-slice",
    args: {},
    pollGroup: "queue",
    visibleOnly: true,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "phase-journal", "workspace-wide"],
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
        "transcriptChurnResearchSummary"
      ])
  },
  {
    name: "ideas",
    sectionId: "ideas",
    command: "dashboard-queue-slice",
    args: {},
    pollGroup: "queue",
    visibleOnly: true,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["ideas", "plan-artifact", "workspace-wide"],
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "ideas", "brainstormingIdeas"])
  },
  {
    name: "team",
    sectionId: "overview",
    // Lightweight ops slice — teamExecution only needs kit SQLite rollups, not
    // the full doctor/CAE/git-drift scan `dashboard-status-slice` pays for.
    command: "dashboard-ops-slice",
    args: {},
    pollGroup: "ops",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "workspace-wide"],
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "teamExecution"])
  },
  {
    name: "subagents",
    sectionId: "overview",
    // Lightweight ops slice — subagentRegistry only needs kit SQLite rollups,
    // not the full doctor/CAE/git-drift scan `dashboard-status-slice` pays for.
    command: "dashboard-ops-slice",
    args: {},
    pollGroup: "ops",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "workspace-wide"],
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "subagentRegistry"])
  },
  {
    name: "checkpoints",
    sectionId: "overview",
    // Lightweight ops slice — taskCheckpoints only needs kit SQLite rollups,
    // not the full doctor/CAE/git-drift scan `dashboard-status-slice` pays for.
    command: "dashboard-ops-slice",
    args: {},
    pollGroup: "ops",
    visibleOnly: false,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["task-queue", "workspace-wide"],
    extractPayload: (data) => pick(data, [...SHARED_META_KEYS, "taskCheckpoints"])
  },
  {
    name: "status",
    sectionId: "status",
    command: "dashboard-status-slice",
    args: {},
    pollGroup: "status",
    visibleOnly: true,
    freshnessTtlMs: 30_000,
    freshnessSlaMs: 30_000,
    staleOnMutationKinds: ["status", "config", "cae", "workspace-wide"],
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
    sectionId: "phase-journal",
    command: "dashboard-queue-slice",
    args: {},
    pollGroup: "manual",
    visibleOnly: true,
    freshnessTtlMs: 10_000,
    freshnessSlaMs: 10_000,
    staleOnMutationKinds: ["phase-journal", "task-queue", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "phaseJournalStats", "pastPhaseNotes"])
  },
  {
    name: "cae",
    sectionId: "cae",
    command: "cae-authoring-summary",
    args: { schemaVersion: 1 },
    pollGroup: "manual",
    visibleOnly: true,
    freshnessTtlMs: 120_000,
    freshnessSlaMs: 120_000,
    staleOnMutationKinds: ["cae", "workspace-wide"],
    extractPayload: (data) => data
  },
  {
    name: "config",
    sectionId: "config",
    command: "dashboard-overview-slice",
    args: {},
    pollGroup: "manual",
    visibleOnly: true,
    freshnessTtlMs: null,
    freshnessSlaMs: null,
    staleOnMutationKinds: ["config", "workspace-wide"],
    extractPayload: (data) =>
      pick(data, [...SHARED_META_KEYS, "systemStatus", "workspaceStatus"])
  }
];

export function lookupDashboardSlice(name: DashboardSliceName): DashboardSliceDescriptor {
  const found = DASHBOARD_SLICE_REGISTRY.find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`unknown dashboard slice: ${name}`);
  }
  return found;
}

/** Map mutation kind → slice names that should mark stale (registry `staleOnMutationKinds`). */
export function sliceNamesForMutation(kind: DashboardMutationKind): DashboardSliceName[] {
  const names = new Set<DashboardSliceName>();
  for (const desc of DASHBOARD_SLICE_REGISTRY) {
    if (desc.staleOnMutationKinds.includes(kind)) {
      names.add(desc.name);
    }
  }
  return [...names];
}

/** Alias for handoff / data-map naming. */
export const dashboardSliceNamesForMutation = sliceNamesForMutation;

export function dashboardSliceNamesForPollGroup(group: DashboardPollGroupId): DashboardSliceName[] {
  return DASHBOARD_SLICE_REGISTRY.filter((desc) => desc.pollGroup === group).map((desc) => desc.name);
}
