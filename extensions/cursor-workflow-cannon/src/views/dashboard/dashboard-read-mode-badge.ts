import type { DashboardDataSourceMode } from "./dashboard-data-source.js";

export type DashboardActiveReadPath = "service" | "cli-polling";

export type DashboardReadModeBadge = {
  configured: DashboardDataSourceMode;
  active: DashboardActiveReadPath;
  detail?: string;
};

/** Human-readable dashboard read-path label for the overview badge. */
export function formatDashboardReadModeBadgeLabel(badge: DashboardReadModeBadge): string {
  const pathLabel = badge.active === "service" ? "Warm service" : "CLI polling";
  if (badge.configured === "auto") {
    if (badge.active === "cli-polling" && badge.detail) {
      return `${pathLabel} (auto)`;
    }
    return `${pathLabel} (auto)`;
  }
  if (badge.configured === "service" && badge.active === "cli-polling") {
    return "Service unavailable";
  }
  return pathLabel;
}

export function formatDashboardReadModeBadgeDetail(badge: DashboardReadModeBadge): string | undefined {
  if (badge.detail && badge.detail.trim().length > 0) {
    return badge.detail.trim();
  }
  if (badge.configured === "service" && badge.active !== "service") {
    return "Configured for warm service; service is not reachable. Using CLI polling for live data.";
  }
  return undefined;
}
