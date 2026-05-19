import * as vscode from "vscode";
import type { CommandClient } from "../../runtime/command-client.js";
import { GuidanceAuthoringExtensionSide } from "./guidance-authoring-extension-side.js";
import { buildGuidanceAuthoringWebviewBootstrap } from "./guidance-authoring-webview-bootstrap.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "./render-guidance-panel.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";
import { GUIDANCE_PANEL_WEBVIEW_CSS } from "../shared/guidance-panel-webview-css.js";

const VIEW_TYPE = "workflowCannon.guidancePanel";

export class GuidancePanel {
  private panel: vscode.WebviewPanel | undefined;
  private refreshInFlight = false;
  private pendingRefresh = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private authoring?: GuidanceAuthoringExtensionSide;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>,
    private readonly workspaceFolder?: vscode.WorkspaceFolder
  ) {
    onKitStateChanged(() => {
      this.scheduleRefresh(false);
    });
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One, true);
      void this.runRefresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Workflow Cannon — Guidance", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.extensionUri]
    });
    this.panel = panel;
    this.authoring = new GuidanceAuthoringExtensionSide({
      client: this.client,
      workspaceFolder: this.workspaceFolder,
      extensionUri: this.extensionUri,
      getWebview: () => this.panel?.webview,
      reloadAfterMutations: () => this.runRefresh()
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.authoring = undefined;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    });
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "drawerSubmit") {
        void this.authoring?.handleCaeDrawerSubmitIfActive((msg as { values?: unknown }).values);
        return;
      }
      if (msg?.type === "drawerCancel") {
        void this.authoring?.handleCaeDrawerCancelIfActive();
        return;
      }
      if (msg?.type === "refresh") {
        void this.runRefresh();
        return;
      }
      this.authoring?.dispatchWebviewMessage(msg);
    });
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) void this.runRefresh();
    });
    void this.runRefresh();
  }

  private scheduleRefresh(immediate: boolean): void {
    if (!this.panel) return;
    if (immediate) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
      void this.runRefresh();
      return;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.runRefresh();
    }, 450);
  }

  private async runRefresh(): Promise<void> {
    const webview = this.panel?.webview;
    if (!webview) return;
    if (this.refreshInFlight) {
      this.pendingRefresh = true;
      return;
    }
    this.refreshInFlight = true;
    try {
      this.authoring?.cancelMutationApproval();
      const result = await this.client.run("cae-authoring-summary", { schemaVersion: 1 });
      webview.html = this.wrapHtml(webview, renderGuidanceAuthoringPanelInnerHtml(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      webview.html = this.wrapHtml(
        webview,
        renderGuidanceAuthoringPanelInnerHtml({ ok: false, code: "extension-error", message })
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
    const csp = ["default-src 'none'", "style-src 'unsafe-inline'", `script-src ${webview.cspSource} 'unsafe-inline'`].join("; ");
    const bootstrap = buildGuidanceAuthoringWebviewBootstrap("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon Guidance</title>
  <style>
    ${WC_BASE_CSS}
    ${GUIDANCE_PANEL_WEBVIEW_CSS}
  </style>
</head>
<body><div class="gp-root">${inner}<script>${bootstrap}</script></div><div id="wc-drawer-host" class="wc-drawer-host wc-drawer-host--hidden" aria-hidden="true"></div></body>
</html>`;
  }
}
