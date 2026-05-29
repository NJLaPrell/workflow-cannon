import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionSrc = readFileSync(path.join(__dirname, "../src/extension.ts"), "utf8");
const listenerSrc = readFileSync(
  path.join(__dirname, "../src/runtime/git-task-state-sync-listener.ts"),
  "utf8"
);
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, "../package.json"), "utf8")
);

test("extension wires git HEAD listener when task-state sync is enabled", () => {
  assert.match(extensionSrc, /registerGitTaskStateSyncListener/);
  assert.match(extensionSrc, /taskStateSync\.start\(\)/);
});

test("git-task-state-sync-listener requests sync on HEAD change", () => {
  assert.match(listenerSrc, /registerGitTaskStateSyncListener/);
  assert.match(listenerSrc, /taskStateSync\.onGitHeadChange/);
  assert.match(listenerSrc, /requestSync\("git-head-changed"\)/);
});

test("package.json exposes taskStateSync.onGitHeadChange setting", () => {
  const setting = packageJson.contributes?.configuration?.properties?.[
    "workflowCannon.taskStateSync.onGitHeadChange"
  ];
  assert.ok(setting);
  assert.equal(setting.type, "boolean");
  assert.equal(setting.default, true);
});
