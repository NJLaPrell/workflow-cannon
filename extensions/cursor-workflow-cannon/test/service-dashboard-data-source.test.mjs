import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceDashboardDataSource } from "../dist/views/dashboard/service-dashboard-data-source.js";

const RUNTIME = {
  schemaVersion: 1,
  pid: 999,
  host: "127.0.0.1",
  port: 8765,
  startedAt: "2026-05-30T03:00:00.000Z",
  serviceVersion: "0.99.19",
  generation: 1,
  planningGeneration: 42
};

describe("ServiceDashboardDataSource", () => {
  it("start/getSnapshot/refreshSlice use runtime.json base URL", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/dashboard/snapshot")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serviceVersion: "0.99.19",
            generatedAt: "2026-05-30T03:00:00.000Z",
            generation: 2,
            planningGeneration: 42,
            slices: {}
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/dashboard/refresh")) {
        return new Response(JSON.stringify({ ok: true, changedSlices: ["overview"] }), {
          status: 200
        });
      }
      if (url.endsWith("/dashboard/events")) {
        return new Response(new ReadableStream(), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const ds = new ServiceDashboardDataSource({
      workspacePath: "/tmp/wk",
      fetchFn,
      readRuntimeFile: async () => JSON.stringify(RUNTIME)
    });

    await ds.start();
    const snap = await ds.getSnapshot();
    assert.equal(snap.planningGeneration, 42);
    await ds.refreshSlice("overview");
    await ds.stop();

    assert.ok(calls.some((c) => c.url.includes("/health")));
    assert.ok(calls.some((c) => c.url.includes("/dashboard/snapshot")));
    assert.ok(calls.some((c) => c.url.includes("/dashboard/refresh")));
  });
});
