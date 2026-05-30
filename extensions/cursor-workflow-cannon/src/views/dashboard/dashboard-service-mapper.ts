import type { DashboardServiceSnapshot } from "@workflow-cannon/workspace-kit/contracts/dashboard-snapshot";
import { DASHBOARD_SLICE_REGISTRY, lookupDashboardSlice } from "./dashboard-slice-registry.js";
import type {
  DashboardSlice,
  DashboardSliceName,
  DashboardSliceStatus,
  DashboardSnapshot
} from "./dashboard-snapshot-types.js";

/** Kit runtime metadata (`.workspace-kit/dashboard-service/runtime.json`). */
export type DashboardServiceRuntimeV1 = {
  schemaVersion: 1;
  pid: number;
  host: string;
  port: number;
  startedAt: string;
  serviceVersion: string;
  generation: number;
  planningGeneration: number | null;
};

export const DASHBOARD_SERVICE_RUNTIME_REL = ".workspace-kit/dashboard-service/runtime.json";

export function parseDashboardServiceRuntime(raw: unknown): DashboardServiceRuntimeV1 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as DashboardServiceRuntimeV1;
  if (r.schemaVersion !== 1 || typeof r.host !== "string" || typeof r.port !== "number") {
    return null;
  }
  return r;
}

function toStoreStatus(status: string): DashboardSliceStatus {
  if (
    status === "empty" ||
    status === "loading" ||
    status === "fresh" ||
    status === "stale" ||
    status === "error"
  ) {
    return status;
  }
  return "error";
}

function parseUpdatedAt(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function mapServiceSnapshotToDashboardSnapshot(
  service: DashboardServiceSnapshot,
  now = Date.now()
): DashboardSnapshot {
  const slices = {} as Record<DashboardSliceName, DashboardSlice>;
  for (const descriptor of DASHBOARD_SLICE_REGISTRY) {
    const payload = service.slices[descriptor.name];
    if (!payload) {
      slices[descriptor.name] = {
        name: descriptor.name,
        value: null,
        status: "empty",
        updatedAt: null,
        startedAt: null,
        source: descriptor.command,
        sourceArgs: { ...descriptor.args },
        planningGeneration: service.planningGeneration,
        error: null
      };
      continue;
    }
    const value =
      payload.value && typeof payload.value === "object" && !Array.isArray(payload.value)
        ? (payload.value as Record<string, unknown>)
        : null;
    slices[descriptor.name] = {
      name: descriptor.name,
      value,
      status: toStoreStatus(payload.status),
      updatedAt: parseUpdatedAt(payload.updatedAt),
      startedAt: null,
      source: payload.source,
      sourceArgs: { ...descriptor.args },
      planningGeneration:
        payload.planningGeneration ?? service.planningGeneration ?? null,
      error: payload.error ?? null
    };
  }
  return {
    schemaVersion: 1,
    generation: service.generation,
    createdAt: now,
    updatedAt: parseUpdatedAt(service.generatedAt) ?? now,
    planningGeneration: service.planningGeneration,
    slices
  };
}

export function mapServiceSliceRecordToStoreUpdate(
  name: DashboardSliceName,
  record: Record<string, unknown>
): {
  value: Record<string, unknown> | null;
  status: DashboardSliceStatus;
  source: string;
  planningGeneration?: number | null;
  error?: string | null;
  updatedAt: number | null;
} {
  const descriptor = lookupDashboardSlice(name);
  const status = toStoreStatus(typeof record.status === "string" ? record.status : "error");
  const rawValue = record.value;
  const value =
    rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
      ? (rawValue as Record<string, unknown>)
      : null;
  return {
    value,
    status,
    source: typeof record.source === "string" ? record.source : descriptor.command,
    planningGeneration:
      typeof record.planningGeneration === "number"
        ? record.planningGeneration
        : typeof value?.planningGeneration === "number"
          ? value.planningGeneration
          : null,
    error: typeof record.error === "string" ? record.error : null,
    updatedAt: parseUpdatedAt(typeof record.updatedAt === "string" ? record.updatedAt : null)
  };
}
