import { DASHBOARD_SLICE_REGISTRY, lookupDashboardSlice } from "./dashboard-slice-registry.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import type { DashboardSlice, DashboardSliceName } from "./dashboard-snapshot-types.js";
import { enrichDashboardAgentActivitySummaryWithRegistrySessions } from "./enrich-dashboard-agent-activity-summary.js";
import type {
  DashboardAgentActivitySummary,
  DashboardAgentRegistrySessionSummary
} from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";

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
  return DASHBOARD_SLICE_REGISTRY.filter((desc) => {
    if (desc.command !== "dashboard-summary") {
      return false;
    }
    const sliceProjection = desc.args.projection;
    if (typeof sliceProjection !== "string") {
      return projection === "overview";
    }
    return projection === "overview" || sliceProjection === projection;
  }).map((desc) => desc.name);
}
