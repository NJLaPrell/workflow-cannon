import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import { renderStatusTabInnerHtml } from "./render-status-tab.js";

/** Debounce kit-file churn so we do not spawn overlapping `wk run dashboard-summary` calls. */
export const STATUS_PANEL_DEBOUNCE_MS = 450;

const VIEW_TYPE = "workflowCannon.statusDashboard";

export class StatusDashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshInFlight = false;
  private pendingRefresh = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>
  ) {
    onKitStateChanged(() => {
      this.scheduleRefresh(false);
    });
  }

  /** Open or focus the singleton panel. */
  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One, true);
      void this.runRefresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "Workflow Cannon — Status",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );
    this.panel = panel;
    panel.onDidDispose(() => {
      this.panel = undefined;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }
    });
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "refresh") {
        void this.runRefresh();
      }
    });
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        void this.runRefresh();
      }
    });
        void this.runRefresh();
  }

  private scheduleRefresh(immediate: boolean): void {
    if (!this.panel) {
      return;
    }
    if (immediate) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }
      void this.runRefresh();
      return;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.runRefresh();
    }, STATUS_PANEL_DEBOUNCE_MS);
  }

  private async runRefresh(): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) {
      return;
    }
    if (this.refreshInFlight) {
      this.pendingRefresh = true;
      return;
    }
    this.refreshInFlight = true;
    try {
      const raw = (await this.client.run("dashboard-summary", {})) as Record<string, unknown>;
      const folderLabel = vscode.workspace.workspaceFolders?.[0]?.name;
      const inner = renderStatusTabInnerHtml(raw, {
        editorWorkspaceFolderLabel: folderLabel
      });
      webview.html = this.wrapHtml(webview, inner);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      webview.html = this.wrapHtml(
        webview,
        '<div class="wc-status-error"><p><b>Extension error</b></p><p>' +
          msg.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
          "</p></div>"
      );
    } finally {
      this.refreshInFlight = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.runRefresh();
      }
    }
  }

  private wrapHtml(webview: vscode.Webview, inner: string): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");

    const bootstrap = `(function(){var vscode=acquireVsCodeApi();var b=document.getElementById("wc-refresh");if(b)b.addEventListener("click",function(){vscode.postMessage({type:"refresh"});});})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon Status</title>
  <style>
    html, body { margin: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px 24px;
      font-size: 13px;
      line-height: 1.45;
    }
    .wc-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
    }
    .wc-title { margin: 0; font-size: 15px; font-weight: 600; }
    #wc-refresh {
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
    }
    #wc-refresh:hover { background: var(--vscode-button-hoverBackground); }
    .wc-status-head { margin-bottom: 12px; }
    .wc-status-head .wc-title { font-size: 18px; }
    .wc-sub { margin: 4px 0 0; opacity: 0.8; font-size: 12px; }
    .wc-card {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      background: var(--vscode-sideBar-background);
    }
    .wc-card-title { margin: 0 0 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.85; }
    .wc-kv { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; margin: 6px 0; flex-wrap: wrap; }
    .wc-kv-label { opacity: 0.85; flex: 1; min-width: 120px; }
    .wc-kv-val { font-weight: 500; text-align: right; word-break: break-word; max-width: 65%; }
    .wc-muted { opacity: 0.75; }
    .wc-hint { font-size: 11px; opacity: 0.75; margin: 8px 0 0; }
    .wc-ok { color: var(--vscode-testing-iconPassed); }
    .wc-bad { color: var(--vscode-errorForeground); }
    .wc-phase-badge { margin: 0 0 8px; font-weight: 600; }
    .wc-status-error { color: var(--vscode-errorForeground); }
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
    ul { margin: 6px 0; padding-left: 18px; }
  </style>
</head>
<body>
  <div class="wc-toolbar">
    <button type="button" id="wc-refresh">Refresh now</button>
  </div>
  <div id="wc-status-root">${inner}</div>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
