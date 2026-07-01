import type { DashboardDataSourceMode } from "./dashboard-data-source.js";

export type DashboardActiveReadPath = "service" | "cli-polling";
export type DashboardPollingCadence = "full" | "push-safety-net";

export type DashboardReadModeBadge = {
  configured: DashboardDataSourceMode;
  active: DashboardActiveReadPath;
  pollingCadence?: DashboardPollingCadence;
  detail?: string;
};

/** Human-readable dashboard read-path label for the overview badge. */
export function formatDashboardReadModeBadgeLabel(badge: DashboardReadModeBadge): string {
  const pathLabel =
    badge.active === "service" && badge.pollingCadence === "push-safety-net"
      ? "Push-driven service"
      : badge.active === "service"
        ? "Warm service"
        : "CLI polling";
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
  if (badge.active === "service" && badge.pollingCadence === "push-safety-net") {
    return "SSE push updates active; CLI polling is limited to a stale-slice safety net.";
  }
  return undefined;
}
