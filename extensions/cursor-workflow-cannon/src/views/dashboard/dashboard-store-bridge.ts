import { DASHBOARD_SLICE_REGISTRY, lookupDashboardSlice } from "./dashboard-slice-registry.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import type { DashboardSlice, DashboardSliceName } from "./dashboard-snapshot-types.js";
import { enrichDashboardAgentActivitySummaryWithRegistrySessions } from "./enrich-dashboard-agent-activity-summary.js";
import type {
  DashboardAgentActivitySummary,
  DashboardAgentRegistrySessionSummary
} from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";

function planArtifactRowHasIdentity(row: unknown): boolean {
  if (!row || typeof row !== "object") {
    return false;
  }
  return String((row as Record<string, unknown>).planId ?? "").trim().length > 0;
}

export function planArtifactHasContent(planArtifact: unknown): boolean {
  if (!planArtifact || typeof planArtifact !== "object") {
    return false;
  }
  const summary = planArtifact as Record<string, unknown>;
  if (planArtifactRowHasIdentity(summary.current)) {
    return true;
  }
  return Array.isArray(summary.recent) && summary.recent.some(planArtifactRowHasIdentity);
}

/** True when eager planning cards still need a queue projection read. */
export function dashboardSummaryNeedsPlanningHydration(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) {
    return true;
  }
  return !planArtifactHasContent(data.planArtifact) || !ideasHasContent(data.ideas);
}

export function ideasHasContent(ideas: unknown): boolean {
  if (!ideas || typeof ideas !== "object") {
    return false;
  }
  const record = ideas as Record<string, unknown>;
  if (record.available === true) {
    return true;
  }
  return Array.isArray(record.top) && record.top.length > 0;
}

function agentActivitySummaryHasContent(summary: unknown): boolean {
  if (!summary || typeof summary !== "object") {
    return false;
  }
  const record = summary as Record<string, unknown>;
  if (record.main && typeof record.main === "object") {
    return true;
  }
  if (record.inferredFallback && typeof record.inferredFallback === "object") {
    return true;
  }
  if (Array.isArray(record.active) && record.active.length > 0) {
    return true;
  }
  if (Array.isArray(record.needsAttention) && record.needsAttention.length > 0) {
    return true;
  }
  return false;
}

function planArtifactRowWbsRows(row: unknown): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const wbsRows = (row as Record<string, unknown>).wbsRows;
  return Array.isArray(wbsRows) ? wbsRows : [];
}

function planArtifactRowWbsCount(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const count = (row as Record<string, unknown>).wbsRowCount;
  return typeof count === "number" && count > 0 ? count : 0;
}

function planArtifactRowRiskRows(row: unknown): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const riskRows = (row as Record<string, unknown>).riskRows;
  return Array.isArray(riskRows) ? riskRows : [];
}

function planArtifactRowRiskCount(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const count = (row as Record<string, unknown>).riskCount;
  return typeof count === "number" && count > 0 ? count : 0;
}

function planArtifactRowOpenQuestionRows(row: unknown): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const openQuestionRows = (row as Record<string, unknown>).openQuestionRows;
  return Array.isArray(openQuestionRows) ? openQuestionRows : [];
}

function planArtifactRowOpenQuestionCount(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const count = (row as Record<string, unknown>).openQuestionCount;
  return typeof count === "number" && count > 0 ? count : 0;
}

function planArtifactRowReviewFindingRows(row: unknown): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const reviewFindingRows = (row as Record<string, unknown>).reviewFindingRows;
  return Array.isArray(reviewFindingRows) ? reviewFindingRows : [];
}

function planArtifactRowReviewFindingCount(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const record = row as Record<string, unknown>;
  const blockerCount = typeof record.blockerCount === "number" ? record.blockerCount : 0;
  const warningCount = typeof record.warningCount === "number" ? record.warningCount : 0;
  const total = blockerCount + warningCount;
  return total > 0 ? total : 0;
}

function planArtifactRowPhaseRecommendationRows(row: unknown): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const phaseRecommendationRows = (row as Record<string, unknown>).phaseRecommendationRows;
  return Array.isArray(phaseRecommendationRows) ? phaseRecommendationRows : [];
}

function planArtifactRowArrayField(row: unknown, key: string): unknown[] {
  if (!row || typeof row !== "object") {
    return [];
  }
  const value = (row as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function planArtifactRowStringField(row: unknown, key: string): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  return String((row as Record<string, unknown>)[key] ?? "").trim();
}

function planArtifactRowObjectField(row: unknown, key: string): Record<string, unknown> | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const value = (row as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function planArtifactWbsRowMergeKey(row: unknown): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  const record = row as Record<string, unknown>;
  const wbsId = String(record.wbsId ?? "").trim();
  if (wbsId.length > 0) {
    return wbsId;
  }
  return String(record.title ?? "").trim();
}

function mergePlanArtifactWbsRowLinkages(priorRows: unknown[], nextRows: unknown[]): unknown[] {
  const priorByKey = new Map<string, unknown>();
  for (const row of priorRows) {
    const key = planArtifactWbsRowMergeKey(row);
    if (key.length > 0) {
      priorByKey.set(key, row);
    }
  }
  return nextRows.map((nextRow) => {
    const key = planArtifactWbsRowMergeKey(nextRow);
    const priorRow = key.length > 0 ? priorByKey.get(key) : undefined;
    if (!priorRow || typeof nextRow !== "object" || typeof priorRow !== "object") {
      return nextRow;
    }
    const next = nextRow as Record<string, unknown>;
    const prior = priorRow as Record<string, unknown>;
    const nextLinkedTaskId = String(next.linkedTaskId ?? "").trim();
    if (nextLinkedTaskId.length > 0) {
      return nextRow;
    }
    const priorLinkedTaskId = String(prior.linkedTaskId ?? "").trim();
    if (priorLinkedTaskId.length === 0) {
      return nextRow;
    }
    const priorLinkedTaskStatus = String(prior.linkedTaskStatus ?? "").trim();
    const nextLinkedTaskStatus = String(next.linkedTaskStatus ?? "").trim();
    return {
      ...next,
      linkedTaskId: priorLinkedTaskId,
      ...(nextLinkedTaskStatus.length > 0 || priorLinkedTaskStatus.length > 0
        ? { linkedTaskStatus: nextLinkedTaskStatus || priorLinkedTaskStatus }
        : {})
    };
  });
}

function planArtifactRowLinkedTaskCount(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const linkedTaskCount = (row as Record<string, unknown>).linkedTaskCount;
  return typeof linkedTaskCount === "number" && Number.isFinite(linkedTaskCount)
    ? Math.max(0, Math.floor(linkedTaskCount))
    : 0;
}

function planArtifactRowValueAssessment(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const valueAssessment = (row as Record<string, unknown>).valueAssessment;
  if (!valueAssessment || typeof valueAssessment !== "object") {
    return null;
  }
  const impact = String((valueAssessment as Record<string, unknown>).impact ?? "").trim();
  if (impact.length === 0) {
    return null;
  }
  return valueAssessment as Record<string, unknown>;
}

function preservePlanArtifactRowRollups(priorRow: unknown, nextRow: unknown): unknown {
  if (!nextRow || typeof nextRow !== "object") {
    return nextRow;
  }
  let patched = nextRow as Record<string, unknown>;
  const priorWbs = planArtifactRowWbsRows(priorRow);
  const nextWbs = planArtifactRowWbsRows(nextRow);
  const wbsCount = planArtifactRowWbsCount(nextRow) || planArtifactRowWbsCount(priorRow);
  if (nextWbs.length === 0 && priorWbs.length > 0 && wbsCount > 0) {
    patched = { ...patched, wbsRows: priorWbs };
  } else if (nextWbs.length > 0 && priorWbs.length > 0) {
    patched = { ...patched, wbsRows: mergePlanArtifactWbsRowLinkages(priorWbs, nextWbs) };
  }
  const priorRisks = planArtifactRowRiskRows(priorRow);
  const nextRisks = planArtifactRowRiskRows(nextRow);
  const riskCount = planArtifactRowRiskCount(nextRow) || planArtifactRowRiskCount(priorRow);
  if (nextRisks.length === 0 && priorRisks.length > 0 && riskCount > 0) {
    patched = { ...patched, riskRows: priorRisks };
  }
  const priorOpenQuestions = planArtifactRowOpenQuestionRows(priorRow);
  const nextOpenQuestions = planArtifactRowOpenQuestionRows(nextRow);
  const openQuestionCount =
    planArtifactRowOpenQuestionCount(nextRow) || planArtifactRowOpenQuestionCount(priorRow);
  if (nextOpenQuestions.length === 0 && priorOpenQuestions.length > 0 && openQuestionCount > 0) {
    patched = { ...patched, openQuestionRows: priorOpenQuestions };
  }
  const priorReviewFindings = planArtifactRowReviewFindingRows(priorRow);
  const nextReviewFindings = planArtifactRowReviewFindingRows(nextRow);
  const reviewFindingCount =
    planArtifactRowReviewFindingCount(nextRow) || planArtifactRowReviewFindingCount(priorRow);
  if (nextReviewFindings.length === 0 && priorReviewFindings.length > 0 && reviewFindingCount > 0) {
    patched = { ...patched, reviewFindingRows: priorReviewFindings };
  }
  const priorPhaseRecommendations = planArtifactRowPhaseRecommendationRows(priorRow);
  const nextPhaseRecommendations = planArtifactRowPhaseRecommendationRows(nextRow);
  if (nextPhaseRecommendations.length === 0 && priorPhaseRecommendations.length > 0) {
    patched = { ...patched, phaseRecommendationRows: priorPhaseRecommendations };
  }
  for (const key of [
    "goalRows",
    "nonGoalRows",
    "assumptionRows",
    "userStoryRows",
    "architectureDecisionRows",
    "architectureDiagramRows",
    "implementationGuidanceRows",
    "whatNotToDoRows",
    "executionLinkageRows"
  ] as const) {
    const priorRows = planArtifactRowArrayField(priorRow, key);
    const nextRows = planArtifactRowArrayField(nextRow, key);
    if (nextRows.length === 0 && priorRows.length > 0) {
      patched = { ...patched, [key]: priorRows };
    }
  }
  for (const key of ["technicalImpact", "testingStrategy", "uiUxSummary", "approvalSummary"] as const) {
    const priorObject = planArtifactRowObjectField(priorRow, key);
    const nextObject = planArtifactRowObjectField(nextRow, key);
    if (!nextObject && priorObject) {
      patched = { ...patched, [key]: priorObject };
    }
  }
  const priorArchitectureOverview = planArtifactRowStringField(priorRow, "architectureOverview");
  const nextArchitectureOverview = planArtifactRowStringField(nextRow, "architectureOverview");
  if (nextArchitectureOverview.length === 0 && priorArchitectureOverview.length > 0) {
    patched = { ...patched, architectureOverview: priorArchitectureOverview };
  }
  const priorValueAssessment = planArtifactRowValueAssessment(priorRow);
  const nextValueAssessment = planArtifactRowValueAssessment(nextRow);
  if (!nextValueAssessment && priorValueAssessment) {
    patched = { ...patched, valueAssessment: priorValueAssessment };
  }
  const priorLinkedTaskCount = planArtifactRowLinkedTaskCount(priorRow);
  const nextLinkedTaskCount = planArtifactRowLinkedTaskCount(nextRow);
  if (nextLinkedTaskCount === 0 && priorLinkedTaskCount > 0) {
    patched = { ...patched, linkedTaskCount: priorLinkedTaskCount };
  }
  if (!planArtifactRowHasIdentity(patched) && planArtifactRowHasIdentity(priorRow)) {
    const prior = priorRow as Record<string, unknown>;
    for (const key of [
      "planId",
      "planRef",
      "title",
      "status",
      "lifecycleStatus",
      "version",
      "updatedAt",
      "planningType",
      "summary",
      "phaseKey",
      "sourceIdeaId"
    ] as const) {
      const nextValue = String(patched[key] ?? "").trim();
      const priorValue = prior[key];
      if (nextValue.length === 0 && priorValue !== undefined && priorValue !== null && String(priorValue).trim().length > 0) {
        patched = { ...patched, [key]: priorValue };
      }
    }
  }
  return patched;
}

function preservePlanArtifactRollups(priorArtifact: unknown, nextArtifact: unknown): unknown {
  if (!nextArtifact || typeof nextArtifact !== "object") {
    return nextArtifact;
  }
  if (!priorArtifact || typeof priorArtifact !== "object") {
    return nextArtifact;
  }
  const prior = priorArtifact as Record<string, unknown>;
  const next = nextArtifact as Record<string, unknown>;
  const priorByPlanId = new Map<string, unknown>();
  const collect = (row: unknown) => {
    if (!row || typeof row !== "object") {
      return;
    }
    const planId = String((row as Record<string, unknown>).planId ?? "").trim();
    if (planId.length > 0) {
      priorByPlanId.set(planId, row);
    }
  };
  collect(prior.current);
  if (Array.isArray(prior.recent)) {
    for (const row of prior.recent) {
      collect(row);
    }
  }
  const patch = (row: unknown) => {
    if (!row || typeof row !== "object") {
      return row;
    }
    const planId = String((row as Record<string, unknown>).planId ?? "").trim();
    const priorRow = planId.length > 0 ? priorByPlanId.get(planId) : undefined;
    return priorRow ? preservePlanArtifactRowRollups(priorRow, row) : row;
  };
  return {
    ...next,
    current: patch(next.current),
    recent: Array.isArray(next.recent) ? next.recent.map(patch) : next.recent
  };
}

/** Keys whose empty/unavailable payloads should not replace a prior populated dashboard card. */
function preserveLastKnownDashboardFields(
  summary: Record<string, unknown>,
  extracted: Record<string, unknown>
): Record<string, unknown> {
  let next = extracted;
  const priorSummary = summary.agentActivitySummary;
  const nextSummary = extracted.agentActivitySummary;
  if (
    agentActivitySummaryHasContent(priorSummary) &&
    !agentActivitySummaryHasContent(nextSummary)
  ) {
    next = { ...next, agentActivitySummary: priorSummary };
  }
  if (planArtifactHasContent(summary.planArtifact) && !planArtifactHasContent(extracted.planArtifact)) {
    next = { ...next, planArtifact: summary.planArtifact };
  } else if ("planArtifact" in extracted && planArtifactHasContent(summary.planArtifact)) {
    next = {
      ...next,
      planArtifact: preservePlanArtifactRollups(summary.planArtifact, extracted.planArtifact)
    };
  }
  if (ideasHasContent(summary.ideas) && !ideasHasContent(extracted.ideas)) {
    next = { ...next, ideas: summary.ideas };
  }
  return preservePhaseDeliveryFields(summary, next);
}

const PHASE_DELIVERY_PRESERVE_KEYS = [
  "deliveredPhaseKeys",
  "rolledOutPhaseKeys",
  "legacyDeliveredMaxOrdinal",
  "phaseReleaseDates",
  "phaseDeliveryHistory",
  "lastDeliveredPhase",
  "phaseKeysWithActiveQueueWork"
] as const;

function phaseDeliveryFieldHasContent(key: (typeof PHASE_DELIVERY_PRESERVE_KEYS)[number], value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (key === "legacyDeliveredMaxOrdinal" || key === "lastDeliveredPhase") {
    return value !== null;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (key === "phaseReleaseDates" && value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

function phaseDeliveryFieldIsEmpty(key: (typeof PHASE_DELIVERY_PRESERVE_KEYS)[number], value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (key === "legacyDeliveredMaxOrdinal" || key === "lastDeliveredPhase") {
    return value === null;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (key === "phaseReleaseDates") {
    if (!value || typeof value !== "object") {
      return true;
    }
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function preservePhaseDeliveryFields(
  summary: Record<string, unknown>,
  extracted: Record<string, unknown>
): Record<string, unknown> {
  let next = extracted;
  for (const key of PHASE_DELIVERY_PRESERVE_KEYS) {
    if (!(key in extracted)) {
      continue;
    }
    const newVal = extracted[key];
    const priorVal = summary[key];
    if (phaseDeliveryFieldIsEmpty(key, newVal) && phaseDeliveryFieldHasContent(key, priorVal)) {
      next = { ...next, [key]: priorVal };
    }
  }
  return next;
}

function applyAgentRegistryEnrichment(summary: Record<string, unknown>): Record<string, unknown> {
  const activity = summary.agentActivitySummary;
  if (!activity || typeof activity !== "object") {
    return summary;
  }
  const sessions = summary.agentRegistrySessions as DashboardAgentRegistrySessionSummary | undefined;
  if (!sessions) {
    return summary;
  }
  return {
    ...summary,
    agentActivitySummary: enrichDashboardAgentActivitySummaryWithRegistrySessions(
      activity as DashboardAgentActivitySummary,
      sessions
    )
  };
}

/** Merge a slice payload into an accumulated dashboard-summary-shaped object. */
export function mergeSlicePayloadIntoSummary(
  summary: Record<string, unknown>,
  sliceName: DashboardSliceName,
  slicePayload: Record<string, unknown>
): Record<string, unknown> {
  const desc = lookupDashboardSlice(sliceName);
  let extracted = desc.extractPayload(slicePayload);

  for (const key of Object.keys(extracted)) {
    const newVal = extracted[key] as Record<string, unknown> | undefined;
    if (newVal && typeof newVal === "object" && "available" in newVal) {
      const priorVal = summary[key] as Record<string, unknown> | undefined;
      if (priorVal && typeof priorVal === "object" && priorVal.available === true && newVal.available !== true) {
        extracted = { ...extracted, [key]: priorVal };
      }
    }
  }

  extracted = preserveLastKnownDashboardFields(summary, extracted);

  const merged = { ...summary, ...extracted };
  return applyAgentRegistryEnrichment(merged);
}

export type DashboardSummaryIngestProjection =
  | "overview"
  | "queue"
  | "status"
  | "agentActivity"
  | "full";

/** Merge every slice payload for a dashboard-summary projection (or all slices when `full`). */
export function mergeDashboardProjectionIntoSummary(
  summary: Record<string, unknown>,
  projection: DashboardSummaryIngestProjection,
  summaryData: Record<string, unknown>
): Record<string, unknown> {
  if (projection === "full") {
    let merged = summary;
    const sliceNames = new Set<DashboardSliceName>();
    for (const desc of DASHBOARD_SLICE_REGISTRY) {
      if (desc.command === "dashboard-summary") {
        sliceNames.add(desc.name);
      }
    }
    for (const sliceName of sliceNames) {
      merged = mergeSlicePayloadIntoSummary(merged, sliceName, summaryData);
    }
    return merged;
  }
  let merged = summary;
  for (const sliceName of sliceNamesForDashboardSummaryProjection(projection)) {
    merged = mergeSlicePayloadIntoSummary(merged, sliceName, summaryData);
  }
  return merged;
}

export function dashboardSectionIdForSlice(sliceName: DashboardSliceName): DashboardSectionId {
  return lookupDashboardSlice(sliceName).sectionId;
}

export function wrapSectionHtmlWithFreshness(html: string, _slice: DashboardSlice): string {
  // Freshness indicators disabled per user feedback to prevent layout shift and visual clutter.
  return html;
}

/** Ingest a dashboard-summary `data` object into all matching store slices. */
export function sliceNamesForDashboardSummaryProjection(
  projection: "overview" | "queue" | "status" | "agentActivity"
): DashboardSliceName[] {
  switch (projection) {
    case "overview":
      return ["overview", "phase", "agent", "config"];
    case "queue":
      return ["overview", "phase", "queue", "ideas", "planArtifact", "phaseJournal"];
    case "status":
      return ["status", "team", "subagents", "checkpoints", "config"];
    case "agentActivity":
      return ["agentActivity"];
  }
}
