import { DASHBOARD_SLICE_REGISTRY, lookupDashboardSlice } from "./dashboard-slice-registry.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import type { DashboardSlice, DashboardSliceName } from "./dashboard-snapshot-types.js";

/** Merge a slice payload into an accumulated dashboard-summary-shaped object. */
export function mergeSlicePayloadIntoSummary(
  summary: Record<string, unknown>,
  sliceName: DashboardSliceName,
  slicePayload: Record<string, unknown>
): Record<string, unknown> {
  const desc = lookupDashboardSlice(sliceName);
  let extracted = desc.extractPayload(slicePayload);

  if (sliceName === "ideas") {
    const priorIdeas = summary.ideas as Record<string, unknown> | undefined;
    const newIdeas = extracted.ideas as Record<string, unknown> | undefined;
    if (priorIdeas && priorIdeas.available === true && (!newIdeas || newIdeas.available !== true)) {
      extracted = { ...extracted, ideas: priorIdeas };
    }
  }

  return { ...summary, ...extracted };
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
  projection: "full" | "overview" | "queue" | "status" | "agentActivity"
): DashboardSliceName[] {
  return DASHBOARD_SLICE_REGISTRY.filter((desc) => {
    if (desc.command !== "dashboard-summary") {
      return false;
    }
    const sliceProjection = desc.args.projection;
    if (typeof sliceProjection !== "string") {
      return projection === "full";
    }
    return projection === "full" || sliceProjection === projection;
  }).map((desc) => desc.name);
}
