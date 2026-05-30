import type {
  RuntimeServiceDashboardFreshness,
  RuntimeServiceHealth,
  RuntimeServiceStatusV1
} from "../../contracts/runtime-service.js";
import { RUNTIME_SERVICE_STATUS_SCHEMA_VERSION } from "../../contracts/runtime-service.js";
import type { DashboardSseHub } from "./events.js";
import type { DashboardSliceRefresher } from "./slice-refreshers.js";
import type { DashboardSnapshotStore } from "./snapshot-store.js";

function deriveHealth(failingSlices: string[]): RuntimeServiceHealth {
  return failingSlices.length > 0 ? "degraded" : "ok";
}

function collectDashboardFreshness(
  snapshotStore: DashboardSnapshotStore,
  failingSlices: string[]
): RuntimeServiceDashboardFreshness {
  const snapshot = snapshotStore.getSnapshot();
  const staleSlices: string[] = [];
  for (const [name, slice] of Object.entries(snapshot.slices)) {
    if (slice.status === "stale" || slice.status === "error") {
      staleSlices.push(name);
    }
  }
  return {
    generation: snapshot.generation,
    planningGeneration: snapshot.planningGeneration,
    staleSlices,
    failingSlices: [...failingSlices],
    lastSnapshotAt: snapshot.generatedAt
  };
}

export function buildRuntimeServiceStatus(args: {
  snapshotStore: DashboardSnapshotStore;
  refresher: DashboardSliceRefresher;
  sseHub: DashboardSseHub;
}): RuntimeServiceStatusV1 {
  const summary = args.refresher.getObservabilitySummary();
  const snapshot = args.snapshotStore.getSnapshot();
  const failingSlices = summary.failingSlices;
  return {
    schemaVersion: RUNTIME_SERVICE_STATUS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    serviceVersion: snapshot.serviceVersion,
    health: deriveHealth(failingSlices),
    uptimeMs: args.snapshotStore.getUptimeMs(),
    sseClients: args.sseHub.clientCount(),
    dashboard: collectDashboardFreshness(args.snapshotStore, failingSlices)
  };
}
