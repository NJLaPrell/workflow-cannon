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
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webview.html = this.buildHtml(webview);
    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "dashboard-ready") {
        await this.pushUpdate();
        return;
      }
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
  }

  refresh(): void {
    void this.pushUpdate();
  }

  private async pushUpdate(): Promise<void> {
    if (!this.view) {
      return;
    }
    let raw: Record<string, unknown>;
    try {
      raw = (await this.client.run("dashboard-summary", {})) as Record<string, unknown>;
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
    try {
      await this.view.webview.postMessage({ type: "dashboard", payload: raw });
    } catch {
      /* webview disposed */
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "dashboard-webview.js")
    );
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource}`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 8px; font-size: 12px; }
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
  <div id="root">Loading…</div>
  <div>
    <button id="btn">Refresh</button>
    <button id="validate">Validate Config</button>
    <button id="tasks">Open Tasks</button>
    <button id="config">Open Config</button>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
