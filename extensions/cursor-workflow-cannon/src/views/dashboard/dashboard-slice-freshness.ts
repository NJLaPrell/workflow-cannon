import type { DashboardSlice, DashboardSliceStatus } from "./dashboard-snapshot-types.js";

function formatAgeMs(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

/** Operator-facing freshness label for a dashboard slice row. */
export function formatSliceFreshnessLabel(
  slice: Pick<DashboardSlice, "status" | "updatedAt">,
  now = Date.now()
): string {
  const status: DashboardSliceStatus = slice.status;
  switch (status) {
    case "loading":
      return "Refreshing…";
    case "stale":
      return "Stale";
    case "error":
      return "Failed (showing last good)";
    case "empty":
      return "Not loaded";
    case "fresh":
      if (slice.updatedAt == null) {
        return "Updated just now";
      }
      return `Updated ${formatAgeMs(now - slice.updatedAt)} ago`;
    default:
      return "Unknown";
  }
}
