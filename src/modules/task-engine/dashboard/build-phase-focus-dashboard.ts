import type { AgentPhaseFocusDashboard } from "../../../contracts/agent-phase-focus-dashboard-contract.js";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { buildPhaseDeliveryPreflight } from "../delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import { readMetadataPath } from "../mutation-utils.js";
import { inferTaskPhaseKey, resolveCanonicalPhase } from "../phase-resolution.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { buildPhaseJournalSnapshotSummary } from "../phase-journal/phase-journal-snapshot-summary.js";
import type { TaskEntity } from "../types.js";
import { buildDashboardPhaseJournalStats } from "./build-dashboard-phase-journal-stats.js";
import {
  buildDashboardCurrentPhaseDelivery,
  countPhaseQueueMetrics
} from "./phase-delivery-status.js";

export const PHASE_FOCUS_READY_TOP_MAX = 15;
export const PHASE_FOCUS_BLOCKED_TOP_MAX = 10;
export const PHASE_FOCUS_EVIDENCE_GAPS_MAX = 10;

function taskInPhase(task: TaskEntity, phaseKey: string): boolean {
  return !task.archived && inferTaskPhaseKey(task) === phaseKey;
}

function readBlockedReasonCategory(task: TaskEntity): string | null {
  const md =
    task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : undefined;
  const raw = readMetadataPath(md, "blockedReasonCategory");
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export function buildPhaseFocusDashboard(args: {
  ctx: ModuleLifecycleContext;
  planning: OpenedPlanningStores;
  phaseKey?: string | null;
}): AgentPhaseFocusDashboard {
  const tasks = args.planning.taskStore.getActiveTasks();
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(args.planning.sqliteDual);
  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: args.ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const phaseKey =
    typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0
      ? args.phaseKey.trim()
      : phaseRes.canonicalPhaseKey;

  const scoped = phaseKey ? tasks.filter((t) => taskInPhase(t, phaseKey)) : [];

  const readyTop = scoped
    .filter((t) => t.status === "ready")
    .sort((a, b) => (a.priority ?? "P9").localeCompare(b.priority ?? "P9"))
    .slice(0, PHASE_FOCUS_READY_TOP_MAX)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: "ready" as const,
      priority: t.priority ?? null
    }));

  const completedIds = new Set(
    tasks.filter((t) => t.status === "completed").map((t) => t.id)
  );
  const blockedTop = scoped
    .filter((t) => t.status === "blocked")
    .map((t) => {
      const deps = t.dependsOn ?? [];
      const blockedBy = deps.filter((id) => !completedIds.has(id));
      return {
        taskId: t.id,
        title: t.title,
        blockedBy,
        blockingCount: blockedBy.length,
        blockedReasonCategory: readBlockedReasonCategory(t)
      };
    })
    .filter((row) => row.blockingCount > 0 || row.blockedReasonCategory)
    .sort((a, b) => b.blockingCount - a.blockingCount)
    .slice(0, PHASE_FOCUS_BLOCKED_TOP_MAX);

  const deliveryFull = buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: phaseKey
      ? { currentKitPhase: phaseKey, nextKitPhase: workspaceStatus?.nextKitPhase ?? null }
      : workspaceStatus,
    db: args.planning.sqliteDual.getDatabase()
  });

  const journalStats = buildDashboardPhaseJournalStats({
    db: args.planning.sqliteDual.getDatabase(),
    currentKitPhase: phaseKey,
    completedDeliveryTaskCount: deliveryFull.segments.completed
  });
  const journalSnapshot = buildPhaseJournalSnapshotSummary(
    args.planning.sqliteDual.getDatabase(),
    phaseKey
  );

  const effectiveConfig = args.ctx.effectiveConfig as Record<string, unknown> | undefined;
  const policyContextByTaskId = Object.fromEntries(
    tasks.map((task) => {
      const resolved = resolveMaintainerDeliveryPolicy({ effectiveConfig, task });
      return [task.id, buildDeliveryEvidencePolicyContext(resolved)];
    })
  );
  const preflight = buildPhaseDeliveryPreflight({
    tasks,
    phaseKey,
    includeInProgress: true,
    policyContextByTaskId
  });
  const evidenceTop = preflight.violations.slice(0, PHASE_FOCUS_EVIDENCE_GAPS_MAX).map((v) => ({
    taskId: v.taskId,
    code: v.code,
    message: v.message,
    missingFields: v.missingFields ?? []
  }));

  const queue = phaseKey ? countPhaseQueueMetrics(tasks, phaseKey) : countPhaseQueueMetrics(tasks, null);

  return {
    schemaVersion: 1,
    phaseKey,
    generatedAt: new Date().toISOString(),
    canonicalPhase: {
      canonicalPhaseKey: phaseRes.canonicalPhaseKey,
      phaseSource: phaseRes.source,
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null,
      configMatchesWorkspaceStatus: phaseRes.configMatchesWorkspaceStatus ?? null
    },
    queue,
    delivery: {
      closeoutPassed: deliveryFull.closeoutPassed,
      remainingCount: deliveryFull.remainingCount,
      progressPercent: deliveryFull.progressPercent,
      releaseReadyPercent: deliveryFull.releaseReadyPercent
    },
    readyTop,
    blockedTop,
    phaseJournal: {
      available: journalStats.available,
      activeNoteCount: journalStats.currentPhase.activeNoteCount,
      criticalCount: journalSnapshot?.criticalCount ?? 0,
      silenceWarning: journalStats.currentPhase.silenceWarning
    },
    evidenceGaps: {
      violationCount: preflight.violationCount,
      top: evidenceTop
    }
  };
}
