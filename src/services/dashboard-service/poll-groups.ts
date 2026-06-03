import type { DashboardServiceSliceName } from "../../contracts/dashboard-snapshot.js";
import { DASHBOARD_SERVICE_SLICE_DEFINITIONS } from "./slice-definitions.js";

/** Mirrors extension Option 1 poll groups (`dashboard-slice-registry.ts`). */
export type DashboardServicePollGroup = "critical" | "live" | "queue" | "ops" | "status" | "manual";

export const DASHBOARD_SERVICE_POLL_INTERVAL_MS: Readonly<Record<
  Exclude<DashboardServicePollGroup, "manual">,
  number
>> = {
  critical: 2000,
  live: 3000,
  queue: 5000,
  ops: 10000,
  status: 30000
};

export function dashboardServiceSliceNamesForPollGroup(
  group: DashboardServicePollGroup
): DashboardServiceSliceName[] {
  return DASHBOARD_SERVICE_SLICE_DEFINITIONS.filter((entry) => entry.pollGroup === group).map(
    (entry) => entry.name
  );
}

export function listDashboardServicePollGroups(): Exclude<DashboardServicePollGroup, "manual">[] {
  return ["critical", "live", "queue", "ops", "status"];
}
