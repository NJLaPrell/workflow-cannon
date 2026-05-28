import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDashboardWebviewBootstrapScript } from "../dist/views/dashboard/dashboard-webview-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("buildDashboardWebviewBootstrapScript returns drawer + refresh client", () => {
  const script = buildDashboardWebviewBootstrapScript(JSON.stringify("(function(){})();"));
  assert.doesNotMatch(script, /drawerSubmitInFlight/);
  assert.match(script, /wcReplaceRoot/);
  assert.match(script, /applyWcDrawerState/);
  assert.match(script, /applyHostSnapshot/);
  assert.match(script, /wcHostSnapshot/);
  assert.match(script, /wcReinitEmbeddedCae/);
  assert.match(script, /type: 'createIdea'/);
  assert.match(script, /type: 'updateIdea'/);
  assert.match(script, /type: 'deleteIdea'/);
  assert.match(script, /type:'undoDeleteIdea'/);
  assert.match(script, /wcIdeaCreateResult/);
  assert.match(script, /wcIdeaMutationResult/);
  assert.match(script, /data-wc-idea-title/);
  assert.match(script, /idea-undo-delete/);
  assert.doesNotMatch(readFileSync(path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"), "utf8"), /function setDrawerBusy\(busy, label\)/);
});

test("DashboardViewProvider buildHtml delegates to dashboard webview client", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(providerSrc, /buildDashboardWebviewBootstrapScript/);
});
