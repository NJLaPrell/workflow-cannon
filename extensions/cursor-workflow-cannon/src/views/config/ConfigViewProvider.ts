import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  configMutationOutcomeToWebviewPayload,
  handleConfigMutationResult
} from "./config-mutation-result.js";
import { loadConfigKeyRows } from "./load-config-key-rows.js";
import { renderConfigListInnerHtml } from "./render-config.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";

export class ConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.config";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>
  ) {
    onKitStateChanged(() => {
      void this.notifyRefresh();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webview.html = this.buildHtmlShell(webview);
    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "load") {
        const includeAll = Boolean(msg.includeAll);
        await this.pushConfigList(webview, includeAll);
      }
      if (msg?.type === "explain" && typeof msg.key === "string") {
        const r = await this.client.run("explain-config", { path: msg.key.trim() });
        await webview.postMessage({ type: "explainResult", payload: r });
      }
      if (msg?.type === "validate") {
        const r = await this.client.config(["validate"]);
        await webview.postMessage({
          type: "validateResult",
          payload: { code: r.code, text: r.stdout + (r.stderr ? "\n" + r.stderr : "") }
        });
      }
      if (msg?.type === "reloadWindow") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
        return;
      }
      if (msg?.type === "set" && typeof msg.key === "string" && typeof msg.value === "string") {
        const includeAll = Boolean(msg.reloadIncludeAll);
        const key = msg.key.trim();
        const scope = msg.scope === "user" ? "user" : "project";
        const r = await this.client.config(["set", "--scope", scope, key, msg.value]);
        const { rows } = await loadConfigKeyRows(this.client, { includeAll });
        const row = rows.find((x) => x.key === key) ?? null;
        const outcome = handleConfigMutationResult(row, r, "set");
        if (outcome.statusKind === "ok") {
          await this.pushConfigList(webview, includeAll);
        }
        await webview.postMessage({
          type: "configMutationResult",
          payload: configMutationOutcomeToWebviewPayload(outcome, r.code)
        });
      }
      if (msg?.type === "unset" && typeof msg.key === "string") {
        const includeAll = Boolean(msg.reloadIncludeAll);
        const key = msg.key.trim();
        const scope = msg.scope === "user" ? "user" : "project";
        const r = await this.client.config(["unset", "--scope", scope, key]);
        const { rows } = await loadConfigKeyRows(this.client, { includeAll });
        const row = rows.find((x) => x.key === key) ?? null;
        const outcome = handleConfigMutationResult(row, r, "unset");
        if (outcome.statusKind === "ok") {
          await this.pushConfigList(webview, includeAll);
        }
        await webview.postMessage({
          type: "configMutationResult",
          payload: configMutationOutcomeToWebviewPayload(outcome, r.code)
        });
      }
    });
  }

  private async pushConfigList(webview: vscode.Webview, includeAll: boolean): Promise<void> {
    const { rows, errors } = await loadConfigKeyRows(this.client, { includeAll });
    const html = renderConfigListInnerHtml(rows);
    await webview.postMessage({
      type: "setList",
      html,
      error: errors.length ? errors.join("\n") : undefined,
      includeAll
    });
  }

  private async notifyRefresh(): Promise<void> {
    if (this.view) {
      await this.view.webview.postMessage({ type: "poke" });
    }
  }

  private buildHtmlShell(webview: vscode.Webview): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");
    const bootstrap = `(function(){
  var vscode = acquireVsCodeApi();
  var listRoot = document.getElementById('config-list-root');
  var statusEl = document.getElementById('cfg-status');
  var restartHost = document.getElementById('cfg-restart-host');
  var maintainerEl = document.getElementById('cfg-maintainer');
  function showStatus(kind, text) {
    if (!statusEl) return;
    statusEl.className = 'cfg-status cfg-status-' + (kind || 'info');
    statusEl.textContent = text || '';
  }
  function currentIncludeAll() {
    return maintainerEl && maintainerEl.checked;
  }
  function requestLoad() {
    vscode.postMessage({ type: 'load', includeAll: currentIncludeAll() });
  }
  function applyFilter() {
    var q = (document.getElementById('cfg-filter') && document.getElementById('cfg-filter').value || '').trim().toLowerCase();
    if (!listRoot) return;
    listRoot.querySelectorAll('.cfg-row').forEach(function(row) {
      var hay = row.getAttribute('data-search') || '';
      row.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
    });
  }
  function readRowValue(details) {
    var kind = details.getAttribute('data-editor-kind') || 'json';
    if (kind === 'toggle') {
      var cb = details.querySelector('input[data-role="value"][type="checkbox"]');
      if (!cb) return null;
      return JSON.stringify(cb.checked);
    }
    if (kind === 'select') {
      var selVal = details.querySelector('select[data-role="value"]');
      if (!selVal) return null;
      return selVal.value;
    }
    if (kind === 'text') {
      var txt = details.querySelector('input[data-role="value"][data-value-kind="text"]');
      if (!txt) return null;
      return JSON.stringify(txt.value);
    }
    if (kind === 'number') {
      var num = details.querySelector('input[data-role="value"][data-value-kind="number"]');
      if (!num || num.value === '') return null;
      return JSON.stringify(Number(num.value));
    }
    var ta = details.querySelector('textarea[data-role="value"]');
    return ta ? ta.value : null;
  }
  function rowContext(btn) {
    var d = btn.closest('details');
    if (!d) return null;
    var sc = d.querySelector('select[data-role="scope"]');
    var key = btn.getAttribute('data-key');
    var value = readRowValue(d);
    if (!key || value == null) return null;
    return { key: key, value: value, scope: sc && sc.value ? sc.value : 'project', editorKind: d.getAttribute('data-editor-kind') || 'json' };
  }
  document.getElementById('cfg-refresh') && document.getElementById('cfg-refresh').addEventListener('click', requestLoad);
  document.getElementById('cfg-validate') && document.getElementById('cfg-validate').addEventListener('click', function() {
    vscode.postMessage({ type: 'validate' });
  });
  maintainerEl && maintainerEl.addEventListener('change', requestLoad);
  document.getElementById('cfg-filter') && document.getElementById('cfg-filter').addEventListener('input', applyFilter);
  if (listRoot) {
    listRoot.addEventListener('click', function(ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'BUTTON') return;
      var act = t.getAttribute('data-wc-action');
      if (!act) return;
      ev.preventDefault();
      if (act === 'config-explain') {
        var ek = t.getAttribute('data-key');
        if (ek) vscode.postMessage({ type: 'explain', key: ek });
        return;
      }
      if (act === 'config-save') {
        var c = rowContext(t);
        if (!c) return;
        if (c.editorKind === 'json') {
          try { JSON.parse(c.value); } catch (e) {
            showStatus('err', 'Value must be valid JSON before Apply.');
            return;
          }
        }
        vscode.postMessage({
          type: 'set',
          key: c.key,
          value: c.value,
          scope: c.scope,
          reloadIncludeAll: currentIncludeAll()
        });
        return;
      }
      if (act === 'config-unset') {
        var c2 = rowContext(t);
        if (!c2) return;
        if (!confirm('Unset ' + c2.key + ' on layer ' + c2.scope + '?')) return;
        vscode.postMessage({
          type: 'unset',
          key: c2.key,
          scope: c2.scope,
          reloadIncludeAll: currentIncludeAll()
        });
      }
      if (act === 'config-reload-window') {
        vscode.postMessage({ type: 'reloadWindow' });
      }
    });
  }
  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'poke') {
      requestLoad();
      return;
    }
    if (m && m.type === 'setList') {
      if (listRoot && typeof m.html === 'string') {
        var open = {};
        listRoot.querySelectorAll('details[data-wc-track]').forEach(function(d) {
          var k = d.getAttribute('data-wc-track');
          if (k && d.open) open[k] = true;
        });
        listRoot.innerHTML = m.html;
        Object.keys(open).forEach(function(k) {
          var el = listRoot.querySelector('details[data-wc-track="' + k + '"]');
          if (el) el.open = true;
        });
        applyFilter();
      }
      var n = listRoot ? listRoot.querySelectorAll('.cfg-row').length : 0;
      if (m.error) {
        showStatus('warn', m.error + '\\n\\n(' + n + ' keys shown; list or resolve may be incomplete.)');
      } else {
        showStatus('info', n + ' keys · expand a row to view or edit one value at a time.');
      }
      return;
    }
    if (m && m.type === 'explainResult') {
      showStatus('info', JSON.stringify(m.payload, null, 2));
      return;
    }
    if (m && m.type === 'validateResult') {
      showStatus(m.payload.code === 0 ? 'ok' : 'err', 'validate exit ' + m.payload.code + '\\n' + m.payload.text);
      return;
    }
    if (m && m.type === 'configMutationResult') {
      var p = m.payload || {};
      showStatus(p.statusKind || (p.code === 0 ? 'ok' : 'err'), p.statusText || '');
      if (restartHost) {
        restartHost.innerHTML = p.restartBannerHtml || '';
      }
      if (p.restartHint && p.restartHint.key) {
        vscode.postMessage({ type: 'configRestartHint', key: p.restartHint.key, label: p.restartHint.label || p.restartHint.key });
      }
      return;
    }
    if ((m && m.type === 'setResult') || (m && m.type === 'unsetResult')) {
      var p2 = m.payload;
      showStatus(p2.code === 0 ? 'ok' : 'err', 'exit ' + p2.code + '\\n' + p2.text);
    }
  });
  requestLoad();
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    ${WC_BASE_CSS}
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 12px; margin: 0; }
    .cfg-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .cfg-toolbar label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .cfg-filter { flex: 1; min-width: 120px; padding: 4px 6px; box-sizing: border-box; }
    .cfg-status { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px 8px; margin-bottom: 8px; border-radius: 2px; }
    .cfg-status-info { background: var(--vscode-textCodeBlock-background); }
    .cfg-status-ok { background: rgba(0, 160, 0, 0.15); }
    .cfg-status-warn { background: rgba(200, 150, 0, 0.2); }
    .cfg-status-err { background: rgba(200, 60, 60, 0.2); }
    .cfg-muted { opacity: 0.8; margin: 8px 0; }
    .cfg-sections { display: flex; flex-direction: column; gap: 16px; }
    .cfg-section-heading { font-size: 13px; font-weight: 600; margin: 0 0 8px; opacity: 0.95; }
    .cfg-rows { display: flex; flex-direction: column; gap: 4px; }
    .cfg-details { border: 1px solid var(--vscode-widget-border); border-radius: 2px; background: var(--vscode-editor-background); }
    .cfg-summary { cursor: pointer; padding: 6px 8px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .cfg-summary::-webkit-details-marker { display: none; }
    .cfg-key { font-weight: 600; }
    .cfg-type { opacity: 0.85; font-size: 11px; }
    .cfg-preview { flex: 1; min-width: 120px; font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.9; text-align: right; }
    .cfg-pill { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .cfg-pill-warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
    .cfg-body { padding: 0 8px 10px; border-top: 1px solid var(--vscode-widget-border); }
    .cfg-desc { margin: 8px 0; line-height: 1.35; }
    .cfg-meta { margin: 0; font-size: 11px; }
    .cfg-meta dt { font-weight: 600; margin-top: 6px; }
    .cfg-meta dd { margin: 2px 0 0 12px; }
    .cfg-label { display: block; margin-top: 8px; font-weight: 600; }
    .cfg-textarea { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px; margin-top: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .cfg-input { width: 100%; max-width: 420px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 11px; padding: 6px; margin-top: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .cfg-value-select { max-width: 420px; width: 100%; }
    .cfg-toggle-wrap { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-weight: normal; }
    .cfg-toggle { margin: 0; }
    .cfg-restart-banner { padding: 8px 10px; margin-bottom: 8px; border-radius: 2px; background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); }
    .cfg-restart-banner p { margin: 0 0 8px; }
    .cfg-select { margin-top: 4px; padding: 4px; max-width: 200px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-widget-border); }
    .cfg-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
    .cfg-row-btns { margin-top: 6px; }
    .cfg-footnote { font-size: 11px; opacity: 0.8; margin-top: 10px; line-height: 1.4; }
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  </style>
</head>
<body>
  <div class="cfg-toolbar">
    <button type="button" class="wc-btn wc-btn-md wc-btn-primary" id="cfg-refresh">Reload</button>
    <button type="button" class="wc-btn wc-btn-md wc-btn-secondary" id="cfg-validate">Validate</button>
    <input type="search" class="cfg-filter" id="cfg-filter" placeholder="Filter keys / description…" />
    <label><input type="checkbox" id="cfg-maintainer" /> Maintainer keys</label>
  </div>
  <div id="cfg-status" class="cfg-status cfg-status-info" role="status"></div>
  <div id="cfg-restart-host"></div>
  <div id="config-list-root"></div>
  <p class="cfg-footnote"><strong>Mutations</strong> run <code>workspace-kit config set|unset</code>. Sensitive keys and keys that require approval need <code>WORKSPACE_KIT_POLICY_APPROVAL</code> in the environment for the kit process (see <code>.ai/POLICY-APPROVAL.md</code> in the repo).</p>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}

