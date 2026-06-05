import type { DashboardSlice } from "./dashboard-snapshot-types.js";

/** Operator-facing freshness label for a dashboard slice row. (Disabled per user request) */
export function formatSliceFreshnessLabel(
  _slice: Pick<DashboardSlice, "status" | "updatedAt">,
  _now = Date.now()
): string {
  return "";
}
