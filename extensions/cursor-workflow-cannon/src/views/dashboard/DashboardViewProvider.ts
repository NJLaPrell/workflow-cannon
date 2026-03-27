import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.dashboard";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>
  ) {
    onKitStateChanged(() => {
      void this.pushUpdate();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.html();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "refresh") {
        await this.pushUpdate();
      }
      if (msg?.type === "validateConfig") {
        await vscode.commands.executeCommand("workflowCannon.validateConfig");
      }
      if (msg?.type === "openTasks") {
        await vscode.commands.executeCommand("workbench.view.extension.workflow-cannon");
        await vscode.commands.executeCommand("workflowCannon.refreshTasks");
      }
      if (msg?.type === "openConfig") {
        await vscode.commands.executeCommand("workbench.view.extension.workflow-cannon");
        await vscode.commands.executeCommand("workflowCannon.validateConfig");
      }
    });
    void this.pushUpdate();
  }

  refresh(): void {
    void this.pushUpdate();
  }

  private async pushUpdate(): Promise<void> {
    if (!this.view) {
      return;
    }
    const raw = await this.client.run("dashboard-summary", {});
    await this.view.webview.postMessage({ type: "dashboard", payload: raw });
  }

  private html(): string {
    const csp = ["default-src 'none'", "style-src 'unsafe-inline'", "script-src 'unsafe-inline'"].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 12px; }
    h1 { font-size: 1.1em; margin: 0 0 8px; }
    .muted { opacity: 0.75; }
    pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; }
    button { margin-top: 8px; padding: 4px 8px; cursor: pointer; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .bad { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <h1>Dashboard</h1>
  <p class="muted">Data from <code>workspace-kit run dashboard-summary</code> — no direct file reads.</p>
  <div id="root">Loading…</div>
  <div>
    <button id="btn">Refresh</button>
    <button id="validate">Validate Config</button>
    <button id="tasks">Open Tasks</button>
    <button id="config">Open Config</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const btn = document.getElementById('btn');
    const validate = document.getElementById('validate');
    const tasks = document.getElementById('tasks');
    const config = document.getElementById('config');
    btn.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    validate.addEventListener('click', () => vscode.postMessage({ type: 'validateConfig' }));
    tasks.addEventListener('click', () => vscode.postMessage({ type: 'openTasks' }));
    config.addEventListener('click', () => vscode.postMessage({ type: 'openConfig' }));
    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (msg?.type !== 'dashboard') return;
      const p = msg.payload;
      if (!p) { root.textContent = 'No payload'; return; }
      if (!p.ok) {
        const guidance = p.code === 'policy-denied'
          ? '\\n\\nPolicy denied: provide policyApproval rationale/session scope where required.'
          : '';
        root.innerHTML = '<pre class="bad">' + JSON.stringify(p, null, 2) + guidance + '</pre>';
        return;
      }
      const d = p.data || {};
      const ss = d.stateSummary || {};
      const sn = d.suggestedNext;
      const ws = d.workspaceStatus;
      root.innerHTML =
        '<p><b>Phase</b> ' + (ws?.currentKitPhase ?? '—') + '</p>' +
        '<p class="muted">' + escapeHtml(ws?.activeFocus || '') + '</p>' +
        '<p class="ok">Tasks · proposed ' + (ss.proposed ?? 0) +
        ' · ready ' + (ss.ready ?? 0) + ' · in progress ' + (ss.in_progress ?? 0) +
        ' · blocked ' + (ss.blocked ?? 0) +
        ' · done ' + (ss.completed ?? 0) + '</p>' +
        '<p><b>Suggested next</b> ' + (sn ? escapeHtml(sn.id + ' — ' + sn.title) : '—') + '</p>' +
        '<p class="muted">Store updated ' + escapeHtml(d.taskStoreLastUpdated || '') + '</p>';
    });
    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;
  }
}
