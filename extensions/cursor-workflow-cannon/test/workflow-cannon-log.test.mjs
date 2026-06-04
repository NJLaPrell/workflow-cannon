import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("CommandClient supports optional kit run trace hooks", () => {
  const src = readFileSync(path.join(__dirname, "../src/runtime/command-client.ts"), "utf8");
  assert.match(src, /onKitRunStart/);
  assert.match(src, /onKitRunEnd/);
  assert.doesNotMatch(src, /from "\.\/workflow-cannon-log\.js"/);
});

test("summarizeKitRunArgs extracts common run fields", async () => {
  const mod = await import("../dist/runtime/kit-run-log-format.js");
  assert.match(mod.summarizeKitRunArgs({ taskId: "T1", action: "accept", phaseKey: "109" }), /taskId=T1/);
  assert.match(mod.summarizeKitRunArgs({ taskId: "T1", action: "accept", phaseKey: "109" }), /phaseKey=109/);
});

test("formatKitRunEndLine marks refresh pause as paused instead of FAIL", async () => {
  const mod = await import("../dist/runtime/kit-run-log-format.js");
  const line = mod.formatKitRunEndLine("dashboard-summary", Date.now(), {
    ok: false,
    code: "extension-refresh-paused",
    message: "Dashboard refresh paused while a mutating drawer action runs"
  });
  assert.match(line, / paused extension-refresh-paused/);
  assert.doesNotMatch(line, / FAIL /);
});
