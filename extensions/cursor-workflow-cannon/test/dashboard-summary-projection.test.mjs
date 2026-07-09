import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerPath = path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts");

test("DashboardViewProvider overview hydration skips heavy kit fetches (T100396)", () => {
  const src = fs.readFileSync(providerPath, "utf8");
  assert.match(src, /skipHeavyFetches/);
  assert.match(src, /projection:\s*"overview"/);
  assert.match(src, /requestDashboardStartup|executeDashboardStartupBootstrap/);
  assert.match(src, /runDashboardSummary/);
});
