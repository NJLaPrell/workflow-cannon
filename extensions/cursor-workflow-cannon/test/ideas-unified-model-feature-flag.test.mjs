/**
 * T100869 — extension/server unified-model flag modules stay aligned (no vscode runtime).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverFlagPath = path.join(
  root,
  "src/modules/planning/idea-plan/ideas-unified-model-feature-flag.ts"
);
const extensionFlagPath = path.join(
  root,
  "extensions/cursor-workflow-cannon/src/ideas-unified-model-feature-flag.ts"
);

const serverSrc = readFileSync(serverFlagPath, "utf8");
const extensionSrc = readFileSync(extensionFlagPath, "utf8");

test("server and extension flag modules share env var and default-on cutover", () => {
  assert.match(serverSrc, /IDEAS_UNIFIED_MODEL_ENV_VAR = "IDEAS_UNIFIED_MODEL_ENABLED"/);
  assert.match(extensionSrc, /IDEAS_UNIFIED_MODEL_ENV_VAR = "IDEAS_UNIFIED_MODEL_ENABLED"/);
  assert.match(serverSrc, /return \{ enabled: true, source: "default" \}/);
  assert.match(extensionSrc, /return true;/);
  assert.match(serverSrc, /kill-switch|emergency kill-switch/i);
  assert.match(extensionSrc, /kill-switch|default true/i);
});

test("server and extension flag modules share env falsy kill-switch tokens", () => {
  for (const token of ['"0"', '"false"', '"no"', '"off"']) {
    assert.match(serverSrc, new RegExp(token));
    assert.match(extensionSrc, new RegExp(token));
  }
});
