import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeDashboardServiceHealth } from "../dist/views/dashboard/service-dashboard-data-source.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Option 2 T100598–599: service data source + read path modules exist", () => {
  const serviceFiles = [
    ["dashboard-data-source.ts", /DashboardDataSource/],
    ["service-dashboard-data-source.ts", /ServiceDashboardDataSource/],
    ["dashboard-service-mapper.ts", /mapServiceSnapshotToDashboardSnapshot/],
    ["dashboard-service-store-sync.ts", /DashboardServiceStoreSync/],
    ["dashboard-read-path-coordinator.ts", /DashboardReadPathCoordinator/],
    ["resolve-dashboard-read-config.ts", /readConfiguredDashboardDataSourceMode/]
  ];
  for (const [file, pattern] of serviceFiles) {
    const src = readFileSync(path.join(__dirname, "../src/views/dashboard", file), "utf8");
    assert.match(src, pattern);
  }
});

test("Option 2 read path falls back to CLI live data when service is unhealthy", () => {
  const coordinatorSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-read-path-coordinator.ts"),
    "utf8"
  );
  const serviceModeBlock = coordinatorSrc.slice(
    coordinatorSrc.indexOf('if (effectiveMode === "service")'),
    coordinatorSrc.indexOf("// Auto mode: attempt to start service once per session.")
  );
  assert.match(serviceModeBlock, /startCliBootstrapPath/);
  assert.doesNotMatch(serviceModeBlock, /this\.activePath = null/);

  const badgeSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/dashboard-read-mode-badge.ts"),
    "utf8"
  );
  assert.match(badgeSrc, /Using CLI polling for live data/);
});

test("Option 2 health probe times out and reports unhealthy service", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-o2-health-timeout-"));
  const serviceDir = path.join(workspace, ".workspace-kit", "dashboard-service");
  await mkdir(serviceDir, { recursive: true });

  const server = createServer((_req, _res) => {
    // Intentionally leave the request open; this models a wedged warm service.
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  await writeFile(
    path.join(serviceDir, "runtime.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      host: "127.0.0.1",
      port: address.port,
      startedAt: "2026-06-30T00:00:00.000Z",
      serviceVersion: "test",
      generation: 1,
      planningGeneration: null
    })}\n`,
    "utf8"
  );

  try {
    const started = Date.now();
    const healthy = await probeDashboardServiceHealth(workspace, { requestTimeoutMs: 50 });
    assert.equal(healthy, false);
    assert.ok(Date.now() - started < 1_000);
  } finally {
    server.close();
  }
});
