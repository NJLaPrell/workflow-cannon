/**
 * Versioned wire contract for the workspace-kit local runtime service (GET /status).
 * Distinguishes process health from dashboard freshness; task sync is GET /task-sync/status.
 */

export const RUNTIME_SERVICE_STATUS_SCHEMA_VERSION = 1 as const;

export type RuntimeServiceHealth = "ok" | "degraded" | "starting";

/** Dashboard read-model freshness — not Git/task-state sync (see task-sync-status). */
export type RuntimeServiceDashboardFreshness = {
  generation: number;
  planningGeneration: number | null;
  staleSlices: string[];
  failingSlices: string[];
  lastSnapshotAt: string;
};

export type RuntimeServiceStatusV1 = {
  schemaVersion: typeof RUNTIME_SERVICE_STATUS_SCHEMA_VERSION;
  generatedAt: string;
  serviceVersion: string;
  health: RuntimeServiceHealth;
  uptimeMs: number;
  sseClients: number;
  dashboard: RuntimeServiceDashboardFreshness;
};
