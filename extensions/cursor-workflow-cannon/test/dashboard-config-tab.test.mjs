import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderDashboardRootInnerHtml } from "../dist/views/dashboard/render-dashboard.js";
import { renderConfigPanelShellHtml } from "../dist/views/config/config-panel-shell.js";
import { buildConfigWebviewBootstrapScript } from "../dist/views/config/config-webview-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** DOM contract for Dashboard → Config tab (T100388). */
test("dashboard Config tabpanel contract: list root, toolbar ids, shared client", () => {
  const fixturePath = path.join(__dirname, "../docs/fixtures/dashboard-summary.example.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const html = renderDashboardRootInnerHtml(fixture);
  const idx = html.indexOf('<div class="wc-tab-panel" data-wc-tab="config"');
  assert.ok(idx >= 0);
  const panel = html.slice(idx);
  assert.match(panel, /id="config-list-root"/);
  assert.match(panel, /id="cfg-refresh"/);
  assert.match(panel, /id="cfg-validate"/);
  assert.match(panel, /id="cfg-filter"/);
  assert.match(panel, /id="cfg-maintainer"/);
  assert.match(panel, /id="cfg-explain-panel"/);
  assert.match(panel, /id="cfg-explain-host"/);
  assert.match(panel, /cfg-explain-panel-title/);
  assert.doesNotMatch(panel, /sidebar panel \(activity bar\)/i);
  assert.doesNotMatch(panel, /use the Config sidebar/i);
});

test("renderConfigPanelShellHtml aligns with dashboard embed", () => {
  assert.equal(renderConfigPanelShellHtml().includes('id="config-list-root"'), true);
});

test("shared config webview client is suitable for dashboard host script tag", () => {
  const script = buildConfigWebviewBootstrapScript({ autoLoad: false });
  assert.match(script, /wcConfigTab/);
  assert.match(script, /config-jump-key/);
  assert.match(script, /config-retry/);
  assert.match(script, /config-explain/);
  assert.match(script, /#config-list-root/);
  assert.match(script, /cfg-dirty-pill/);
  assert.match(script, /validateKey/);
  assert.match(script, /configRowPatched/);
});

test("dashboard root click handler delegates config-jump-key to wcConfigTab", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  const idx = providerSrc.indexOf("var act = t.getAttribute('data-wc-action');");
  assert.ok(idx >= 0);
  const block = providerSrc.slice(idx, idx + 520);
  assert.match(block, /indexOf\('config-'\)/);
  assert.match(block, /wcConfigTab\.jumpToConfigKey/);
  assert.match(block, /config-explain/);
  const preventIdx = block.indexOf("ev.preventDefault()");
  const configIdx = block.indexOf("config-jump-key");
  assert.ok(configIdx >= 0 && preventIdx >= 0);
  assert.ok(preventIdx < configIdx, "config actions use preventDefault before jump/explain");
});

test("dashboard bootstrap preserves config tab across wcReplaceRoot", () => {
  const providerSrc = readFileSync(
    path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
    "utf8"
  );
  assert.match(providerSrc, /captureConfigTabState/);
  assert.match(providerSrc, /restoreConfigTabState/);
  assert.match(providerSrc, /scheduleConfigTabRefresh/);
  assert.doesNotMatch(providerSrc, /void this\.refreshDashboardConfigTab\(webview\)/);
});
