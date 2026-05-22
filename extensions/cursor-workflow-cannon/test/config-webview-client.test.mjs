import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConfigWebviewBootstrapScript,
  CONFIG_WEBVIEW_STYLES
} from "../dist/views/config/config-webview-client.js";
import { renderConfigPanelShellHtml } from "../dist/views/config/config-panel-shell.js";

test("buildConfigWebviewBootstrapScript shares vscode API with dashboard host", () => {
  const script = buildConfigWebviewBootstrapScript();
  assert.match(script, /__wfcVscode/);
  assert.doesNotMatch(script, /var vscode = acquireVsCodeApi\(\)/);
});

test("buildConfigWebviewBootstrapScript includes typed editor and mutation handlers", () => {
  const script = buildConfigWebviewBootstrapScript();
  assert.match(script, /readRowValue/);
  assert.match(script, /jumpToConfigKey/);
  assert.match(script, /configMutationResult/);
  assert.match(script, /data-editor-kind/);
  assert.match(script, /cfg-section/);
  assert.match(script, /wcConfigTab/);
});

test("buildConfigWebviewBootstrapScript autoLoad can be disabled for dashboard", () => {
  const script = buildConfigWebviewBootstrapScript({ autoLoad: false });
  assert.doesNotMatch(script, /requestLoad\(\);\s*\}\)\(\)/);
});

test("buildConfigWebviewBootstrapScript debounces poke and skips duplicate setList html", () => {
  const script = buildConfigWebviewBootstrapScript();
  assert.match(script, /requestLoadDebounced/);
  assert.match(script, /lastConfigListHtml/);
});

test("renderConfigPanelShellHtml exposes config-list-root and toolbar ids", () => {
  const html = renderConfigPanelShellHtml();
  assert.match(html, /id="config-list-root"/);
  assert.match(html, /id="cfg-refresh"/);
  assert.match(html, /id="cfg-validate"/);
  assert.match(html, /cfg-sections|config-list-root/);
  assert.doesNotMatch(html, /activity bar/i);
  assert.match(html, /cfg-quick-settings/);
  assert.match(html, /cfg-explain-host/);
  assert.match(html, /cfg-loading/);
  assert.match(html, /kit\.agentRole/);
});

test("CONFIG_WEBVIEW_STYLES includes section and typed control rules", () => {
  assert.match(CONFIG_WEBVIEW_STYLES, /\.cfg-section-heading/);
  assert.match(CONFIG_WEBVIEW_STYLES, /\.cfg-toggle/);
});
