import type { DashboardDataSourceMode } from "./dashboard-data-source.js";

export type DashboardActiveReadPath = "service" | "cli-polling";
export type DashboardPollingCadence = "full" | "push-safety-net";

export type DashboardReadModeBadge = {
  configured: DashboardDataSourceMode;
  active: DashboardActiveReadPath;
  pollingCadence?: DashboardPollingCadence;
  /**
   * When active === "service", the number of slices currently being kept fresh
   * via the targeted service-refresh retry path (i.e., not yet covered by a
   * successful push event within the safety-net window).
   *
   * 0 (or undefined) = fully push-driven, zero CLI reads.
   * >0 = push-driven but N slice(s) are using service-targeted-refresh-retry.
   * undefined when active !== "service".
   */
  serviceRetrySliceCount?: number;
  detail?: string;
};

/**
 * Derive the operator-visible read mode state from a badge snapshot.
 *
 * Three distinct states (task requirement #5):
 *   "push-zero-cli"   — fully push-driven, 0 CLI reads
 *   "push-retry"      — push-driven but N slice(s) using service-targeted-refresh-retry
 *   "cli-polling"     — degraded to full CLI polling
 */
export type DashboardReadModeState = "push-zero-cli" | "push-retry" | "cli-polling";

export function getDashboardReadModeState(badge: DashboardReadModeBadge): DashboardReadModeState {
  if (badge.active !== "service") {
    return "cli-polling";
  }
  if ((badge.serviceRetrySliceCount ?? 0) > 0) {
    return "push-retry";
  }
  return "push-zero-cli";
}

/** Human-readable dashboard read-path label for the overview badge. */
export function formatDashboardReadModeBadgeLabel(badge: DashboardReadModeBadge): string {
  const state = getDashboardReadModeState(badge);

  let pathLabel: string;
  if (state === "push-zero-cli") {
    pathLabel = "Push-driven service";
  } else if (state === "push-retry") {
    pathLabel = `Push-driven service (${badge.serviceRetrySliceCount} slice(s) retry)`;
  } else {
    pathLabel = "CLI polling";
  }

  if (badge.configured === "auto") {
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
  const state = getDashboardReadModeState(badge);
  if (state === "push-zero-cli") {
    return "SSE push updates active; 0 CLI reads. Safety net fires only if push freshness expires.";
  }
  if (state === "push-retry") {
    const n = badge.serviceRetrySliceCount ?? 0;
    return `Push-driven; ${n} slice(s) are recovering via targeted service refresh (no CLI spawns). CLI is a final fallback only.`;
  }
  return undefined;
}
