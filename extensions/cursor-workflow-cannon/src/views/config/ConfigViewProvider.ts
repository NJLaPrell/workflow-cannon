import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";

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
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.html();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "explain" && typeof msg.key === "string") {
        const r = await this.client.run("explain-config", { path: msg.key.trim() });
        await webviewView.webview.postMessage({ type: "explainResult", payload: r });
      }
      if (msg?.type === "validate") {
        const r = await this.client.config(["validate"]);
        await webviewView.webview.postMessage({
          type: "validateResult",
          payload: { code: r.code, text: r.stdout + (r.stderr ? "\n" + r.stderr : "") }
        });
      }
    });
  }

  private async notifyRefresh(): Promise<void> {
    if (this.view) {
      await this.view.webview.postMessage({ type: "poke" });
    }
  }

  private html(): string {
    const csp = ["default-src 'none'", "style-src 'unsafe-inline'", "script-src 'unsafe-inline'"].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 12px; }
    input { width: 100%; box-sizing: border-box; padding: 4px; margin: 4px 0; }
    button { margin-right: 8px; margin-top: 4px; }
    pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 8px; }
  </style>
</head>
<body>
  <label>Config key path</label>
  <input id="key" placeholder="tasks.storeRelativePath" />
  <div>
    <button id="explain">Explain (run explain-config)</button>
    <button id="validate">Validate (config validate)</button>
  </div>
  <pre id="out"></pre>
  <p style="opacity:0.75">Mutating <code>config set</code> requires terminal approval env — use CLI or add explicit flow later.</p>
  <script>
    const vscode = acquireVsCodeApi();
    const keyEl = document.getElementById('key');
    const out = document.getElementById('out');
    document.getElementById('explain').onclick = () => {
      vscode.postMessage({ type: 'explain', key: keyEl.value });
    };
    document.getElementById('validate').onclick = () => {
      vscode.postMessage({ type: 'validate' });
    };
    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (m?.type === 'explainResult') {
        out.textContent = JSON.stringify(m.payload, null, 2);
      }
      if (m?.type === 'validateResult') {
        out.textContent = 'exit ' + m.payload.code + '\\n' + m.payload.text;
      }
    });
  </script>
</body>
</html>`;
  }
}
