import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
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

  it("T100612: warm getSnapshot completes within 1 second", async () => {
    const fetchFn = async (url) => {
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/dashboard/snapshot")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serviceVersion: "0.99.21",
            generatedAt: "2026-05-30T03:00:00.000Z",
            generation: 2,
            planningGeneration: 42,
            slices: {}
          }),
          { status: 200 }
        );
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
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) {
      await ds.getSnapshot();
    }
    const elapsedMs = performance.now() - t0;
    await ds.stop();
    assert.ok(elapsedMs < 1000, `warm getSnapshot too slow: ${Math.round(elapsedMs)} ms`);
  });

  it("T100614: reconnects SSE after stream ends (service restart)", async () => {
    let sseConnections = 0;
    const events = [];

    const fetchFn = async (url) => {
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/dashboard/snapshot")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serviceVersion: "0.99.21",
            generatedAt: "2026-05-30T03:00:00.000Z",
            generation: 2,
            planningGeneration: 42,
            slices: {}
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/dashboard/events")) {
        sseConnections += 1;
        const connection = sseConnections;
        const stream = new ReadableStream({
          start(controller) {
            if (connection === 1) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    type: "dashboard.slice.updated",
                    generation: 1,
                    slice: "overview",
                    updatedAt: "2026-05-30T03:00:01.000Z"
                  })}\n\n`
                )
              );
              queueMicrotask(() => controller.close());
              return;
            }
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  type: "dashboard.slice.updated",
                  generation: 2,
                  slice: "queue",
                  updatedAt: "2026-05-30T03:00:02.000Z"
                })}\n\n`
              )
            );
          }
        });
        return new Response(stream, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const ds = new ServiceDashboardDataSource({
      workspacePath: "/tmp/wk",
      fetchFn,
      sseReconnectDelayMs: 20,
      readRuntimeFile: async () => JSON.stringify(RUNTIME)
    });

    ds.subscribe((event) => {
      events.push(event);
    });

    await ds.start();

    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("reconnect timeout")), 3000);
      const check = () => {
        if (events.length >= 2 && sseConnections >= 2) {
          clearTimeout(deadline);
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      check();
    });

    await ds.stop();

    assert.equal(sseConnections >= 2, true, `expected reconnect, got ${sseConnections} connections`);
    assert.equal(events.length >= 2, true);
    assert.equal(events[0].slice, "overview");
    assert.equal(events[1].slice, "queue");
  });

  it("normalizes agentActivity.updated SSE events to the agentActivity slice contract", async () => {
    const events = [];
    const fetchFn = async (url) => {
      if (url.endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/dashboard/snapshot")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            serviceVersion: "0.99.21",
            generatedAt: "2026-05-30T03:00:00.000Z",
            generation: 2,
            planningGeneration: 42,
            slices: {}
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/dashboard/events")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  type: "agentActivity.updated",
                  generation: 3,
                  updatedAt: "2026-05-30T03:00:01.000Z"
                })}\n\n`
              )
            );
            queueMicrotask(() => controller.close());
          }
        });
        return new Response(stream, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const ds = new ServiceDashboardDataSource({
      workspacePath: "/tmp/wk",
      fetchFn,
      sseReconnectDelayMs: 20,
      readRuntimeFile: async () => JSON.stringify(RUNTIME)
    });

    ds.subscribe((event) => {
      events.push(event);
    });

    await ds.start();

    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("agentActivity SSE timeout")), 2000);
      const check = () => {
        if (events.length >= 1) {
          clearTimeout(deadline);
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      check();
    });

    await ds.stop();

    assert.equal(events[0].type, "dashboard.slice.updated");
    assert.equal(events[0].slice, "agentActivity");
  });
});
