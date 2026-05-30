/**
 * SSE event contract for the workspace-kit dashboard read service (Option 2).
 */

export type DashboardServiceSnapshotUpdatedEvent = {
  type: "dashboard.snapshot.updated";
  generation: number;
  changedSlices: string[];
  updatedAt: string;
};

export type DashboardServiceSliceUpdatedEvent = {
  type: "dashboard.slice.updated";
  generation: number;
  slice: string;
  updatedAt: string;
};

export type DashboardServiceErrorEvent = {
  type: "dashboard.service.error";
  message: string;
  code?: string;
};

export type DashboardServiceEvent =
  | DashboardServiceSnapshotUpdatedEvent
  | DashboardServiceSliceUpdatedEvent
  | DashboardServiceErrorEvent;

export const DASHBOARD_SERVICE_EVENT_TYPES = [
  "dashboard.snapshot.updated",
  "dashboard.slice.updated",
  "dashboard.service.error"
] as const;
