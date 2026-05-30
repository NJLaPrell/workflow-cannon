import { DASHBOARD_SLICE_REGISTRY, lookupDashboardSlice } from "./dashboard-slice-registry.js";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import { formatSliceFreshnessLabel } from "./dashboard-slice-freshness.js";
import type { DashboardSlice, DashboardSliceName } from "./dashboard-snapshot-types.js";
import { escapeHtml } from "./render-dashboard.js";

/** Merge a slice payload into an accumulated dashboard-summary-shaped object. */
export function mergeSlicePayloadIntoSummary(
  summary: Record<string, unknown>,
  sliceName: DashboardSliceName,
  slicePayload: Record<string, unknown>
): Record<string, unknown> {
  const desc = lookupDashboardSlice(sliceName);
  const extracted = desc.extractPayload(slicePayload);
  return { ...summary, ...extracted };
}

export function dashboardSectionIdForSlice(sliceName: DashboardSliceName): DashboardSectionId {
  return lookupDashboardSlice(sliceName).sectionId;
}

export function wrapSectionHtmlWithFreshness(html: string, slice: DashboardSlice): string {
  const label = formatSliceFreshnessLabel(slice);
  if (!label || label === "Unknown") {
    return html;
  }
  return (
    `<p class="wc-dash-slice-freshness muted" role="status">${escapeHtml(label)}</p>` + html
  );
}

/** Ingest a dashboard-summary `data` object into all matching store slices. */
export function sliceNamesForDashboardSummaryProjection(
  projection: "full" | "overview" | "queue" | "status"
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
