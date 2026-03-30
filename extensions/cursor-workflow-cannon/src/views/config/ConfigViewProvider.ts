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
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webview.html = this.buildHtml(webview);
    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "list") {
        const r = await this.client.config(["list", "--json"]);
        await webview.postMessage({
          type: "listResult",
          payload: this.parseConfigJson(r)
        });
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
      if (msg?.type === "set" && typeof msg.key === "string" && typeof msg.value === "string") {
        const r = await this.client.config(["set", msg.key.trim(), msg.value]);
        await webview.postMessage({
          type: "setResult",
          payload: { code: r.code, text: r.stdout + (r.stderr ? "\n" + r.stderr : "") }
        });
      }
      if (msg?.type === "unset" && typeof msg.key === "string") {
        const r = await this.client.config(["unset", msg.key.trim()]);
        await webview.postMessage({
          type: "unsetResult",
          payload: { code: r.code, text: r.stdout + (r.stderr ? "\n" + r.stderr : "") }
        });
      }
    });
  }

  private parseConfigJson(r: { code: number; stdout: string; stderr: string }): unknown {
    try {
      return JSON.parse(r.stdout);
    } catch {
      return { ok: false, code: "config-json-parse", message: r.stderr || r.stdout || `exit ${r.code}` };
    }
  }

  private async notifyRefresh(): Promise<void> {
    if (this.view) {
      await this.view.webview.postMessage({ type: "poke" });
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");
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
  <label>JSON value (for set)</label>
  <input id="value" placeholder="\\".workspace-kit/tasks/state.json\\"" />
  <div>
    <button id="list">List Keys</button>
    <button id="explain">Explain (run explain-config)</button>
    <button id="validate">Validate (config validate)</button>
    <button id="set">Set (config set)</button>
    <button id="unset">Unset (config unset)</button>
  </div>
  <pre id="out"></pre>
  <p style="opacity:0.75">Mutating <code>config set</code> requires terminal approval env — use CLI or add explicit flow later.</p>
  <script>
    const vscode = acquireVsCodeApi();
    const keyEl = document.getElementById('key');
    const valueEl = document.getElementById('value');
    const out = document.getElementById('out');
    document.getElementById('list').onclick = () => {
      vscode.postMessage({ type: 'list' });
    };
    document.getElementById('explain').onclick = () => {
      vscode.postMessage({ type: 'explain', key: keyEl.value });
    };
    document.getElementById('validate').onclick = () => {
      vscode.postMessage({ type: 'validate' });
    };
    document.getElementById('set').onclick = () => {
      vscode.postMessage({ type: 'set', key: keyEl.value, value: valueEl.value });
    };
    document.getElementById('unset').onclick = () => {
      vscode.postMessage({ type: 'unset', key: keyEl.value });
    };
    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (m?.type === 'explainResult') {
        out.textContent = JSON.stringify(m.payload, null, 2);
      }
      if (m?.type === 'validateResult') {
        out.textContent = 'exit ' + m.payload.code + '\\n' + m.payload.text;
      }
      if (m?.type === 'listResult') {
        out.textContent = JSON.stringify(m.payload, null, 2);
      }
      if (m?.type === 'setResult' || m?.type === 'unsetResult') {
        out.textContent = 'exit ' + m.payload.code + '\\n' + m.payload.text;
      }
    });
  </script>
</body>
</html>`;
  }
}
