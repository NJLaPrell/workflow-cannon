import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);

test("DashboardViewProvider constructs DashboardCoordinator on resolveWebviewView", () => {
  assert.match(providerSrc, /initDashboardCoordinator/);
  assert.match(providerSrc, /new DashboardCoordinator/);
  assert.match(providerSrc, /wcHostSnapshot/);
  assert.match(providerSrc, /getDashboardCoordinator/);
});
