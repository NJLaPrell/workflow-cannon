/**
 * HTTP/SSE wire contract for the workspace-kit dashboard read service (Option 2).
 * Shared by kit service routes and the Cursor extension `ServiceDashboardDataSource`.
 */

/** Slice keys align with Option 1 `DashboardSliceName` in the extension store. */
export type DashboardServiceSliceName =
  | "overview"
  | "queue"
  | "ideas"
  | "phase"
  | "phaseJournal"
  | "status"
  | "agent"
  | "team"
  | "subagents"
  | "checkpoints"
  | "cae"
  | "config";

export type DashboardServiceSliceStatus = "empty" | "loading" | "fresh" | "stale" | "error";

export type DashboardServiceSlicePayload = {
  status: DashboardServiceSliceStatus;
  updatedAt: string | null;
  source: string;
  value: unknown;
  error?: string;
  planningGeneration?: number | null;
};

export type DashboardServiceSnapshot = {
  schemaVersion: 1;
  serviceVersion: string;
  generatedAt: string;
  generation: number;
  planningGeneration: number | null;
  slices: Record<string, DashboardServiceSlicePayload>;
};

export const DASHBOARD_SERVICE_SNAPSHOT_SCHEMA_VERSION = 1 as const;
