import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderDashboardShellInnerHtml,
  DASHBOARD_SECTION_REGISTRY
} from "../dist/views/dashboard/render-dashboard-shell.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src/views/dashboard");

test("renderDashboardShellInnerHtml paints tab chrome without dashboard-summary payload", () => {
  const html = renderDashboardShellInnerHtml();
  assert.match(html, /wc-dashboard-tab-shell/);
  assert.match(html, /data-wc-tab="overview"/);
  assert.match(html, /data-wc-tab="task-engine"/);
  assert.match(html, /data-wc-tab="status"/);
  assert.match(html, /data-wc-tab="config"/);
  assert.match(html, /data-wc-tab="cae"/);
  assert.doesNotMatch(html, /stateSummary/);
});

test("renderDashboardShellInnerHtml includes loading placeholders for every registry section", () => {
  const html = renderDashboardShellInnerHtml();
  for (const section of DASHBOARD_SECTION_REGISTRY) {
    assert.match(
      html,
      new RegExp(`data-wc-section="${section.id}"`),
      `missing placeholder for ${section.id}`
    );
    assert.match(
      html,
      new RegExp(`wc-dash-section--loading`),
      `section ${section.id} should start loading`
    );
  }
});

test("dashboard section registry lists overview, queue, phase journal, status, config, cae", () => {
  assert.equal(DASHBOARD_SECTION_REGISTRY.length, 6);
  const ids = DASHBOARD_SECTION_REGISTRY.map((s) => s.id).sort();
  assert.deepEqual(ids, ["cae", "config", "overview", "phase-journal", "queue", "status"]);
});

test("DashboardViewProvider paints shell before pushUpdate (T100395)", () => {
  const providerPath = path.join(srcDir, "DashboardViewProvider.ts");
  const src = fs.readFileSync(providerPath, "utf8");
  assert.match(src, /renderDashboardShellInnerHtml\(\)/);
  assert.match(src, /shell painted synchronously/);
  const resolveBlock = src.slice(src.indexOf("resolveWebviewView("));
  const pushIdx = resolveBlock.indexOf("void this.pushUpdate()");
  const shellIdx = resolveBlock.indexOf("renderDashboardShellInnerHtml()");
  assert.ok(shellIdx >= 0 && pushIdx >= 0 && shellIdx < pushIdx, "shell must render before pushUpdate");
});

test("dashboard webview bootstrap handles wcSectionPatch with interaction-lock queue", () => {
  const clientPath = path.join(srcDir, "dashboard-webview-client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  assert.match(src, /wcSectionPatch/);
  assert.match(src, /applySectionPatch/);
  assert.match(src, /pendingSectionPatches/);
});

test("dashboard ui interaction locks defer wcSectionPatch like wcReplaceRoot", () => {
  const clientPath = path.join(srcDir, "dashboard-webview-client.ts");
  const src = fs.readFileSync(clientPath, "utf8");
  const patchHandler = src.slice(src.indexOf("m.type === 'wcSectionPatch'"));
  assert.match(patchHandler, /isLocalUiLocked\(\)/);
  assert.match(patchHandler, /pendingSectionPatches/);
});
