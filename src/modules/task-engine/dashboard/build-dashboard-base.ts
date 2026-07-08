import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  DashboardPlanArtifactWbsRow,
  DashboardPlanArtifactRiskRow,
  DashboardPlanArtifactOpenQuestionRow,
  DashboardPlanArtifactReviewFindingRow,
  DashboardPlanArtifactPhaseRecommendationRow,
  DashboardPlanArtifactTextRow,
  DashboardPlanArtifactUserStoryRow,
  DashboardPlanArtifactValueAssessmentSummary,
  DashboardPlanArtifactArchitectureDecisionRow,
  DashboardPlanArtifactArchitectureDiagramRow,
  DashboardPlanArtifactTechnicalImpactSummary,
  DashboardPlanArtifactTestingStrategySummary,
  DashboardPlanArtifactUiUxSummary,
  DashboardPlanArtifactApprovalSummary,
  DashboardPlanArtifactExecutionLinkageRow,
  DashboardSubagentRegistrySummary,
  DashboardSummaryData,
  DashboardPhaseKickoffSummary,
  DashboardTaskCheckpointsSummary,
  DashboardTeamExecutionSummary
} from "../../../contracts/dashboard-summary-run.js";
import { summarizeCheckpointsForDashboard } from "../../checkpoints/checkpoint-store.js";
import { summarizeSubagentsForDashboard } from "../../subagents/subagent-store.js";
import { summarizeTeamAssignmentsForDashboard } from "../../team-execution/assignment-store.js";
import { resolveAgentGuidanceFromEffectiveConfig } from "../../../core/agent-guidance-catalog.js";
import { resolveAgentPresentationPolicy } from "../../../core/agent-presentation-policy.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import { getNextActions, isImprovementLikeTask } from "../suggestions.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "../transcript-churn.js";
import {
  openSqliteDualForWorkspaceStatus,
  readWorkspaceStatusSnapshotFromDual
} from "../persistence/workspace-status-store.js";
import { buildDashboardDependencyOverview } from "./dashboard-dependency-overview.js";
import { buildDashboardPhaseBucketsForTasks } from "./dashboard-phase-buckets.js";
import { readBuildPlanSession, toDashboardPlanningSession } from "../../../core/planning/build-plan-session-file.js";
import { listPlanArtifactSummaries, readLatestPlanArtifact } from "../../../core/planning/plan-artifact-storage.js";
import { readIdeaPlanArtifact } from "../../ideas/idea-plan-artifact-storage.js";
import { isCriticalOpenQuestion } from "../../../core/planning/review-plan-artifact.js";
import { reviewPlanArtifact } from "../../../core/planning/review-plan-artifact.js";
import {
  buildPlanArtifactReviewFindingRecords,
  type PlanArtifactReviewFindingRecordV1,
  type PlanArtifactReviewRecordV1
} from "../../../core/planning/plan-artifact-review-record.js";
import type {
  PlanArtifactArchitectureDecision,
  PlanArtifactApprovalRecord,
  PlanArtifactExecutionLinkage,
  PlanArtifactPhaseRecommendation,
  PlanArtifactRiskItem,
  PlanArtifactTechnicalImpact,
  PlanArtifactTestingStrategy,
  PlanArtifactUiUxDirection,
  PlanArtifactUserStory,
  PlanArtifactValueAssessment,
  PlanArtifactV1,
  PlanArtifactWbsItem
} from "../../../core/planning/plan-artifact-v1.js";
import { isDeferredPlanPhaseRecommendationKey } from "../../../core/planning/resolve-plan-artifact-phase-proposal.js";
import { dashboardOnboardingTemperamentLabel } from "../../agent-behavior/onboarding-temperament-label.js";
import { loadBehaviorWorkspaceState } from "../../agent-behavior/persistence.js";
import { BehaviorProfileStore } from "../../agent-behavior/store.js";
import {
  findWishlistIntakeTaskByLegacyOrTaskId,
  isWishlistIntakeTask,
  listWishlistIntakeTasksAsItems
} from "../wishlist-intake.js";
import type { TaskStore } from "../persistence/store.js";
import type { TaskEntity } from "../types.js";
import type { SqliteDualPlanningStore } from "../persistence/sqlite-dual-planning.js";
import { buildFeatureEnrichmentBySlug } from "../persistence/feature-registry-queries.js";
import { buildDashboardSystemStatus, buildDashboardSystemStatusOverview } from "./build-dashboard-system-status.js";
import { buildDashboardAgentStatus } from "./dashboard-agent-status.js";
import {
  agentActivityLeaseToDashboardStatus,
  readCurrentAgentActivityLease,
  listCurrentAgentActivityLeases
} from "../agent-activity-store.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import {
  buildDashboardCurrentPhaseDelivery,
  collectDeliveredPhaseKeys,
  collectPhaseDeliveryHistoryRows,
  collectPhaseKeysWithActiveQueueWork,
  collectRolledOutPhaseKeys,
  collectPhaseReleaseDatesByKey
} from "./phase-delivery-status.js";
import { resolveLegacyDeliveredMaxOrdinal, parseKitPhaseNumberFromYaml } from "../phase-resolution.js";
import { buildDashboardPastPhaseNotes } from "./build-dashboard-past-phase-notes.js";
import { buildDashboardApprovalQueueSummary } from "./build-dashboard-approval-queue.js";
import { buildPhaseFocusDashboard } from "./build-phase-focus-dashboard.js";
import { buildDashboardPhaseKickoffSlice } from "../phase-kickoff-policy.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildDashboardHumanGatesSummary } from "./build-dashboard-human-gates.js";
import { buildDashboardPhaseJournalStats } from "./build-dashboard-phase-journal-stats.js";
import {
  dashboardSummaryNeedsPastPhaseNotes,
  dashboardSummaryNeedsAgentActivityRollups,
  dashboardSummaryNeedsPhaseJournalStats,
  dashboardSummaryNeedsQueueRollups,
  dashboardSummaryNeedsStatusRollups,
  parseDashboardSummaryProjection,
  type DashboardSummaryProjection
} from "./dashboard-summary-projection.js";
import {
  buildDashboardTaskStateProjectionSummary,
  buildDashboardTaskStateProjectionOverview
} from "./build-dashboard-task-state-projection.js";
import { buildDashboardAgentActivitySummary } from "./build-dashboard-agent-activity-summary.js";
import { summarizeAgentRegistrySessions } from "../agent-registry-session-summary.js";
import type { DashboardSummaryTracer } from "./dashboard-summary-trace.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../../core/state/kit-sqlite/planning-sqlite-kernel.js";
import { buildDashboardIdeasSummary } from "./build-dashboard-ideas-summary.js";
import { buildDashboardBrainstormingIdeasRollup } from "./build-dashboard-brainstorming-ideas-rollup.js";

/** Parse optional `dashboard-summary` argv for wishlist table paging (extension + CLI). */
export function parseDashboardWishlistPaging(args?: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const a = args ?? {};
  let page = 0;
  const rp = a.wishlistPage;
  if (typeof rp === "number" && Number.isInteger(rp) && rp >= 0) {
    page = rp;
  } else if (typeof rp === "string" && /^\d+$/.test(rp.trim())) {
    page = Number(rp.trim());
  }
  let pageSize = 10;
  const rs = a.wishlistPageSize;
  if (typeof rs === "number" && Number.isFinite(rs)) {
    pageSize = Math.min(100, Math.max(1, Math.floor(rs)));
  } else if (typeof rs === "string" && /^\d+$/.test(rs.trim())) {
    pageSize = Math.min(100, Math.max(1, Number(rs.trim())));
  }
  return { page, pageSize };
}

export function parseDashboardIncludeWishlist(
  args?: Record<string, unknown>,
  effectiveConfig?: Record<string, unknown>
): boolean {
  if (args?.includeWishlist === true || args?.includeWishlist === "true") {
    return true;
  }
  const tasksConfig = effectiveConfig?.tasks;
  return (
    !!tasksConfig &&
    typeof tasksConfig === "object" &&
    !Array.isArray(tasksConfig) &&
    ((tasksConfig as Record<string, unknown>).includeWishlist === true ||
      (tasksConfig as Record<string, unknown>).includeWishlist === "true")
  );
}

/** Tasks minted from a plan's WBS carry `metadata.planRef` back to the originating PlanArtifact (see normalize-wbs-to-task-draft.ts). */
function buildPlanRefToTasksIndex(allTasks: readonly TaskEntity[]): Map<string, TaskEntity[]> {
  const index = new Map<string, TaskEntity[]>();
  for (const task of allTasks) {
    const planRef = typeof task.metadata?.planRef === "string" ? task.metadata.planRef.trim() : "";
    if (!planRef) {
      continue;
    }
    const list = index.get(planRef);
    if (list) {
      list.push(task);
    } else {
      index.set(planRef, [task]);
    }
  }
  return index;
}

function buildTaskByIdIndex(allTasks: readonly TaskEntity[]): Map<string, TaskEntity> {
  const index = new Map<string, TaskEntity>();
  for (const task of allTasks) {
    index.set(task.id, task);
  }
  return index;
}

/** Merge planRef-linked tasks with unified IdeaPlan `delivery.taskRefs` when finalize omitted metadata.planRef. */
function resolvePlanArtifactLinkedTasks(
  planRefLinkedTasks: readonly TaskEntity[],
  deliveryTaskRefs: readonly string[] | undefined,
  taskById: ReadonlyMap<string, TaskEntity>
): TaskEntity[] {
  const merged = new Map<string, TaskEntity>();
  for (const task of planRefLinkedTasks) {
    merged.set(task.id, task);
  }
  if (!Array.isArray(deliveryTaskRefs)) {
    return [...merged.values()];
  }
  for (const raw of deliveryTaskRefs) {
    if (typeof raw !== "string") {
      continue;
    }
    const taskId = raw.trim();
    if (!/^T[0-9]+$/.test(taskId)) {
      continue;
    }
    const task = taskById.get(taskId);
    if (task) {
      merged.set(taskId, task);
    }
  }
  return [...merged.values()];
}

const PLAN_ARTIFACT_WBS_DESCRIPTION_MAX_LENGTH = 140;
const PLAN_ARTIFACT_RISK_DESCRIPTION_MAX_LENGTH = 200;
const PLAN_ARTIFACT_RISK_MITIGATION_MAX_LENGTH = 160;
const PLAN_ARTIFACT_OPEN_QUESTION_MAX_LENGTH = 240;
const PLAN_ARTIFACT_PHASE_RECOMMENDATION_RATIONALE_MAX_LENGTH = 160;
const PLAN_ARTIFACT_TEXT_ROLLUP_MAX_LENGTH = 220;
const PLAN_ARTIFACT_USER_STORY_MAX_LENGTH = 240;
const PLAN_ARTIFACT_VALUE_RATIONALE_MAX_LENGTH = 200;
const PLAN_ARTIFACT_ARCHITECTURE_OVERVIEW_MAX_LENGTH = 280;
const PLAN_ARTIFACT_ARCHITECTURE_TEXT_MAX_LENGTH = 180;
const PLAN_ARTIFACT_DIAGRAM_MERMAID_MAX_LENGTH = 480;
const PLAN_ARTIFACT_TECH_NOTES_MAX_LENGTH = 180;
const PLAN_ARTIFACT_WBS_EXTRA_FIELD_MAX_LENGTH = 140;

function joinPlanArtifactDisplayList(items: readonly string[], maxLength: number): string {
  const joined = items
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join("; ");
  if (joined.length === 0) {
    return "";
  }
  return truncatePlanArtifactWbsText(joined, maxLength);
}

function buildDashboardPlanArtifactTextRows(items: readonly string[]): DashboardPlanArtifactTextRow[] {
  if (items.length === 0) {
    return [];
  }
  return items
    .map((raw) => ({
      text: truncatePlanArtifactWbsText(raw.trim(), PLAN_ARTIFACT_TEXT_ROLLUP_MAX_LENGTH)
    }))
    .filter((row) => row.text.length > 0);
}

function humanizePlanArtifactUserStoryPriority(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (raw) {
    case "must":
      return "Must";
    case "should":
      return "Should";
    case "could":
      return "Could";
    default:
      return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
  }
}

function buildDashboardPlanArtifactUserStoryRows(
  stories: readonly PlanArtifactUserStory[]
): DashboardPlanArtifactUserStoryRow[] {
  if (stories.length === 0) {
    return [];
  }
  return stories
    .map((story) => {
      const id = story.id.trim() || "Story";
      const asA = story.asA.trim() || "user";
      const iWant = story.iWant.trim() || "…";
      const soThat = story.soThat.trim() || "…";
      const storyText = truncatePlanArtifactWbsText(
        `As a ${asA}, I want ${iWant} so that ${soThat}.`,
        PLAN_ARTIFACT_USER_STORY_MAX_LENGTH
      );
      return {
        id,
        priority: humanizePlanArtifactUserStoryPriority(story.priority),
        story: storyText
      };
    })
    .filter((row) => row.story.length > 0);
}

function buildDashboardPlanArtifactValueAssessmentSummary(
  valueAssessment: PlanArtifactValueAssessment | undefined
): DashboardPlanArtifactValueAssessmentSummary | null {
  if (!valueAssessment || typeof valueAssessment !== "object") {
    return null;
  }
  const impact = valueAssessment.impact.trim();
  const confidence = humanizePlanArtifactRiskSeverity(valueAssessment.confidence);
  const rationaleRaw =
    typeof valueAssessment.rationale === "string" ? valueAssessment.rationale.trim() : "";
  const rationale =
    rationaleRaw.length > PLAN_ARTIFACT_VALUE_RATIONALE_MAX_LENGTH
      ? rationaleRaw.slice(0, PLAN_ARTIFACT_VALUE_RATIONALE_MAX_LENGTH - 3).trimEnd() + "..."
      : rationaleRaw;
  if (impact.length === 0 && confidence === "—") {
    return null;
  }
  return {
    impact: impact.length > 0 ? impact : "—",
    confidence,
    ...(rationale.length > 0 ? { rationale } : {})
  };
}

function buildDashboardPlanArtifactArchitectureDecisionRows(
  decisions: readonly PlanArtifactArchitectureDecision[]
): DashboardPlanArtifactArchitectureDecisionRow[] {
  if (decisions.length === 0) {
    return [];
  }
  return decisions
    .map((decision) => {
      const id = decision.id.trim() || "ADR";
      const decisionText = truncatePlanArtifactWbsText(
        decision.decision.trim() || "—",
        PLAN_ARTIFACT_ARCHITECTURE_TEXT_MAX_LENGTH
      );
      const rationale = truncatePlanArtifactWbsText(
        decision.rationale.trim() || "—",
        PLAN_ARTIFACT_ARCHITECTURE_TEXT_MAX_LENGTH
      );
      return { id, decision: decisionText, rationale };
    })
    .filter((row) => row.decision !== "—" || row.rationale !== "—");
}

function buildDashboardPlanArtifactArchitectureDiagramRows(
  diagrams: readonly { title: string; mermaid?: string; caption?: string }[]
): DashboardPlanArtifactArchitectureDiagramRow[] {
  if (diagrams.length === 0) {
    return [];
  }
  return diagrams
    .map((diagram, index) => {
      const title = diagram.title.trim() || `Diagram ${index + 1}`;
      const mermaidRaw = typeof diagram.mermaid === "string" ? diagram.mermaid.trim() : "";
      const mermaid =
        mermaidRaw.length > 0
          ? truncatePlanArtifactWbsText(mermaidRaw, PLAN_ARTIFACT_DIAGRAM_MERMAID_MAX_LENGTH)
          : "";
      const captionRaw = typeof diagram.caption === "string" ? diagram.caption.trim() : "";
      const caption =
        captionRaw.length > 0
          ? truncatePlanArtifactWbsText(captionRaw, PLAN_ARTIFACT_ARCHITECTURE_TEXT_MAX_LENGTH)
          : "";
      if (mermaid.length === 0 && caption.length === 0) {
        return null;
      }
      return { title, mermaid, caption };
    })
    .filter((row): row is DashboardPlanArtifactArchitectureDiagramRow => row !== null);
}

function buildDashboardPlanArtifactTechnicalImpactSummary(
  technicalImpact: PlanArtifactTechnicalImpact | undefined
): DashboardPlanArtifactTechnicalImpactSummary | null {
  if (!technicalImpact || typeof technicalImpact !== "object") {
    return null;
  }
  const systemsTouched = (technicalImpact.systemsTouched ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const compatibilityNotesRaw =
    typeof technicalImpact.compatibilityNotes === "string" ? technicalImpact.compatibilityNotes.trim() : "";
  const migrationImpactRaw =
    typeof technicalImpact.migrationImpact === "string" ? technicalImpact.migrationImpact.trim() : "";
  const compatibilityNotes =
    compatibilityNotesRaw.length > 0
      ? truncatePlanArtifactWbsText(compatibilityNotesRaw, PLAN_ARTIFACT_TECH_NOTES_MAX_LENGTH)
      : "";
  const migrationImpact =
    migrationImpactRaw.length > 0
      ? truncatePlanArtifactWbsText(migrationImpactRaw, PLAN_ARTIFACT_TECH_NOTES_MAX_LENGTH)
      : "";
  if (systemsTouched.length === 0 && compatibilityNotes.length === 0 && migrationImpact.length === 0) {
    return null;
  }
  return {
    systemsTouched,
    ...(compatibilityNotes.length > 0 ? { compatibilityNotes } : {}),
    ...(migrationImpact.length > 0 ? { migrationImpact } : {})
  };
}

function buildDashboardPlanArtifactTestingStrategySummary(
  testingStrategy: PlanArtifactTestingStrategy | undefined
): DashboardPlanArtifactTestingStrategySummary | null {
  if (!testingStrategy || typeof testingStrategy !== "object") {
    return null;
  }
  const layers = (testingStrategy.layers ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const criticalPaths = (testingStrategy.criticalPaths ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const outOfScopeTesting = (testingStrategy.outOfScopeTesting ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (layers.length === 0 && criticalPaths.length === 0 && outOfScopeTesting.length === 0) {
    return null;
  }
  return {
    layers,
    criticalPaths,
    ...(outOfScopeTesting.length > 0 ? { outOfScopeTesting } : {})
  };
}

function buildDashboardPlanArtifactUiUxSummary(
  uiUx: PlanArtifactUiUxDirection | undefined
): DashboardPlanArtifactUiUxSummary | null {
  if (!uiUx || typeof uiUx !== "object") {
    return null;
  }
  const summaryRaw = typeof uiUx.summary === "string" ? uiUx.summary.trim() : "";
  const summary =
    summaryRaw.length > 0
      ? truncatePlanArtifactWbsText(summaryRaw, PLAN_ARTIFACT_ARCHITECTURE_OVERVIEW_MAX_LENGTH)
      : "";
  const mockupRefs = (uiUx.mockupRefs ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (!uiUx.hasUiChanges && summary.length === 0 && mockupRefs.length === 0) {
    return null;
  }
  return {
    hasUiChanges: uiUx.hasUiChanges === true,
    ...(summary.length > 0 ? { summary } : {}),
    ...(mockupRefs.length > 0 ? { mockupRefs } : {})
  };
}

function readTaskPlanningWbsId(task: TaskEntity): string {
  const metadata = task.metadata;
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  const planningProvenance = (metadata as Record<string, unknown>).planningProvenance;
  if (!planningProvenance || typeof planningProvenance !== "object" || Array.isArray(planningProvenance)) {
    return "";
  }
  const wbsId = (planningProvenance as Record<string, unknown>).wbsId;
  return typeof wbsId === "string" ? wbsId.trim() : "";
}

function buildWbsIdToLinkedTaskIndex(linkedTasks: readonly TaskEntity[]): Map<string, TaskEntity> {
  const index = new Map<string, TaskEntity>();
  for (const task of linkedTasks) {
    const wbsId = readTaskPlanningWbsId(task);
    if (wbsId.length > 0 && !index.has(wbsId)) {
      index.set(wbsId, task);
    }
  }
  return index;
}

function humanizeDashboardTaskStatus(status: unknown): string {
  const raw = typeof status === "string" ? status.trim().toLowerCase().replace(/[-\s]+/g, "_") : "";
  switch (raw) {
    case "research":
      return "Research";
    case "proposed":
      return "Proposed";
    case "ready":
      return "Ready";
    case "in_progress":
      return "In progress";
    case "awaiting_review":
      return "Awaiting review";
    case "awaiting_policy_approval":
      return "Awaiting policy";
    case "awaiting_external_decision":
      return "Awaiting decision";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
  }
}

function formatDashboardLinkageTimestamp(iso: unknown): string {
  const trimmed = typeof iso === "string" ? iso.trim() : "";
  if (trimmed.length === 0) {
    return "—";
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

function enrichDashboardPlanArtifactWbsRowsWithLinkedTasks(
  rows: DashboardPlanArtifactWbsRow[],
  wbsItems: readonly PlanArtifactWbsItem[],
  wbsIdToTask: Map<string, TaskEntity>,
  taskById: Map<string, TaskEntity>,
  executionLinkages: readonly PlanArtifactExecutionLinkage[]
): DashboardPlanArtifactWbsRow[] {
  if (rows.length === 0) {
    return rows;
  }
  const linkageTaskIdByWbsId = new Map<string, string>();
  for (const linkage of executionLinkages) {
    const wbsId = typeof linkage.wbsId === "string" ? linkage.wbsId.trim() : "";
    const taskId = linkage.taskId.trim();
    if (wbsId.length > 0 && taskId.length > 0) {
      linkageTaskIdByWbsId.set(wbsId, taskId);
    }
  }
  return rows.map((row, index) => {
    const wbsId = wbsItems[index]?.wbsId.trim() || row.wbsId.trim();
    let linkedTask =
      wbsId.length > 0 ? wbsIdToTask.get(wbsId) : undefined;
    if (!linkedTask && wbsId.length > 0) {
      const linkageTaskId = linkageTaskIdByWbsId.get(wbsId);
      if (linkageTaskId) {
        linkedTask = taskById.get(linkageTaskId);
      }
    }
    if (!linkedTask) {
      return row;
    }
    return {
      ...row,
      linkedTaskId: linkedTask.id,
      linkedTaskStatus: humanizeDashboardTaskStatus(linkedTask.status)
    };
  });
}

function buildDashboardPlanArtifactExecutionLinkageRows(
  executionLinkages: readonly PlanArtifactExecutionLinkage[],
  linkedTasks: readonly TaskEntity[],
  wbsItems: readonly PlanArtifactWbsItem[],
  wbsIdToTask: Map<string, TaskEntity>
): DashboardPlanArtifactExecutionLinkageRow[] {
  const taskById = new Map(linkedTasks.map((task) => [task.id, task]));
  if (executionLinkages.length > 0) {
    return executionLinkages
      .map((linkage) => {
        const taskId = linkage.taskId.trim();
        if (taskId.length === 0) {
          return null;
        }
        const task = taskById.get(taskId);
        const wbsId = typeof linkage.wbsId === "string" ? linkage.wbsId.trim() : "";
        return {
          taskId,
          wbsId: wbsId.length > 0 ? wbsId : "—",
          taskStatus: task ? humanizeDashboardTaskStatus(task.status) : "—",
          linkedAt: formatDashboardLinkageTimestamp(linkage.linkedAt),
          linkedBy: linkage.linkedBy.trim() || "—"
        };
      })
      .filter((row): row is DashboardPlanArtifactExecutionLinkageRow => row !== null);
  }
  if (linkedTasks.length === 0) {
    return [];
  }
  const rows: DashboardPlanArtifactExecutionLinkageRow[] = [];
  for (const wbsItem of wbsItems) {
    const wbsId = wbsItem.wbsId.trim();
    if (wbsId.length === 0) {
      continue;
    }
    const task = wbsIdToTask.get(wbsId);
    if (!task) {
      continue;
    }
    rows.push({
      taskId: task.id,
      wbsId,
      taskStatus: humanizeDashboardTaskStatus(task.status),
      linkedAt: formatDashboardLinkageTimestamp(task.createdAt),
      linkedBy: "finalize"
    });
  }
  return rows;
}

function buildDashboardPlanArtifactApprovalSummary(
  approvalRecord: PlanArtifactApprovalRecord | undefined
): DashboardPlanArtifactApprovalSummary | null {
  if (!approvalRecord || typeof approvalRecord !== "object") {
    return null;
  }
  if (approvalRecord.confirmed !== true) {
    return null;
  }
  const approvedVersion = approvalRecord.approvedVersion;
  const approvedAt = formatDashboardLinkageTimestamp(approvalRecord.approvedAt);
  const approvedBy = approvalRecord.approvedBy.trim();
  if (!Number.isFinite(approvedVersion) || approvedVersion <= 0 || approvedBy.length === 0) {
    return null;
  }
  const reviewSummaryRaw =
    typeof approvalRecord.reviewSummary === "string" ? approvalRecord.reviewSummary.trim() : "";
  const reviewSummary =
    reviewSummaryRaw.length > 0
      ? truncatePlanArtifactWbsText(reviewSummaryRaw, PLAN_ARTIFACT_ARCHITECTURE_OVERVIEW_MAX_LENGTH)
      : "";
  const openQuestionsAcceptedCount = Array.isArray(approvalRecord.openQuestionsAccepted)
    ? approvalRecord.openQuestionsAccepted.filter(
        (value) => typeof value === "string" && value.trim().length > 0
      ).length
    : 0;
  return {
    approvedVersion: Math.floor(approvedVersion),
    approvedAt,
    approvedBy,
    ...(reviewSummary.length > 0 ? { reviewSummary } : {}),
    ...(openQuestionsAcceptedCount > 0 ? { openQuestionsAcceptedCount } : {})
  };
}

function buildDashboardPlanArtifactReviewFindingRows(
  findings: readonly PlanArtifactReviewFindingRecordV1[]
): DashboardPlanArtifactReviewFindingRow[] {
  return findings.map((finding) => {
    const location =
      [finding.path?.trim(), finding.wbsId?.trim()].filter((value) => !!value).join(" · ") || "—";
    return {
      code: finding.code.trim() || "—",
      severity: finding.severity === "blocker" ? "Blocker" : "Warning",
      message: finding.message.trim() || "—",
      location
    };
  });
}

function resolveDashboardPlanArtifactReviewFindingRows(
  latestReview: PlanArtifactReviewRecordV1,
  latestArtifact: PlanArtifactV1 | null
): DashboardPlanArtifactReviewFindingRow[] {
  if (latestReview.findings && latestReview.findings.length > 0) {
    return buildDashboardPlanArtifactReviewFindingRows(latestReview.findings);
  }
  if (latestReview.blockerCount + latestReview.warningCount <= 0 || !latestArtifact) {
    return [];
  }
  const result = reviewPlanArtifact(latestArtifact, { profile: latestReview.profile });
  return buildDashboardPlanArtifactReviewFindingRows(buildPlanArtifactReviewFindingRecords(result));
}

function buildDashboardPlanArtifactPhaseRecommendationRows(
  recommendations: readonly PlanArtifactPhaseRecommendation[]
): DashboardPlanArtifactPhaseRecommendationRow[] {
  if (recommendations.length === 0) {
    return [];
  }
  return recommendations
    .map((recommendation) => {
      const phaseKey = recommendation.phaseKey.trim();
      const label = recommendation.label.trim();
      const rationaleRaw = recommendation.rationale.trim();
      const rationale =
        rationaleRaw.length > PLAN_ARTIFACT_PHASE_RECOMMENDATION_RATIONALE_MAX_LENGTH
          ? rationaleRaw.slice(0, PLAN_ARTIFACT_PHASE_RECOMMENDATION_RATIONALE_MAX_LENGTH - 3).trimEnd() +
            "..."
          : rationaleRaw;
      return {
        phaseKey: phaseKey || "—",
        label: label || phaseKey || "—",
        primary: recommendation.isPrimary === true,
        rationale: rationale.length > 0 ? rationale : "—"
      };
    })
    .filter((row) => row.phaseKey !== "—" || row.label !== "—");
}

function buildDashboardPlanArtifactOpenQuestionRows(
  questions: readonly string[]
): DashboardPlanArtifactOpenQuestionRow[] {
  if (questions.length === 0) {
    return [];
  }
  return questions
    .map((raw, index) => {
      const question = truncatePlanArtifactWbsText(
        raw.trim() || `Open question ${index + 1}`,
        PLAN_ARTIFACT_OPEN_QUESTION_MAX_LENGTH
      );
      return {
        question,
        critical: isCriticalOpenQuestion(raw)
      };
    })
    .filter((row) => row.question.length > 0);
}

function humanizePlanArtifactRiskSeverity(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (raw) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
  }
}

function buildDashboardPlanArtifactRiskRows(
  risks: readonly PlanArtifactRiskItem[]
): DashboardPlanArtifactRiskRow[] {
  if (risks.length === 0) {
    return [];
  }
  return risks.map((risk) => {
    const id = risk.id.trim() || "Risk";
    const description = truncatePlanArtifactWbsText(
      risk.description.trim() || "—",
      PLAN_ARTIFACT_RISK_DESCRIPTION_MAX_LENGTH
    );
    const mitigationRaw = typeof risk.mitigation === "string" ? risk.mitigation.trim() : "";
    const mitigation =
      mitigationRaw.length > 0
        ? truncatePlanArtifactWbsText(mitigationRaw, PLAN_ARTIFACT_RISK_MITIGATION_MAX_LENGTH)
        : "—";
    return {
      id,
      description,
      severity: humanizePlanArtifactRiskSeverity(risk.severity),
      mitigation
    };
  });
}

function humanizeWbsSizingConfidence(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (raw) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
  }
}

function truncatePlanArtifactWbsText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 3).trimEnd() + "...";
}

function buildDashboardPlanArtifactWbsRows(wbs: readonly PlanArtifactWbsItem[]): DashboardPlanArtifactWbsRow[] {
  if (wbs.length === 0) {
    return [];
  }
  const titleById = new Map<string, string>();
  for (const row of wbs) {
    const wbsId = row.wbsId.trim();
    if (wbsId.length === 0) {
      continue;
    }
    const title = row.title.trim() || row.suggestedTaskTitle.trim() || wbsId;
    titleById.set(wbsId, title);
  }
  const blocksById = new Map<string, string[]>();
  for (const row of wbs) {
    const wbsId = row.wbsId.trim();
    for (const dependency of row.dependsOn ?? []) {
      const depId = typeof dependency === "string" ? dependency.trim() : "";
      if (depId.length === 0) {
        continue;
      }
      const list = blocksById.get(depId) ?? [];
      list.push(wbsId.length > 0 ? wbsId : "row");
      blocksById.set(depId, list);
    }
  }
  const formatLinkedTitles = (ids: string[]): string => {
    const labels = ids
      .map((id) => titleById.get(id) ?? id)
      .filter((label) => label.length > 0);
    return labels.length > 0 ? labels.join(", ") : "—";
  };
  return wbs.map((row) => {
    const wbsId = row.wbsId.trim();
    const title = row.title.trim() || row.suggestedTaskTitle.trim() || wbsId || "Work item";
    const descriptionRaw = row.approach.trim() || row.doneMeans.trim() || row.suggestedTaskTitle.trim();
    const description = truncatePlanArtifactWbsText(descriptionRaw, PLAN_ARTIFACT_WBS_DESCRIPTION_MAX_LENGTH);
    const dependsOnIds = (row.dependsOn ?? [])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
    const approachRaw = row.approach.trim();
    const doneMeansRaw = row.doneMeans.trim();
    const testingVerification = joinPlanArtifactDisplayList(
      row.testingVerification ?? [],
      PLAN_ARTIFACT_WBS_EXTRA_FIELD_MAX_LENGTH
    );
    const acceptanceCriteria = joinPlanArtifactDisplayList(
      row.acceptanceCriteria ?? [],
      PLAN_ARTIFACT_WBS_EXTRA_FIELD_MAX_LENGTH
    );
    const approach =
      approachRaw.length > 0
        ? truncatePlanArtifactWbsText(approachRaw, PLAN_ARTIFACT_WBS_EXTRA_FIELD_MAX_LENGTH)
        : "";
    const doneMeans =
      doneMeansRaw.length > 0
        ? truncatePlanArtifactWbsText(doneMeansRaw, PLAN_ARTIFACT_WBS_EXTRA_FIELD_MAX_LENGTH)
        : "";
    return {
      wbsId: wbsId || title,
      title,
      description: description.length > 0 ? description : "—",
      dependsOn: dependsOnIds.length > 0 ? formatLinkedTitles(dependsOnIds) : "—",
      blocks: formatLinkedTitles(blocksById.get(wbsId) ?? []),
      size: humanizeWbsSizingConfidence(row.sizingConfidence),
      ...(approach.length > 0 ? { approach } : {}),
      ...(doneMeans.length > 0 ? { doneMeans } : {}),
      ...(testingVerification.length > 0 ? { testingVerification } : {}),
      ...(acceptanceCriteria.length > 0 ? { acceptanceCriteria } : {})
    };
  });
}

export function buildDashboardPlanArtifactSummary(
  ctx: ModuleLifecycleContext,
  allTasks: readonly TaskEntity[]
): DashboardSummaryData["planArtifact"] {
  const summaries = listPlanArtifactSummaries(
    ctx.workspacePath,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  if (summaries.length === 0) {
    return null;
  }
  const planRefToTasks = buildPlanRefToTasksIndex(allTasks);
  const allTasksById = buildTaskByIdIndex(allTasks);
  const PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH = 160;
  const rows = summaries.slice(0, 20).map((summary) => {
    const ideaPlan = readIdeaPlanArtifact(ctx.workspacePath, summary.planRef);
    const latestArtifact = readLatestPlanArtifact(ctx.workspacePath, summary.planId);
    const version = ideaPlan?.version ?? summary.currentVersion;
    const latestReview =
      summary.latestReview &&
      summary.latestReview.planRef === summary.planRef &&
      summary.latestReview.reviewedVersion === version
        ? summary.latestReview
        : undefined;
    const title =
      ideaPlan?.plan?.title?.trim() ||
      latestArtifact?.identity.title?.trim() ||
      summary.title;
    const updatedAt = ideaPlan?.updatedAt ?? summary.updatedAt;
    const indexStatus = summary.status;
    const status = indexStatus;
    const phaseRecommendations = Array.isArray(latestArtifact?.phaseRecommendations)
      ? latestArtifact.phaseRecommendations
      : [];
    const primaryPhase = phaseRecommendations.find((row) => row?.isPrimary === true) ?? phaseRecommendations[0];
    const phaseRecommendation = primaryPhase
      ? [primaryPhase.label?.trim(), primaryPhase.phaseKey?.trim()].filter((value) => !!value).join(" · ")
      : "";
    const phaseKeyRaw = typeof primaryPhase?.phaseKey === "string" ? primaryPhase.phaseKey.trim() : "";
    const deliveryPhaseKeyRaw =
      typeof ideaPlan?.delivery?.phaseKey === "string" ? ideaPlan.delivery.phaseKey.trim() : "";
    const phaseKey =
      phaseKeyRaw.length > 0 && !isDeferredPlanPhaseRecommendationKey(phaseKeyRaw)
        ? phaseKeyRaw
        : deliveryPhaseKeyRaw;
    const sourceIdeaId =
      ideaPlan?.ideaId ??
      (typeof latestArtifact?.provenance?.sourceIdeaId === "string"
        ? latestArtifact.provenance.sourceIdeaId.trim()
        : "");
    const summaryTextRaw =
      ideaPlan?.plan?.summary?.trim() ||
      (typeof latestArtifact?.identity?.summary === "string" ? latestArtifact.identity.summary.trim() : "");
    const summaryText =
      summaryTextRaw.length > PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH
        ? summaryTextRaw.slice(0, PLAN_ARTIFACT_SUMMARY_TEXT_MAX_LENGTH - 3).trimEnd() + "..."
        : summaryTextRaw;
    const riskCount = Array.isArray(latestArtifact?.riskAssessment) ? latestArtifact.riskAssessment.length : 0;
    const riskPreviewRows = Array.isArray(latestArtifact?.riskAssessment)
      ? buildDashboardPlanArtifactRiskRows(latestArtifact.riskAssessment)
      : [];
    const openQuestionPreviewRows = Array.isArray(latestArtifact?.openQuestions)
      ? buildDashboardPlanArtifactOpenQuestionRows(latestArtifact.openQuestions)
      : [];
    const reviewFindingPreviewRows =
      latestReview && summary.currentVersion === latestReview.reviewedVersion
        ? resolveDashboardPlanArtifactReviewFindingRows(latestReview, latestArtifact)
        : [];
    const phaseRecommendationPreviewRows = phaseRecommendations.length > 0
      ? buildDashboardPlanArtifactPhaseRecommendationRows(phaseRecommendations)
      : [];
    const goalPreviewRows = Array.isArray(latestArtifact?.goals)
      ? buildDashboardPlanArtifactTextRows(latestArtifact.goals)
      : [];
    const nonGoalPreviewRows = Array.isArray(latestArtifact?.nonGoals)
      ? buildDashboardPlanArtifactTextRows(latestArtifact.nonGoals)
      : [];
    const assumptionPreviewRows = Array.isArray(latestArtifact?.assumptions)
      ? buildDashboardPlanArtifactTextRows(latestArtifact.assumptions)
      : [];
    const userStoryPreviewRows = Array.isArray(latestArtifact?.userStories)
      ? buildDashboardPlanArtifactUserStoryRows(latestArtifact.userStories)
      : [];
    const valueAssessmentSummary = buildDashboardPlanArtifactValueAssessmentSummary(
      latestArtifact?.valueAssessment
    );
    const architectureOverviewRaw =
      typeof latestArtifact?.architecture?.overview === "string"
        ? latestArtifact.architecture.overview.trim()
        : "";
    const architectureOverview =
      architectureOverviewRaw.length > PLAN_ARTIFACT_ARCHITECTURE_OVERVIEW_MAX_LENGTH
        ? architectureOverviewRaw
            .slice(0, PLAN_ARTIFACT_ARCHITECTURE_OVERVIEW_MAX_LENGTH - 3)
            .trimEnd() + "..."
        : architectureOverviewRaw;
    const architectureDecisionPreviewRows = Array.isArray(latestArtifact?.architecture?.decisions)
      ? buildDashboardPlanArtifactArchitectureDecisionRows(latestArtifact.architecture.decisions)
      : [];
    const architectureDiagramPreviewRows = Array.isArray(latestArtifact?.architecture?.diagrams)
      ? buildDashboardPlanArtifactArchitectureDiagramRows(latestArtifact.architecture.diagrams)
      : [];
    const technicalImpactSummary = buildDashboardPlanArtifactTechnicalImpactSummary(
      latestArtifact?.technicalImpact
    );
    const testingStrategySummary = buildDashboardPlanArtifactTestingStrategySummary(
      latestArtifact?.testingStrategy
    );
    const implementationGuidancePreviewRows = Array.isArray(latestArtifact?.implementationGuidance)
      ? buildDashboardPlanArtifactTextRows(latestArtifact.implementationGuidance)
      : [];
    const whatNotToDoPreviewRows = Array.isArray(latestArtifact?.whatNotToDo)
      ? buildDashboardPlanArtifactTextRows(latestArtifact.whatNotToDo)
      : [];
    const uiUxSummary = buildDashboardPlanArtifactUiUxSummary(latestArtifact?.uiUxDirection);
    const wbsPreviewRows = Array.isArray(latestArtifact?.wbs)
      ? buildDashboardPlanArtifactWbsRows(latestArtifact.wbs)
      : [];
    const linkedTasks = resolvePlanArtifactLinkedTasks(
      planRefToTasks.get(summary.planRef) ?? [],
      ideaPlan?.delivery?.taskRefs,
      allTasksById
    );
    const wbsIdToTask = buildWbsIdToLinkedTaskIndex(linkedTasks);
    const taskById = new Map(linkedTasks.map((task) => [task.id, task]));
    const executionLinkages = Array.isArray(latestArtifact?.executionLinkages)
      ? latestArtifact.executionLinkages
      : [];
    const wbsItems = Array.isArray(latestArtifact?.wbs) ? latestArtifact.wbs : [];
    const wbsRowsWithLinkedTasks =
      wbsPreviewRows.length > 0
        ? enrichDashboardPlanArtifactWbsRowsWithLinkedTasks(
            wbsPreviewRows,
            wbsItems,
            wbsIdToTask,
            taskById,
            executionLinkages
          )
        : [];
    const linkedTaskCount = wbsRowsWithLinkedTasks.filter(
      (row) => typeof row.linkedTaskId === "string" && row.linkedTaskId.trim().length > 0
    ).length;
    const executionLinkagePreviewRows = buildDashboardPlanArtifactExecutionLinkageRows(
      executionLinkages,
      linkedTasks,
      wbsItems,
      wbsIdToTask
    );
    const approvalSummary = buildDashboardPlanArtifactApprovalSummary(latestArtifact?.approvalRecord);
    let tasksGenerated = linkedTasks.length > 0;
    // Cancelled tasks don't block "executed"; only count them if that's all there is (avoids reporting
    // "executed" for a plan whose entire WBS was cancelled rather than delivered).
    const nonCancelledTasks = linkedTasks.filter((task) => task.status !== "cancelled");
    const deliveryConsideredTasks = nonCancelledTasks.length > 0 ? nonCancelledTasks : linkedTasks;
    let executed =
      tasksGenerated &&
      deliveryConsideredTasks.length > 0 &&
      deliveryConsideredTasks.every((task) => task.status === "completed");
    if (ideaPlan?.status === "delivered") {
      tasksGenerated = true;
      executed = true;
    }
    const blockerCount = latestReview?.blockerCount ?? 0;
    const warningCount = latestReview?.warningCount ?? 0;
    const lifecycleStatus =
      summary.status === "reviewed"
        ? blockerCount > 0 || latestReview?.passed === false
          ? "needs_revision"
          : "approval_ready"
        : summary.status;
    return {
      planId: summary.planId,
      planRef: summary.planRef,
      version,
      status,
      lifecycleStatus,
      title,
      planningType: ideaPlan?.plan?.planningType ?? summary.planningType,
      updatedAt,
      wbsRowCount: summary.wbsRowCount,
      openQuestionCount: summary.openQuestionCount,
      blockerCount,
      warningCount,
      ...(summaryText.length > 0 ? { summary: summaryText } : {}),
      ...(riskCount > 0 ? { riskCount } : {}),
      ...(latestReview?.profile ? { profile: latestReview.profile } : {}),
      ...(latestReview?.reviewSummary ? { reviewSummary: latestReview.reviewSummary } : {}),
      ...(phaseRecommendation.length > 0 ? { phaseRecommendation } : {}),
      ...(phaseKey.length > 0 ? { phaseKey } : {}),
      ...(sourceIdeaId.length > 0 ? { sourceIdeaId } : {}),
      tasksGenerated,
      executed,
      ...(wbsPreviewRows.length > 0 ? { wbsRows: wbsRowsWithLinkedTasks } : {}),
      ...(riskPreviewRows.length > 0 ? { riskRows: riskPreviewRows } : {}),
      ...(openQuestionPreviewRows.length > 0 ? { openQuestionRows: openQuestionPreviewRows } : {}),
      ...(reviewFindingPreviewRows.length > 0 ? { reviewFindingRows: reviewFindingPreviewRows } : {}),
      ...(phaseRecommendationPreviewRows.length > 0
        ? { phaseRecommendationRows: phaseRecommendationPreviewRows }
        : {}),
      ...(goalPreviewRows.length > 0 ? { goalRows: goalPreviewRows } : {}),
      ...(nonGoalPreviewRows.length > 0 ? { nonGoalRows: nonGoalPreviewRows } : {}),
      ...(assumptionPreviewRows.length > 0 ? { assumptionRows: assumptionPreviewRows } : {}),
      ...(userStoryPreviewRows.length > 0 ? { userStoryRows: userStoryPreviewRows } : {}),
      ...(valueAssessmentSummary ? { valueAssessment: valueAssessmentSummary } : {}),
      ...(architectureOverview.length > 0 ? { architectureOverview } : {}),
      ...(architectureDecisionPreviewRows.length > 0
        ? { architectureDecisionRows: architectureDecisionPreviewRows }
        : {}),
      ...(architectureDiagramPreviewRows.length > 0
        ? { architectureDiagramRows: architectureDiagramPreviewRows }
        : {}),
      ...(technicalImpactSummary ? { technicalImpact: technicalImpactSummary } : {}),
      ...(testingStrategySummary ? { testingStrategy: testingStrategySummary } : {}),
      ...(implementationGuidancePreviewRows.length > 0
        ? { implementationGuidanceRows: implementationGuidancePreviewRows }
        : {}),
      ...(whatNotToDoPreviewRows.length > 0 ? { whatNotToDoRows: whatNotToDoPreviewRows } : {}),
      ...(uiUxSummary ? { uiUxSummary } : {}),
      ...(approvalSummary ? { approvalSummary } : {}),
      ...(executionLinkagePreviewRows.length > 0
        ? { executionLinkageRows: executionLinkagePreviewRows }
        : {}),
      ...(linkedTaskCount > 0 ? { linkedTaskCount } : {})
    };
  });
  return {
    schemaVersion: 1,
    count: summaries.length,
    current: rows[0]!,
    recent: rows
  };
}

const emptyDependencyOverviewStub = (activeTaskCount: number): DashboardSummaryData["dependencyOverview"] => ({
  schemaVersion: 1 as const,
  activeTaskCount,
  includedTaskCount: 0,
  edgeCount: 0,
  truncated: false,
  perfNote: "overview projection",
  nodes: [],
  edges: [],
  mermaidFlowchart: "",
  criticalPathReady: []
});

export type DashboardBuildBase = {
  projection: DashboardSummaryProjection;
  needsQueueRollups: boolean;
  needsStatusRollups: boolean;
  planningGeneration: number;
  commandArgs?: Record<string, unknown>;
  data: DashboardSummaryData;
};

/** Shared dashboard build with projection-aware guards before assembly. */
export async function buildDashboardBase(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardBuildBase> {
  const projection = parseDashboardSummaryProjection(commandArgs);
  if (tracer) {
    tracer.projection = projection;
  }
  const needsQueueRollups = dashboardSummaryNeedsQueueRollups(projection);
  const needsStatusRollups = dashboardSummaryNeedsStatusRollups(projection);
  const needsAgentActivityRollups = dashboardSummaryNeedsAgentActivityRollups(projection);
  const includeWishlist = parseDashboardIncludeWishlist(
    commandArgs,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const skipPlanningSessionRead = projection === "overview" || projection === "agentActivity";
  const skipAgentGuidanceBuild = projection === "queue" || projection === "agentActivity";

  const allTasks = tracer?.span("getActiveTasks", () => store.getActiveTasks()) ?? store.getActiveTasks();
  const { dualForStatus, workspaceStatus } =
    tracer?.span("readWorkspaceStatus", () => {
      const dual = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
      return {
        dualForStatus: dual,
        workspaceStatus: readWorkspaceStatusSnapshotFromDual(dual)
      };
    }) ?? (() => {
      const dual = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
      return {
        dualForStatus: dual,
        workspaceStatus: readWorkspaceStatusSnapshotFromDual(dual)
      };
    })();

  const currentPhase = workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase).trim() : "";
  const activeNonTerminal = allTasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const neededCompletedIds = new Set<string>();
  for (const t of activeNonTerminal) {
    if (t.dependsOn) {
      for (const depId of t.dependsOn) {
        neededCompletedIds.add(depId);
      }
    }
  }

  const tasks = allTasks.filter(t => {
    // 1. Active non-terminal tasks
    if (t.status !== "completed" && t.status !== "cancelled") {
      return true;
    }
    // 2. Terminal tasks in the current phase
    const taskPhase = t.phaseKey != null ? String(t.phaseKey).trim() : "";
    if (currentPhase !== "" && taskPhase === currentPhase) {
      return true;
    }
    // 3. Completed tasks that are dependencies of active non-terminal tasks
    if (t.status === "completed" && neededCompletedIds.has(t.id)) {
      return true;
    }
    return false;
  });
  const suggestion = tracer?.span("getNextActions", () =>
    getNextActions(tasks, {
      workspacePhaseFocus: {
        currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
        nextKitPhase: workspaceStatus?.nextKitPhase ?? null
      }
    })
  ) ?? getNextActions(tasks, {
    workspacePhaseFocus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    }
  });
  const readyQueue = suggestion.readyQueue;
  const readyImprovementCount = readyQueue.filter(isImprovementLikeTask).length;
  const readyImprovements = readyQueue.filter(isImprovementLikeTask);
  const readyExecution = readyQueue.filter((t) => !isImprovementLikeTask(t));
  const enrich = tracer?.span("buildFeatureEnrichmentBySlug", () =>
    sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map()
  ) ?? (sqliteDual ? buildFeatureEnrichmentBySlug(sqliteDual.getDatabase()) : new Map());
  const toReadyRow = (t: (typeof readyQueue)[0]) => projectDashboardTaskRow(t, enrich);
  const readyTop = needsQueueRollups ? readyQueue.slice(0, 15).map(toReadyRow) : [];
  const readyImprovementsTop = needsQueueRollups ? readyImprovements.slice(0, 15).map(toReadyRow) : [];
  const readyExecutionTop = needsQueueRollups ? readyExecution.slice(0, 15).map(toReadyRow) : [];

  let wishlistOpenCount = 0;
  let wishlistItemsLength = 0;
  let wishlistSafePage = 0;
  let wishlistPageSize = 10;
  let wishlistTotalPages = 0;
  let wishlistOpenTop: DashboardSummaryData["wishlist"]["openTop"] = [];
  let ideas = buildDashboardIdeasSummary(ctx, undefined, false);
  let brainstormingIdeas = buildDashboardBrainstormingIdeasRollup(ctx, undefined, false);

  const buildWishlistAndIdeas = () => {
    if (needsQueueRollups && includeWishlist) {
      const allTasks = store.getAllTasks();
      const wishlistItems = listWishlistIntakeTasksAsItems(allTasks);
      const wishlistOpenItems = wishlistItems.filter((i) => i.status === "open");
      wishlistOpenCount = wishlistOpenItems.length;
      wishlistItemsLength = wishlistItems.length;
      const { page: wishlistPageReq, pageSize } = parseDashboardWishlistPaging(commandArgs);
      wishlistPageSize = pageSize;
      wishlistTotalPages = wishlistOpenCount === 0 ? 0 : Math.ceil(wishlistOpenCount / wishlistPageSize);
      wishlistSafePage = wishlistTotalPages === 0 ? 0 : Math.min(wishlistPageReq, wishlistTotalPages - 1);
      const wishlistSliceStart = wishlistSafePage * wishlistPageSize;
      wishlistOpenTop = wishlistOpenItems.slice(wishlistSliceStart, wishlistSliceStart + wishlistPageSize).map((i) => {
        const task = findWishlistIntakeTaskByLegacyOrTaskId(allTasks, i.id);
        const taskId = task?.id ?? i.id;
        return {
          id: i.id,
          title: i.title,
          taskId
        };
      });
    }
    ideas = buildDashboardIdeasSummary(ctx, sqliteDual, needsQueueRollups);
    brainstormingIdeas = buildDashboardBrainstormingIdeasRollup(ctx, sqliteDual, needsQueueRollups);
  };
  if (tracer) {
    tracer.span("wishlist/ideas", buildWishlistAndIdeas);
  } else {
    buildWishlistAndIdeas();
  }

  const slimListRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const blockedTasks = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "blocked" && !isWishlistIntakeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const blockedTop = needsQueueRollups ? blockedTasks.slice(0, 15).map(slimListRow) : [];
  const proposedImprovements = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "proposed" && isImprovementLikeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const proposedImprovementsTop = needsQueueRollups ? proposedImprovements.slice(0, 15).map(slimListRow) : [];

  const proposedExecution = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "proposed" && !isImprovementLikeTask(t) && !isWishlistIntakeTask(t))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const proposedExecutionTop = needsQueueRollups ? proposedExecution.slice(0, 15).map(slimListRow) : [];

  const planningSession = await (tracer?.spanAsync("planningSession", async () =>
    skipPlanningSessionRead
      ? null
      : toDashboardPlanningSession(
          await readBuildPlanSession(
            ctx.workspacePath,
            ctx.effectiveConfig as Record<string, unknown> | undefined
          )
        )
  ) ?? (skipPlanningSessionRead
    ? Promise.resolve(null)
    : readBuildPlanSession(
        ctx.workspacePath,
        ctx.effectiveConfig as Record<string, unknown> | undefined
      ).then(toDashboardPlanningSession)));
  const planArtifact =
    tracer?.span("planArtifact", () => buildDashboardPlanArtifactSummary(ctx, allTasks)) ??
    buildDashboardPlanArtifactSummary(ctx, allTasks);

  const dashboardPhaseTop = 15;
  const toProposedRow = (t: (typeof tasks)[0]) => projectDashboardTaskRow(t, enrich, { includePriority: false });
  const {
    readyImprovementsPhaseBuckets,
    readyExecutionPhaseBuckets,
    proposedImprovementsPhaseBuckets,
    proposedExecutionPhaseBuckets
  } = tracer?.span("phaseBuckets", () => ({
    readyImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyImprovements,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    readyExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyExecution,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    proposedImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedImprovements,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : [],
    proposedExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedExecution,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : []
  })) ?? {
    readyImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyImprovements,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    readyExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          readyExecution,
          workspaceStatus,
          toReadyRow,
          dashboardPhaseTop
        )
      : [],
    proposedImprovementsPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedImprovements,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : [],
    proposedExecutionPhaseBuckets: needsQueueRollups
      ? buildDashboardPhaseBucketsForTasks(
          proposedExecution,
          workspaceStatus,
          toProposedRow,
          dashboardPhaseTop,
          { includeAllTaskIds: true }
        )
      : []
  };

  const transcriptChurnResearch = needsQueueRollups
    ? tasks
        .filter((t) => t.status === "research" && t.type === TRANSCRIPT_CHURN_TASK_TYPE)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const transcriptChurnResearchTop = needsQueueRollups ? transcriptChurnResearch.slice(0, 15).map(slimListRow) : [];
  const transcriptChurnResearchPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        transcriptChurnResearch,
        workspaceStatus,
        toProposedRow,
        dashboardPhaseTop
      )
    : [];

  const blockedPhaseBuckets = needsQueueRollups
    ? buildDashboardPhaseBucketsForTasks(
        blockedTasks,
        workspaceStatus,
        slimListRow,
        dashboardPhaseTop,
        { includeAllTaskIds: true }
      )
    : [];

  const completedCount = getTerminalCount("completed", allTasks, sqliteDual);
  const cancelledCount = getTerminalCount("cancelled", allTasks, sqliteDual);

  const dependencyOverview = tracer?.span("dependencyOverview", () =>
    needsQueueRollups
      ? buildDashboardDependencyOverview(tasks)
      : emptyDependencyOverviewStub(tasks.length)
  ) ?? (needsQueueRollups
    ? buildDashboardDependencyOverview(tasks)
    : emptyDependencyOverviewStub(tasks.length));

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  let agentGuidance: DashboardSummaryData["agentGuidance"] = null;
  await (tracer?.spanAsync("agentGuidance/behavior", async () => {
    if (!skipAgentGuidanceBuild) {
      const guidanceResolved = resolveAgentGuidanceFromEffectiveConfig(effCfg);
      const behaviorState = await loadBehaviorWorkspaceState(ctx);
      const behaviorStore = new BehaviorProfileStore(behaviorState);
      const { effective: behaviorEffective } = behaviorStore.resolveEffectiveWithProvenance();
      const agentPresentation = resolveAgentPresentationPolicy({
        effectiveConfig: effCfg,
        guidance: guidanceResolved,
        behaviorProfile: {
          id: behaviorEffective.id,
          label: behaviorEffective.label,
          dimensions: behaviorEffective.dimensions
        }
      });
      agentGuidance = {
        schemaVersion: 1 as const,
        profileSetId: guidanceResolved.profileSetId,
        tier: guidanceResolved.tier,
        displayLabel: guidanceResolved.displayLabel,
        usingDefaultTier: guidanceResolved.usingDefaultTier,
        temperamentProfileId: behaviorEffective.id,
        temperamentLabel: dashboardOnboardingTemperamentLabel(behaviorEffective),
        agentPresentation
      };
    }
  }) ?? (async () => {
    if (!skipAgentGuidanceBuild) {
      const guidanceResolved = resolveAgentGuidanceFromEffectiveConfig(effCfg);
      const behaviorState = await loadBehaviorWorkspaceState(ctx);
      const behaviorStore = new BehaviorProfileStore(behaviorState);
      const { effective: behaviorEffective } = behaviorStore.resolveEffectiveWithProvenance();
      const agentPresentation = resolveAgentPresentationPolicy({
        effectiveConfig: effCfg,
        guidance: guidanceResolved,
        behaviorProfile: {
          id: behaviorEffective.id,
          label: behaviorEffective.label,
          dimensions: behaviorEffective.dimensions
        }
      });
      agentGuidance = {
        schemaVersion: 1 as const,
        profileSetId: guidanceResolved.profileSetId,
        tier: guidanceResolved.tier,
        displayLabel: guidanceResolved.displayLabel,
        usingDefaultTier: guidanceResolved.usingDefaultTier,
        temperamentProfileId: behaviorEffective.id,
        temperamentLabel: dashboardOnboardingTemperamentLabel(behaviorEffective),
        agentPresentation
      };
    }
  })());

  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title] as const));
  const teamExecutionEmpty: DashboardTeamExecutionSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };
  const teamExecution = tracer?.span("teamExecution", () =>
    sqliteDual
      ? summarizeTeamAssignmentsForDashboard(sqliteDual.getDatabase(), (id) => taskTitleById.get(id) ?? null)
      : teamExecutionEmpty
  ) ?? (sqliteDual
    ? summarizeTeamAssignmentsForDashboard(sqliteDual.getDatabase(), (id) => taskTitleById.get(id) ?? null)
    : teamExecutionEmpty);

  const subagentRegistryEmpty: DashboardSubagentRegistrySummary = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    topOpenSessions: []
  };
  const subagentRegistry: DashboardSubagentRegistrySummary = tracer?.span("subagentRegistry", () =>
    sqliteDual
      ? (summarizeSubagentsForDashboard(sqliteDual.getDatabase()) as DashboardSubagentRegistrySummary)
      : subagentRegistryEmpty
  ) ?? (sqliteDual
    ? (summarizeSubagentsForDashboard(sqliteDual.getDatabase()) as DashboardSubagentRegistrySummary)
    : subagentRegistryEmpty);
  const agentRegistrySessions = tracer?.span("agentRegistrySessions", () =>
    sqliteDual
      ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
      : summarizeAgentRegistrySessions(undefined, "")
  ) ?? (sqliteDual
    ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
    : summarizeAgentRegistrySessions(undefined, ""));

  const taskCheckpointsEmpty: DashboardTaskCheckpointsSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    topRecent: []
  };
  const taskCheckpoints: DashboardTaskCheckpointsSummary = tracer?.span("checkpoints", () =>
    sqliteDual
      ? (summarizeCheckpointsForDashboard(sqliteDual.getDatabase()) as DashboardTaskCheckpointsSummary)
      : taskCheckpointsEmpty
  ) ?? (sqliteDual
    ? (summarizeCheckpointsForDashboard(sqliteDual.getDatabase()) as DashboardTaskCheckpointsSummary)
    : taskCheckpointsEmpty);

  const useLightweightStatus =
    projection === "overview" || projection === "queue" || projection === "agentActivity";
  const systemStatus = await (tracer?.spanAsync("systemStatus", () => {
    if (useLightweightStatus) {
      return buildDashboardSystemStatusOverview(ctx, store, dualForStatus);
    }
    return buildDashboardSystemStatus(ctx, store, dualForStatus);
  }) ?? (useLightweightStatus
    ? buildDashboardSystemStatusOverview(ctx, store, dualForStatus)
    : buildDashboardSystemStatus(ctx, store, dualForStatus)));
  const taskStateProjection = await (tracer?.spanAsync("taskStateProjection", () => {
    if (useLightweightStatus) {
      return buildDashboardTaskStateProjectionOverview(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      );
    }
    return buildDashboardTaskStateProjectionSummary(
      ctx,
      sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
    );
  }) ?? (useLightweightStatus
    ? buildDashboardTaskStateProjectionOverview(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      )
    : buildDashboardTaskStateProjectionSummary(
        ctx,
        sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
      )));
  const { agentStatus, agentActivitySummary } = tracer?.span("agentStatus", () => {
    const derived = buildDashboardAgentStatus({
      now: systemStatus.generatedAt,
      tasks,
      planningSession,
      suggestion,
      teamExecution,
      subagentRegistry,
      systemStatus
    });
    const liveActivity = sqliteDual
      ? readCurrentAgentActivityLease(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : null;
    const liveLeases = sqliteDual
      ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : [];
    const status = liveActivity
      ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
      : derived;
    const activitySummary = needsAgentActivityRollups
      ? buildDashboardAgentActivitySummary({
          now: systemStatus.generatedAt,
          tasks,
          liveActivityLeases: liveLeases,
          derivedAgentStatus: derived,
          teamExecution,
          subagentRegistry,
          agentRegistrySessions
        })
      : null;
    return {
      derivedAgentStatus: derived,
      liveActivityLeases: liveLeases,
      agentStatus: status,
      agentActivitySummary: activitySummary
    };
  }) ?? (() => {
    const derived = buildDashboardAgentStatus({
      now: systemStatus.generatedAt,
      tasks,
      planningSession,
      suggestion,
      teamExecution,
      subagentRegistry,
      systemStatus
    });
    const liveActivity = sqliteDual
      ? readCurrentAgentActivityLease(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : null;
    const liveLeases = sqliteDual
      ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
      : [];
    const status = liveActivity
      ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
      : derived;
    const activitySummary = needsAgentActivityRollups
      ? buildDashboardAgentActivitySummary({
          now: systemStatus.generatedAt,
          tasks,
          liveActivityLeases: liveLeases,
          derivedAgentStatus: derived,
          teamExecution,
          subagentRegistry,
          agentRegistrySessions
        })
      : null;
    return {
      derivedAgentStatus: derived,
      liveActivityLeases: liveLeases,
      agentStatus: status,
      agentActivitySummary: activitySummary
    };
  })();

  const wsForDelivery =
    workspaceStatus && typeof workspaceStatus === "object"
      ? (workspaceStatus as { currentKitPhase?: string | null; nextKitPhase?: string | null })
      : null;
  const currentPhaseDelivery = tracer?.span("currentPhaseDelivery", () =>
    buildDashboardCurrentPhaseDelivery({
      tasks,
      workspaceStatus: wsForDelivery,
      db: dualForStatus?.getDatabase() ?? null,
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    })
  ) ?? buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: wsForDelivery,
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const { deliveredPhaseKeys, rolledOutPhaseKeys, phaseReleaseDates, phaseDeliveryHistory } =
    tracer?.span("phaseDeliveryHistory", () => ({
      deliveredPhaseKeys:
        dualForStatus != null
          ? collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks)
          : [],
      rolledOutPhaseKeys:
        dualForStatus != null ? collectRolledOutPhaseKeys(dualForStatus.getDatabase()) : [],
      phaseReleaseDates:
        dualForStatus != null ? collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()) : {},
      phaseDeliveryHistory:
        dualForStatus != null ? collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase()) : []
    })) ?? {
      deliveredPhaseKeys:
        dualForStatus != null
          ? collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks)
          : [],
      rolledOutPhaseKeys:
        dualForStatus != null ? collectRolledOutPhaseKeys(dualForStatus.getDatabase()) : [],
      phaseReleaseDates:
        dualForStatus != null ? collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()) : {},
      phaseDeliveryHistory:
        dualForStatus != null ? collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase()) : []
    };
  const lastDeliveredPhase = phaseDeliveryHistory.find((row) => row.status === "delivered") ?? null;
  const legacyDeliveredMaxOrdinal = resolveLegacyDeliveredMaxOrdinal(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const phaseKeysWithActiveQueueWork = collectPhaseKeysWithActiveQueueWork(tasks);

  const phaseCatalogPhases =
    systemStatus.phase?.phaseCatalog?.phases ?? [];
  const pastPhaseNotes = dashboardSummaryNeedsPastPhaseNotes(projection)
    ? buildDashboardPastPhaseNotes({
        db: dualForStatus?.getDatabase() ?? null,
        phaseCatalogPhases,
        currentKitPhase: systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null
      })
    : [];

  const currentKitPhase =
    systemStatus.phase?.currentKitPhase ?? workspaceStatus?.currentKitPhase ?? null;
  const humanGatesSummary = tracer?.span("humanGates", () =>
    buildDashboardHumanGatesSummary(
      tasks,
      typeof currentKitPhase === "string" ? currentKitPhase : null,
      enrich
    )
  ) ?? buildDashboardHumanGatesSummary(
    tasks,
    typeof currentKitPhase === "string" ? currentKitPhase : null,
    enrich
  );
  const approvalQueue =
    tracer?.span("approvalQueue", () => buildDashboardApprovalQueueSummary(tasks))
    ?? buildDashboardApprovalQueueSummary(tasks);

  const phaseJournalStats = tracer?.span("phaseJournalStats", () =>
    dashboardSummaryNeedsPhaseJournalStats(projection)
      ? buildDashboardPhaseJournalStats({
          db: dualForStatus?.getDatabase() ?? null,
          currentKitPhase: typeof currentKitPhase === "string" ? currentKitPhase : null,
          completedDeliveryTaskCount: currentPhaseDelivery.segments.completed
        })
      : {
          schemaVersion: 1 as const,
          available: false,
          phases: [],
          currentPhase: {
            phaseKey: null,
            activeNoteCount: 0,
            completedDeliveryTaskCount: currentPhaseDelivery.segments.completed,
            silenceWarning: false
          }
        }
  ) ?? (dashboardSummaryNeedsPhaseJournalStats(projection)
    ? buildDashboardPhaseJournalStats({
        db: dualForStatus?.getDatabase() ?? null,
        currentKitPhase: typeof currentKitPhase === "string" ? currentKitPhase : null,
        completedDeliveryTaskCount: currentPhaseDelivery.segments.completed
      })
    : {
        schemaVersion: 1 as const,
        available: false,
        phases: [],
        currentPhase: {
          phaseKey: null,
          activeNoteCount: 0,
          completedDeliveryTaskCount: currentPhaseDelivery.segments.completed,
          silenceWarning: false
        }
      });

  const includePhaseFocus =
    commandArgs?.includePhaseFocus === true || commandArgs?.includePhaseFocus === "true";
  const phaseFocusPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : undefined;
  const includePhaseKickoff =
    commandArgs?.includePhaseKickoff === true || commandArgs?.includePhaseKickoff === "true";
  const phaseKickoffPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : parseKitPhaseNumberFromYaml(workspaceStatus?.currentKitPhase ?? null);

  let phaseKickoff: DashboardPhaseKickoffSummary | null = null;
  if (includePhaseKickoff && sqliteDual && phaseKickoffPhaseKey) {
    phaseKickoff = await buildDashboardPhaseKickoffSlice(
      ctx,
      { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
      phaseKickoffPhaseKey,
      { includeValidationPlans: commandArgs?.includeKickoffValidationPlans === true }
    );
  }

  const data = {
    schemaVersion: 7 as const,
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession,
    planArtifact,
    stateSummary: suggestion.stateSummary,
    transcriptChurnResearchSummary: {
      schemaVersion: 1 as const,
      count: transcriptChurnResearch.length,
      top: transcriptChurnResearchTop,
      phaseBuckets: transcriptChurnResearchPhaseBuckets
    },
    proposedImprovementsSummary: {
      schemaVersion: 1 as const,
      count: proposedImprovements.length,
      top: proposedImprovementsTop,
      phaseBuckets: proposedImprovementsPhaseBuckets
    },
    proposedExecutionSummary: {
      schemaVersion: 1 as const,
      count: proposedExecution.length,
      top: proposedExecutionTop,
      phaseBuckets: proposedExecutionPhaseBuckets
    },
    readyImprovementsSummary: {
      schemaVersion: 1 as const,
      count: readyImprovements.length,
      top: readyImprovementsTop,
      phaseBuckets: readyImprovementsPhaseBuckets
    },
    readyExecutionSummary: {
      schemaVersion: 1 as const,
      count: readyExecution.length,
      top: readyExecutionTop,
      phaseBuckets: readyExecutionPhaseBuckets
    },
    readyQueueTop: readyTop,
    readyQueueCount: readyQueue.length,
    readyQueueBreakdown: {
      schemaVersion: 1 as const,
      improvement: readyImprovementCount,
      other: readyQueue.length - readyImprovementCount
    },
    executionPlanningScope: "tasks-only" as const,
    wishlist: {
      schemaVersion: 1 as const,
      enabled: includeWishlist,
      openCount: wishlistOpenCount,
      totalCount: wishlistItemsLength,
      openPage: wishlistSafePage,
      openPageSize: wishlistPageSize,
      openTotalPages: wishlistTotalPages,
      openTop: wishlistOpenTop
    },
    ideas,
    brainstormingIdeas,
    blockedSummary: {
      count: blockedTasks.length,
      top: blockedTop,
      phaseBuckets: blockedPhaseBuckets
    },
    humanGatesSummary,
    approvalQueue,
    phaseJournalStats,
    completedSummary: {
      schemaVersion: 1 as const,
      count: completedCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: cancelledCount,
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    suggestedNext: suggestion.suggestedNext
      ? {
          ...projectDashboardTaskRow(suggestion.suggestedNext, enrich),
          id: suggestion.suggestedNext.id,
          status: suggestion.suggestedNext.status,
          title: suggestion.suggestedNext.title,
          type: suggestion.suggestedNext.type
        }
      : null,
    dependencyOverview,
    blockingAnalysis: suggestion.blockingAnalysis,
    agentGuidance,
    teamExecution,
    subagentRegistry,
    agentRegistrySessions,
    taskCheckpoints,
    systemStatus,
    taskStateProjection,
    agentStatus,
    ...(agentActivitySummary ? { agentActivitySummary } : {}),
    currentPhaseDelivery,
    deliveredPhaseKeys,
    rolledOutPhaseKeys,
    phaseReleaseDates,
    phaseDeliveryHistory,
    lastDeliveredPhase,
    legacyDeliveredMaxOrdinal,
    phaseKeysWithActiveQueueWork,
    pastPhaseNotes,
    ...(includePhaseFocus && sqliteDual
      ? {
          phaseFocus: buildPhaseFocusDashboard({
            ctx,
            planning: { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
            phaseKey: phaseFocusPhaseKey
          })
        }
      : {}),
    ...(phaseKickoff ? { phaseKickoff } : {})
  } satisfies DashboardSummaryData;

  return {
    projection,
    needsQueueRollups,
    needsStatusRollups,
    planningGeneration,
    commandArgs,
    data
  };
}

/** Dedicated lightweight builder for the overview dashboard startup projection. */
export async function buildDashboardOverview(
  ctx: ModuleLifecycleContext,
  store: TaskStore,
  planningGeneration: number,
  sqliteDual: SqliteDualPlanningStore | undefined,
  commandArgs?: Record<string, unknown>,
  tracer?: DashboardSummaryTracer
): Promise<DashboardSummaryData> {
  const includeWishlist = parseDashboardIncludeWishlist(
    commandArgs,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const tasks = tracer?.span("getActiveTasks", () => store.getActiveTasks()) ?? store.getActiveTasks();
  const dualForStatus = sqliteDual ?? openSqliteDualForWorkspaceStatus(ctx);
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(dualForStatus);

  const suggestion = tracer?.span("getNextActions", () =>
    getNextActions(tasks, {
      workspacePhaseFocus: {
        currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
        nextKitPhase: workspaceStatus?.nextKitPhase ?? null
      }
    })
  ) ?? getNextActions(tasks, {
    workspacePhaseFocus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    }
  });

  const systemStatus = await (tracer?.spanAsync("systemStatus", () =>
    buildDashboardSystemStatusOverview(ctx, store, dualForStatus)
  ) ?? buildDashboardSystemStatusOverview(ctx, store, dualForStatus));

  const taskStateProjection = await (tracer?.spanAsync("taskStateProjection", () =>
    buildDashboardTaskStateProjectionOverview(
      ctx,
      sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
    )
  ) ?? buildDashboardTaskStateProjectionOverview(
    ctx,
    sqliteDual?.getDatabase() ?? dualForStatus?.getDatabase()
  ));

  const liveActivity = sqliteDual
    ? readCurrentAgentActivityLease(sqliteDual.getDatabase(), systemStatus.generatedAt)
    : null;
  const liveLeases = sqliteDual
    ? listCurrentAgentActivityLeases(sqliteDual.getDatabase(), systemStatus.generatedAt)
    : [];

  const teamExecutionEmpty: DashboardTeamExecutionSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    activeCount: 0,
    byStatus: { assigned: 0, submitted: 0, blocked: 0, reconciled: 0, cancelled: 0 },
    topActive: []
  };

  const subagentRegistryEmpty: DashboardSubagentRegistrySummary = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    topOpenSessions: []
  };

  const agentRegistrySessionsEmpty: DashboardSummaryData["agentRegistrySessions"] = {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    orchestrationReadyDefinitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    activeAssignmentsCount: 0,
    linkedOpenSessionsCount: 0,
    hostAvailability: { cursor: 0, vscode: 0, cli: 0, manual: 0, unknown: 0 },
    capabilityAvailability: { required: [], optional: [] },
    currentPointers: { assignment: 0, task: 0, activity: 0 },
    topOpenSessions: []
  };

  const taskCheckpointsEmpty: DashboardTaskCheckpointsSummary = {
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    topRecent: []
  };

  const agentRegistrySessions = sqliteDual
    ? summarizeAgentRegistrySessions(sqliteDual.getDatabase(), sqliteDual.dbPath)
    : summarizeAgentRegistrySessions(dualForStatus.getDatabase(), dualForStatus.dbPath);

  const derivedAgentStatus = buildDashboardAgentStatus({
    now: systemStatus.generatedAt,
    tasks,
    planningSession: null,
    suggestion,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    systemStatus
  });

  const agentStatus = liveActivity
    ? agentActivityLeaseToDashboardStatus(liveActivity, systemStatus.generatedAt)
    : derivedAgentStatus;

  const agentActivitySummary = buildDashboardAgentActivitySummary({
    now: systemStatus.generatedAt,
    tasks,
    liveActivityLeases: liveLeases,
    derivedAgentStatus,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    agentRegistrySessions
  });

  const currentPhaseDelivery = buildDashboardCurrentPhaseDelivery({
    tasks,
    workspaceStatus: {
      currentKitPhase: workspaceStatus?.currentKitPhase ?? null,
      nextKitPhase: workspaceStatus?.nextKitPhase ?? null
    },
    db: dualForStatus?.getDatabase() ?? null,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });

  const legacyDeliveredMaxOrdinal = resolveLegacyDeliveredMaxOrdinal(
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const phaseKeysWithActiveQueueWork = collectPhaseKeysWithActiveQueueWork(tasks);
  const { deliveredPhaseKeys, rolledOutPhaseKeys, phaseReleaseDates, phaseDeliveryHistory } = {
    deliveredPhaseKeys: collectDeliveredPhaseKeys(dualForStatus.getDatabase(), tasks),
    rolledOutPhaseKeys: collectRolledOutPhaseKeys(dualForStatus.getDatabase()),
    phaseReleaseDates: collectPhaseReleaseDatesByKey(dualForStatus.getDatabase()),
    phaseDeliveryHistory: collectPhaseDeliveryHistoryRows(dualForStatus.getDatabase())
  };
  const lastDeliveredPhase = phaseDeliveryHistory.find((row) => row.status === "delivered") ?? null;

  const effCfg =
    ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
      ? (ctx.effectiveConfig as Record<string, unknown>)
      : {};

  let agentGuidance: DashboardSummaryData["agentGuidance"] = null;
  const guidanceResolved = resolveAgentGuidanceFromEffectiveConfig(effCfg);
  const behaviorState = await loadBehaviorWorkspaceState(ctx);
  const behaviorStore = new BehaviorProfileStore(behaviorState);
  const { effective: behaviorEffective } = behaviorStore.resolveEffectiveWithProvenance();
  const agentPresentation = resolveAgentPresentationPolicy({
    effectiveConfig: effCfg,
    guidance: guidanceResolved,
    behaviorProfile: {
      id: behaviorEffective.id,
      label: behaviorEffective.label,
      dimensions: behaviorEffective.dimensions
    }
  });
  agentGuidance = {
    schemaVersion: 1 as const,
    profileSetId: guidanceResolved.profileSetId,
    tier: guidanceResolved.tier,
    displayLabel: guidanceResolved.displayLabel,
    usingDefaultTier: guidanceResolved.usingDefaultTier,
    temperamentProfileId: behaviorEffective.id,
    temperamentLabel: dashboardOnboardingTemperamentLabel(behaviorEffective),
    agentPresentation
  };

  const humanGatesSummary = buildDashboardHumanGatesSummary(
    tasks,
    workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase) : null,
    new Map()
  );
  const approvalQueue = buildDashboardApprovalQueueSummary(tasks);

  const emptyListSummary = () =>
    ({ schemaVersion: 1 as const, count: 0, top: [], phaseBuckets: [] });

  const emptyWishlist = (pageSize: number, enabled?: boolean) =>
    ({
      schemaVersion: 1 as const,
      enabled: enabled === true,
      openCount: 0,
      totalCount: 0,
      openPage: 0,
      openPageSize: pageSize,
      openTotalPages: 0,
      openTop: []
    });

  const emptyIdeas = (): DashboardSummaryData["ideas"] => ({
    schemaVersion: 1,
    available: false,
    totalCount: 0,
    openCount: 0,
    planningCount: 0,
    plannedCount: 0,
    top: []
  });

  const emptyBrainstormingIdeas = (): DashboardSummaryData["brainstormingIdeas"] => ({
    schemaVersion: 1,
    available: false,
    count: 0,
    top: []
  });

  const emptyPhaseJournalStats = (): DashboardSummaryData["phaseJournalStats"] => ({
    schemaVersion: 1,
    available: false,
    phases: [],
    currentPhase: {
      phaseKey: null,
      activeNoteCount: 0,
      completedDeliveryTaskCount: 0,
      silenceWarning: false
    }
  });

  const suggestedNext = suggestion.suggestedNext
    ? {
        ...projectDashboardTaskRow(suggestion.suggestedNext, new Map()),
        id: suggestion.suggestedNext.id,
        status: suggestion.suggestedNext.status,
        title: suggestion.suggestedNext.title,
        type: suggestion.suggestedNext.type
      }
    : null;

  const includePhaseKickoff =
    commandArgs?.includePhaseKickoff === true || commandArgs?.includePhaseKickoff === "true";
  const phaseKickoffPhaseKey =
    typeof commandArgs?.phaseKey === "string" && commandArgs.phaseKey.trim().length > 0
      ? commandArgs.phaseKey.trim()
      : parseKitPhaseNumberFromYaml(workspaceStatus?.currentKitPhase ?? null);
  let phaseKickoff: DashboardPhaseKickoffSummary | null = null;
  if (includePhaseKickoff && sqliteDual && phaseKickoffPhaseKey) {
    phaseKickoff = await buildDashboardPhaseKickoffSlice(
      ctx,
      { taskStore: store, sqliteDual } satisfies OpenedPlanningStores,
      phaseKickoffPhaseKey,
      { includeValidationPlans: false }
    );
  }

  return {
    schemaVersion: 7 as const,
    dashboardProjection: "overview",
    planningGeneration,
    planningGenerationPolicy: getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    taskStoreLastUpdated: store.getLastUpdated(),
    workspaceStatus,
    planningSession: null,
    planArtifact: null,
    stateSummary: suggestion.stateSummary,
    transcriptChurnResearchSummary: emptyListSummary(),
    proposedImprovementsSummary: emptyListSummary(),
    proposedExecutionSummary: emptyListSummary(),
    readyImprovementsSummary: emptyListSummary(),
    readyExecutionSummary: emptyListSummary(),
    readyQueueTop: [],
    readyQueueCount: 0,
    readyQueueBreakdown: { schemaVersion: 1, improvement: 0, other: 0 },
    executionPlanningScope: "tasks-only" as const,
    wishlist: emptyWishlist(10, includeWishlist),
    ideas: emptyIdeas(),
    brainstormingIdeas: emptyBrainstormingIdeas(),
    blockedSummary: { count: 0, top: [], phaseBuckets: [] },
    humanGatesSummary,
    approvalQueue,
    phaseJournalStats: emptyPhaseJournalStats(),
    completedSummary: {
      schemaVersion: 1 as const,
      count: getTerminalCount("completed", tasks, sqliteDual),
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    cancelledSummary: {
      schemaVersion: 1 as const,
      count: getTerminalCount("cancelled", tasks, sqliteDual),
      top: [],
      phaseBuckets: [],
      lazy: true
    },
    suggestedNext,
    dependencyOverview: {
      schemaVersion: 1,
      activeTaskCount: 0,
      includedTaskCount: 0,
      edgeCount: 0,
      truncated: false,
      perfNote: "overview projection",
      nodes: [],
      edges: [],
      mermaidFlowchart: "",
      criticalPathReady: []
    },
    blockingAnalysis: [],
    agentGuidance,
    teamExecution: teamExecutionEmpty,
    subagentRegistry: subagentRegistryEmpty,
    agentRegistrySessions: agentRegistrySessionsEmpty,
    taskCheckpoints: taskCheckpointsEmpty,
    systemStatus,
    taskStateProjection,
    agentStatus,
    agentActivitySummary,
    currentPhaseDelivery,
    deliveredPhaseKeys,
    rolledOutPhaseKeys,
    phaseReleaseDates,
    phaseDeliveryHistory,
    lastDeliveredPhase,
    legacyDeliveredMaxOrdinal,
    phaseKeysWithActiveQueueWork,
    pastPhaseNotes: [],
    ...(phaseKickoff ? { phaseKickoff } : {})
  } satisfies DashboardSummaryData;
}

export function buildDashboardFullProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardOverviewProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardQueueProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardStatusProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

export function buildDashboardAgentActivityProjection(base: DashboardBuildBase): DashboardSummaryData {
  return base.data;
}

function getTerminalCount(
  status: "completed" | "cancelled",
  tasks: any[],
  sqliteDual: SqliteDualPlanningStore | undefined
): number {
  if (sqliteDual && sqliteDual.relationalTasksEnabled) {
    try {
      const db = sqliteDual.getDatabase();
      const row = db
        .prepare(`SELECT COUNT(*) as count FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status = ? AND archived = 0`)
        .get(status) as { count: number } | undefined;
      if (row && typeof row.count === "number") {
        return row.count;
      }
    } catch {
      // fallback
    }
  }
  return tasks.filter((t) => t.status === status).length;
}

export {
  buildDashboardOverviewSlice,
  buildDashboardQueueSlice,
  buildDashboardStatusSlice,
  buildDashboardAgentActivitySlice,
  buildDashboardAgentTypesSlice,
  buildDashboardTerminalTasksPage,
  buildDashboardOpsSlice
} from "./focused-slice-builders.js";

