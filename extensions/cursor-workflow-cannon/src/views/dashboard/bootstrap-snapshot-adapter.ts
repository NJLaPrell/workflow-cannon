/**
 * CLI-primary cold bootstrap normalizer (T100844 / I012 WBS-2).
 *
 * Resolution order never awaits service health / readPath.start / restartDashboardService:
 *   1. session-cache (`lastDashboardSummaryData`)
 *   2. store-slices (fresh overview + optional queue counts)
 *   3. cli-bootstrap (`dashboard-bootstrap-slices`)
 *   4. cli-summary (`dashboard-summary` overview fallback)
 *
 * Always stamps `dashboardProjection: "overview"` so background queue rollup hydration still fires.
 */

import type { DashboardDataStore } from "./dashboard-data-store.js";
import {
  mergeDashboardProjectionIntoSummary,
  mergeSlicePayloadIntoSummary
} from "./dashboard-store-bridge.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";

export type BootstrapSnapshotProvenance =
  | "session-cache"
  | "store-slices"
  | "cli-bootstrap"
  | "cli-summary";

export type KitRunResultLike = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: unknown;
};

export type BootstrapSnapshotRequest = {
  cache: Record<string, unknown> | null;
  store: Pick<DashboardDataStore, "getSlice" | "isFresh">;
  fetchCliBootstrap: () => Promise<KitRunResultLike>;
  fetchCliSummaryOverview?: () => Promise<KitRunResultLike>;
  log?: (message: string) => void;
};

export type BootstrapSnapshot =
  | {
      ok: true;
      provenance: BootstrapSnapshotProvenance;
      /** dashboard-summary-shaped payload for renderDashboardRootInnerHtml */
      data: Record<string, unknown>;
      /** Always overview for cold bootstrap; queue counts merged, not full queue projection */
      dashboardProjection: "overview";
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

const LIST_SUMMARY_COUNT_KEYS = [
  "proposedImprovementsSummary",
  "proposedExecutionSummary",
  "readyImprovementsSummary",
  "readyExecutionSummary",
  "blockedSummary",
  "completedSummary",
  "cancelledSummary"
] as const;

function listSummaryHasHydratedTops(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const top = (value as Record<string, unknown>).top;
  return Array.isArray(top) && top.length > 0;
}

function countOnlyListSummary(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const count = (value as Record<string, unknown>).count;
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    count: Math.max(0, Math.floor(count)),
    top: [],
    phaseBuckets: []
  };
}

/**
 * Copy ONLY queue count fields into an overview-shaped summary.
 * Does not stamp `dashboardProjection: "queue"` — keeps overview so rollup hydration still runs.
 * Never clobbers already-hydrated rollups that have non-empty `top` arrays.
 */
export function mergeColdBootstrapCounts(
  summary: Record<string, unknown>,
  queueSlice?: Record<string, unknown> | null
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...summary, dashboardProjection: "overview" };
  if (!queueSlice) {
    return next;
  }
  for (const key of LIST_SUMMARY_COUNT_KEYS) {
    if (listSummaryHasHydratedTops(next[key])) {
      continue;
    }
    const counts = countOnlyListSummary(queueSlice[key]);
    if (counts) {
      next[key] = counts;
    }
  }
  if (typeof queueSlice.readyQueueCount === "number" && Number.isFinite(queueSlice.readyQueueCount)) {
    next.readyQueueCount = Math.max(0, Math.floor(queueSlice.readyQueueCount));
  }
  return next;
}

/** True when cache/store/CLI payload is enough to clear the stuck loading shell. */
export function isUsableColdBootstrapCache(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) {
    return false;
  }
  if (data.workspaceStatus && typeof data.workspaceStatus === "object") {
    return true;
  }
  const systemStatus = data.systemStatus;
  if (systemStatus && typeof systemStatus === "object") {
    const phase = (systemStatus as Record<string, unknown>).phase;
    if (phase != null && String(phase).trim().length > 0) {
      return true;
    }
  }
  if (data.stateSummary && typeof data.stateSummary === "object") {
    return true;
  }
  return false;
}

/** Build overview-minimal summary from fresh store slices (+ optional queue counts). */
export function summaryFromStoreSlices(
  store: Pick<DashboardDataStore, "getSlice" | "isFresh">,
  prior?: Record<string, unknown>
): Record<string, unknown> | null {
  if (!store.isFresh("overview")) {
    return null;
  }
  const overview = store.getSlice("overview");
  if (!overview.value || typeof overview.value !== "object") {
    return null;
  }
  let merged = mergeSlicePayloadIntoSummary(
    prior ?? {},
    "overview",
    overview.value as Record<string, unknown>
  );
  for (const name of ["phase", "agent", "config"] as const satisfies readonly DashboardSliceName[]) {
    if (!store.isFresh(name)) {
      continue;
    }
    const slice = store.getSlice(name);
    if (slice.value && typeof slice.value === "object") {
      merged = mergeSlicePayloadIntoSummary(merged, name, slice.value as Record<string, unknown>);
    }
  }
  let queuePayload: Record<string, unknown> | undefined;
  if (store.isFresh("queue")) {
    const queue = store.getSlice("queue");
    if (queue.value && typeof queue.value === "object") {
      queuePayload = queue.value as Record<string, unknown>;
    }
  }
  return mergeColdBootstrapCounts(merged, queuePayload);
}

/** Normalize `dashboard-bootstrap-slices` data bag into overview-minimal summary shape. */
export function summaryFromBootstrapSlices(
  slices: Record<string, unknown>,
  prior?: Record<string, unknown>
): Record<string, unknown> {
  let merged = prior ?? {};
  const overview = slices.overview;
  if (overview && typeof overview === "object") {
    const overviewPayload = overview as Record<string, unknown>;
    merged = mergeSlicePayloadIntoSummary(merged, "overview", overviewPayload);
    merged = mergeSlicePayloadIntoSummary(merged, "phase", overviewPayload);
    merged = mergeSlicePayloadIntoSummary(merged, "agent", overviewPayload);
    merged = mergeSlicePayloadIntoSummary(merged, "config", overviewPayload);
  }
  for (const name of ["agentTypes", "agentActivity", "status"] as const satisfies readonly DashboardSliceName[]) {
    const payload = slices[name];
    if (payload && typeof payload === "object") {
      merged = mergeSlicePayloadIntoSummary(merged, name, payload as Record<string, unknown>);
    }
  }
  const queue = slices.queue;
  return mergeColdBootstrapCounts(
    merged,
    queue && typeof queue === "object" ? (queue as Record<string, unknown>) : undefined
  );
}

/**
 * Resolve a usable cold-bootstrap snapshot without waiting on dashboard service health.
 */
export async function resolveBootstrapSnapshot(
  req: BootstrapSnapshotRequest
): Promise<BootstrapSnapshot> {
  if (isUsableColdBootstrapCache(req.cache)) {
    req.log?.("bootstrap snapshot: session-cache");
    return {
      ok: true,
      provenance: "session-cache",
      data: mergeColdBootstrapCounts({ ...(req.cache as Record<string, unknown>) }),
      dashboardProjection: "overview"
    };
  }

  const fromStore = summaryFromStoreSlices(req.store, req.cache ?? undefined);
  if (fromStore && isUsableColdBootstrapCache(fromStore)) {
    req.log?.("bootstrap snapshot: store-slices");
    return {
      ok: true,
      provenance: "store-slices",
      data: fromStore,
      dashboardProjection: "overview"
    };
  }

  try {
    const bootstrap = await req.fetchCliBootstrap();
    if (bootstrap.ok === true && bootstrap.data && typeof bootstrap.data === "object") {
      const data = summaryFromBootstrapSlices(
        bootstrap.data as Record<string, unknown>,
        req.cache ?? undefined
      );
      if (isUsableColdBootstrapCache(data)) {
        req.log?.("bootstrap snapshot: cli-bootstrap");
        return {
          ok: true,
          provenance: "cli-bootstrap",
          data,
          dashboardProjection: "overview"
        };
      }
    }
    req.log?.(
      `bootstrap snapshot: cli-bootstrap unusable (${String(bootstrap.code ?? "unknown")}): ${String(bootstrap.message ?? "")}`
    );
  } catch (error) {
    req.log?.(
      `bootstrap snapshot: cli-bootstrap threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (req.fetchCliSummaryOverview) {
    try {
      const summary = await req.fetchCliSummaryOverview();
      if (summary.ok === true && summary.data && typeof summary.data === "object") {
        const data = mergeColdBootstrapCounts(
          mergeDashboardProjectionIntoSummary(
            req.cache ?? {},
            "overview",
            summary.data as Record<string, unknown>
          )
        );
        req.log?.("bootstrap snapshot: cli-summary");
        return {
          ok: true,
          provenance: "cli-summary",
          data,
          dashboardProjection: "overview"
        };
      }
      return {
        ok: false,
        code: typeof summary.code === "string" ? summary.code : "bootstrap-snapshot-failed",
        message:
          typeof summary.message === "string"
            ? summary.message
            : "Cold bootstrap failed to load overview"
      };
    } catch (error) {
      return {
        ok: false,
        code: "bootstrap-snapshot-failed",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    ok: false,
    code: "bootstrap-snapshot-failed",
    message: "Cold bootstrap exhausted cache, store, and CLI paths"
  };
}
