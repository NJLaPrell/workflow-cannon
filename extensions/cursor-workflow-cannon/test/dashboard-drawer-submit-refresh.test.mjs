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

const drawerSubmitBlock = providerSrc.slice(
  providerSrc.indexOf("private async handleDrawerSubmit"),
  providerSrc.indexOf('/**\n   * Dashboard "Phase" row action')
);

test("handleDrawerSubmit does not call notifyKitStateChanged", () => {
  assert.doesNotMatch(drawerSubmitBlock, /this\.notifyKitStateChanged/);
});

test("close-subagent-session uses targeted invalidation without coordinator refresh", () => {
  const block = drawerSubmitBlock.slice(
    drawerSubmitBlock.indexOf('session.kind === "close-subagent-session"'),
    drawerSubmitBlock.indexOf('session.kind === "retire-subagent"')
  );
  assert.match(block, /applyDashboardMutationInvalidation\("task-queue"\)/);
  assert.match(block, /return false/);
});

test("create-checkpoint relies on coordinator light refresh not pushUpdate", () => {
  const block = drawerSubmitBlock.slice(
    drawerSubmitBlock.indexOf('session.kind === "create-checkpoint"'),
    drawerSubmitBlock.indexOf('session.kind === "rewind-checkpoint"')
  );
  assert.doesNotMatch(block, /pushUpdate/);
  assert.match(block, /return true/);
});
