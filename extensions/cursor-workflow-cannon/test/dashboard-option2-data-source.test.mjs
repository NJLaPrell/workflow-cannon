import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
