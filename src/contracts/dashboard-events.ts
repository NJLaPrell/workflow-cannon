/**
 * SSE event contract for the workspace-kit dashboard read service (Option 2).
 */

import type { TaskSyncStatusV1 } from "./task-sync-status.js";

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

export type DashboardServiceAgentActivityUpdatedEvent = {
  type: "agentActivity.updated";
  generation: number;
  updatedAt: string;
};

export type DashboardServiceErrorEvent = {
  type: "dashboard.service.error";
  message: string;
  code?: string;
};

export type TaskSyncStatusChangedEvent = {
  type: "task-sync.status.changed";
  status: TaskSyncStatusV1;
  updatedAt: string;
};

export type DashboardServiceEvent =
  | DashboardServiceSnapshotUpdatedEvent
  | DashboardServiceSliceUpdatedEvent
  | DashboardServiceAgentActivityUpdatedEvent
  | DashboardServiceErrorEvent
  | TaskSyncStatusChangedEvent;

export const DASHBOARD_SERVICE_EVENT_TYPES = [
  "dashboard.snapshot.updated",
  "dashboard.slice.updated",
  "agentActivity.updated",
  "dashboard.service.error",
  "task-sync.status.changed"
] as const;

export function normalizeDashboardServiceEvent(
  event: DashboardServiceEvent
): DashboardServiceSnapshotUpdatedEvent | DashboardServiceSliceUpdatedEvent | DashboardServiceErrorEvent | TaskSyncStatusChangedEvent {
  if (event.type === "agentActivity.updated") {
    return {
      type: "dashboard.slice.updated",
      generation: event.generation,
      slice: "agentActivity",
      updatedAt: event.updatedAt
    };
  }
  return event;
}
