import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import {
  handleConfigSetMessage,
  handleConfigUnsetMessage,
  pushConfigListToWebview
} from "./config-host.js";
import { CONFIG_WEBVIEW_STYLES, buildConfigWebviewBootstrapScript } from "./config-webview-client.js";
import { renderConfigPanelShellHtml } from "./config-panel-shell.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";

/** Sidebar activity-bar Config webview — thin host over shared config modules (T100384). */
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
        await pushConfigListToWebview(this.client, webview, Boolean(msg.includeAll));
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
        const scope = msg.scope === "user" ? "user" : "project";
        await handleConfigSetMessage(
          this.client,
          webview,
          msg.key.trim(),
          msg.value,
          scope,
          includeAll
        );
      }
      if (msg?.type === "unset" && typeof msg.key === "string") {
        const includeAll = Boolean(msg.reloadIncludeAll);
        const scope = msg.scope === "user" ? "user" : "project";
        await handleConfigUnsetMessage(this.client, webview, msg.key.trim(), scope, includeAll);
      }
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
    const bootstrap = buildConfigWebviewBootstrapScript({ autoLoad: true });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    ${WC_BASE_CSS}
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 12px; margin: 0; }
    ${CONFIG_WEBVIEW_STYLES}
    code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
  </style>
</head>
<body>
  ${renderConfigPanelShellHtml()}
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
