import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Option 2 T100598: service data source + store sync modules exist", () => {
  for (const file of [
    "dashboard-data-source.ts",
    "service-dashboard-data-source.ts",
    "dashboard-service-mapper.ts",
    "dashboard-service-store-sync.ts"
  ]) {
    const src = readFileSync(path.join(__dirname, "../src/views/dashboard", file), "utf8");
    assert.match(src, /DashboardDataSource|ServiceDashboardDataSource|DashboardServiceStoreSync/);
  }
});
