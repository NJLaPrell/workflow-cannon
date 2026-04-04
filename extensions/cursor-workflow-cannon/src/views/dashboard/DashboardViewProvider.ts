import * as vscode from "vscode";
import type { DashboardSummaryCommandSuccess } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import { prefillCursorChat } from "../../cursor-chat-prefill.js";
import type { CommandClient } from "../../runtime/command-client.js";
import { ingestPlanningMetaFromData } from "../../planning-generation-cache.js";
import { buildWishlistIntakeAgentPrompt } from "../../wishlist-chat-prompt.js";
import {
  buildImprovementTriagePrompt,
  buildTaskToPhaseBranchPrompt
} from "../../playbook-chat-prompts.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { escapeHtml, renderDashboardRootInnerHtml } from "./render-dashboard.js";

let dashboardOutput: vscode.OutputChannel | undefined;

function logDashboard(message: string): void {
  if (!dashboardOutput) {
    dashboardOutput = vscode.window.createOutputChannel("Workflow Cannon", { log: true });
  }
  dashboardOutput.appendLine(`[dashboard] ${message}`);
}

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.dashboard";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>,
    private readonly notifyKitStateChanged: () => void
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
    logDashboard("resolveWebviewView: wiring handlers");
    webview.onDidReceiveMessage(async (msg) => {
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
      if (msg?.type === "prefillWishlistChat") {
        const raw = msg?.wishlistId;
        const wishlistId = typeof raw === "string" ? raw.trim() : "";
        const prompt = buildWishlistIntakeAgentPrompt(
          wishlistId.length > 0 ? { wishlistId } : undefined
        );
        await prefillCursorChat(prompt);
      }
      if (msg?.type === "prefillImprovementTriageChat") {
        const raw = msg?.taskId;
        const taskId = typeof raw === "string" ? raw.trim() : "";
        const prompt = buildImprovementTriagePrompt(
          taskId.length > 0 ? { taskId } : undefined
        );
        await prefillCursorChat(prompt);
      }
      if (msg?.type === "prefillTaskToPhaseBranchChat") {
        const raw = msg?.taskId;
        const taskId = typeof raw === "string" ? raw.trim() : "";
        const prompt = buildTaskToPhaseBranchPrompt(taskId.length > 0 ? { taskId } : undefined);
        await prefillCursorChat(prompt);
      }
      if (msg?.type === "dashboardTransition") {
        const rawId = msg?.taskId;
        const rawAction = msg?.action;
        const taskId = typeof rawId === "string" ? rawId.trim() : "";
        const action = typeof rawAction === "string" ? rawAction.trim() : "";
        if (taskId.length > 0 && action.length > 0) {
          await confirmAndRunTransition(this.client, this.notifyKitStateChanged, taskId, action);
          await this.pushUpdate();
        }
      }
    });
    void this.pushUpdate();
  }

  refresh(): void {
    void this.pushUpdate();
  }

  /**
   * Embeds rendered HTML in `webview.html` so the panel works even when postMessage delivery is flaky.
   * Buttons still use a tiny inline script + postMessage (host only receives clicks).
   */
  private async pushUpdate(): Promise<void> {
    if (!this.view) {
      return;
    }
    const { webview } = this.view;
    let raw: DashboardSummaryCommandSuccess | Record<string, unknown>;
    try {
      raw = (await this.client.run("dashboard-summary", {})) as DashboardSummaryCommandSuccess | Record<string, unknown>;
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
    }
    let rootInner: string;
    try {
      rootInner = renderDashboardRootInnerHtml(raw);
    } catch (e) {
      rootInner = '<pre class="bad">Host render error: ' + escapeHtml(String(e)) + "</pre>";
    }
    logDashboard(
      `pushUpdate: ok=${String(raw.ok)} code=${String(raw.code ?? "")} htmlBytes≈${rootInner.length}`
    );
    try {
      webview.html = this.buildHtml(webview, rootInner);
    } catch (e) {
      logDashboard(`buildHtml failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Root content is embedded (no postMessage needed to paint). Script only forwards button clicks.
   */
  private buildHtml(webview: vscode.Webview, rootInnerHtml: string): string {
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join("; ");

    const bootstrap = `(function(){var vscode=acquireVsCodeApi();var btn=document.getElementById("btn");var validate=document.getElementById("validate");var tasks=document.getElementById("tasks");var config=document.getElementById("config");var root=document.getElementById("root");if(!btn||!validate||!tasks||!config)return;btn.addEventListener("click",function(){vscode.postMessage({type:"refresh"});});validate.addEventListener("click",function(){vscode.postMessage({type:"validateConfig"});});tasks.addEventListener("click",function(){vscode.postMessage({type:"openTasks"});});config.addEventListener("click",function(){vscode.postMessage({type:"openConfig"});});if(root)root.addEventListener("click",function(ev){var t=ev.target;if(!t||t.tagName!=="BUTTON")return;var act=t.getAttribute("data-wc-action");if(!act)return;if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="proposed-imp-chat"){vscode.postMessage({type:"prefillImprovementTriageChat",taskId:tid});return;}if(act==="proposed-exe-chat"){vscode.postMessage({type:"prefillTaskToPhaseBranchChat",taskId:tid});return;}});})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon</title>
  <style>
    html, body { margin: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 2px 8px 8px; font-size: 12px; }
    #root > *:first-child { margin-top: 0; }
    #root p { margin: 0 0 6px 0; }
    #root p:last-child { margin-bottom: 0; }
    .muted { opacity: 0.75; }
    .focus-md b { font-weight: 600; }
    pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; }
    button { margin-top: 8px; padding: 4px 8px; cursor: pointer; }
    .dash-row-list { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 8px 0; }
    .dash-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 4px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .dash-row-label { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.35; }
    .dash-row-actions { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; align-items: flex-start; }
    button.dash-row-action { margin-top: 0; flex-shrink: 0; padding: 2px 8px; font-size: 11px; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .bad { color: var(--vscode-errorForeground); }
    .phase-stack { margin: 4px 0 8px 0; }
    details.phase-bucket { margin-bottom: 6px; }
    details.phase-bucket summary { cursor: pointer; user-select: none; font-weight: 600; }
    details.phase-bucket pre { margin-top: 4px; }
    .planning-card { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; padding: 8px; margin: 10px 0; }
    .dependency-overview { margin: 10px 0; }
    .a11y-note { font-size: 11px; }
    pre.resume-cli, pre.mermaid-src { font-size: 11px; }
  </style>
</head>
<body>
  <div id="root">${rootInnerHtml}</div>
  <div>
    <button id="btn">Refresh</button>
    <button id="validate">Validate Config</button>
    <button id="tasks">Open Tasks</button>
    <button id="config">Open Config</button>
  </div>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
