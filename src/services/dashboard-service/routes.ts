import type { IncomingMessage, ServerResponse } from "node:http";
import type { DashboardSnapshotStore } from "./snapshot-store.js";
import type { DashboardSliceRefresher } from "./slice-refreshers.js";
import { DashboardSseHub, toSseEvent } from "./events.js";
import { listDashboardServiceSliceNames } from "./slice-definitions.js";
import { buildDashboardServiceHealthPayload } from "./slice-observability.js";

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("request body must be a JSON object"));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

export type DashboardServiceRoutesDeps = {
  snapshotStore: DashboardSnapshotStore;
  refresher: DashboardSliceRefresher;
  sseHub: DashboardSseHub;
};

export async function handleDashboardServiceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DashboardServiceRoutesDeps
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/health") {
    sendJson(
      res,
      200,
      buildDashboardServiceHealthPayload({
        uptimeMs: deps.snapshotStore.getUptimeMs(),
        generation: deps.snapshotStore.getGeneration(),
        planningGeneration: deps.snapshotStore.getPlanningGeneration(),
        sseClients: deps.sseHub.clientCount(),
        sliceCount: listDashboardServiceSliceNames().length,
        sliceObservability: deps.refresher.getSliceObservability(),
        summary: deps.refresher.getObservabilitySummary()
      })
    );
    return;
  }

  if (method === "GET" && url.pathname === "/dashboard/snapshot") {
    sendJson(res, 200, deps.snapshotStore.getSnapshot());
    return;
  }

  const sliceMatch = url.pathname.match(/^\/dashboard\/slices\/([^/]+)$/);
  if (method === "GET" && sliceMatch) {
    const sliceName = decodeURIComponent(sliceMatch[1] ?? "");
    const slice = deps.snapshotStore.getSlice(sliceName);
    if (!slice) {
      sendJson(res, 404, { ok: false, code: "unknown-slice", message: `Unknown slice '${sliceName}'` });
      return;
    }
    sendJson(res, 200, { name: sliceName, ...slice });
    return;
  }

  if (method === "GET" && url.pathname === "/dashboard/events") {
    deps.sseHub.attach(res);
    return;
  }

  if (method === "POST" && url.pathname === "/dashboard/refresh") {
    let body: Record<string, unknown> = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        code: "invalid-json",
        message: error instanceof Error ? error.message : "invalid JSON body"
      });
      return;
    }
    const requested = Array.isArray(body.slices)
      ? body.slices.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : listDashboardServiceSliceNames();
    try {
      const changed = await deps.refresher.refreshSlices(requested);
      sendJson(res, 200, {
        ok: true,
        code: "dashboard-refreshed",
        changedSlices: changed,
        generation: deps.snapshotStore.getGeneration()
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: "dashboard-refresh-failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, code: "not-found", message: `No route for ${method} ${url.pathname}` });
}

export function wireDashboardServiceEvents(
  snapshotStore: DashboardSnapshotStore,
  sseHub: DashboardSseHub
): () => void {
  return snapshotStore.subscribe((event) => {
    if (event.type === "slice.updated" && event.slice) {
      sseHub.broadcast(toSseEvent(event));
      return;
    }
    if (event.type === "snapshot.updated") {
      sseHub.broadcast(toSseEvent(event));
    }
  });
}
