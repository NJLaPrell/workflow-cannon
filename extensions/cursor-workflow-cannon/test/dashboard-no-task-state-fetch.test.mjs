import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("dashboard view does not invoke task-state git fetch commands", () => {
  const dashboardSrc = fs.readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.doesNotMatch(dashboardSrc, /task-state-hydrate/);
  assert.doesNotMatch(dashboardSrc, /task-state-status/);
  assert.doesNotMatch(dashboardSrc, /apply-task-state-events/);
});
