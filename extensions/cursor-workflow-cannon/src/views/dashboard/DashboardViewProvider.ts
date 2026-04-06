import * as vscode from "vscode";
import type { DashboardSummaryCommandSuccess } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import { prefillCursorChat } from "../../cursor-chat-prefill.js";
import type { CommandClient } from "../../runtime/command-client.js";
import { ingestPlanningMetaFromData } from "../../planning-generation-cache.js";
import { buildWishlistIntakeAgentPrompt } from "../../wishlist-chat-prompt.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../../phase-complete-release-prompt.js";
import {
  buildGenerateFeaturesPrompt,
  buildImprovementTriagePrompt,
  buildTaskToPhaseBranchPrompt
} from "../../playbook-chat-prompts.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { promptAndCreateWishlist } from "../../add-wishlist-item-flow.js";
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
  /** Poll dashboard while the sidebar view exists so the panel stays fresh without manual refresh. */
  private dashboardPollTimer: ReturnType<typeof setInterval> | undefined;
  /** After first full HTML load, refresh only swaps `#root` via postMessage so `<details open>` state survives. */
  private dashboardRootShellReady = false;

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
      if (msg?.type === "prefillWishlistChat") {
        const raw = msg?.wishlistId;
        const wishlistId = typeof raw === "string" ? raw.trim() : "";
        const prompt = buildWishlistIntakeAgentPrompt(
          wishlistId.length > 0 ? { wishlistId } : undefined
        );
        await prefillCursorChat(prompt);
      }
      if (msg?.type === "prefillGenerateFeaturesChat") {
        await prefillCursorChat(buildGenerateFeaturesPrompt());
      }
      if (msg?.type === "addWishlistItem") {
        await promptAndCreateWishlist(this.client);
        this.notifyKitStateChanged();
        await this.pushUpdate();
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
      if (msg?.type === "prefillPhaseCompleteReleaseChat") {
        const raw = msg?.phasePhrase;
        const phasePhrase = typeof raw === "string" ? raw.trim() : "";
        await prefillCursorChat(buildPhaseCompleteReleaseChatPrompt(phasePhrase));
      }
      if (msg?.type === "dashboardTransition") {
        const rawId = msg?.taskId;
        const rawAction = msg?.action;
        const taskId = typeof rawId === "string" ? rawId.trim() : "";
        const action = typeof rawAction === "string" ? rawAction.trim() : "";
        if (taskId.length > 0 && action.length > 0) {
          const rejectSubject =
            msg?.transitionKind === "wishlist" ? "this wishlist item" : undefined;
          await confirmAndRunTransition(
            this.client,
            this.notifyKitStateChanged,
            taskId,
            action,
            rejectSubject
          );
          await this.pushUpdate();
        }
      }
      if (msg?.type === "openTaskDetail") {
        const tid = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        if (tid.length > 0) {
          await vscode.commands.executeCommand("workflowCannon.task.showDetail", tid);
        }
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.pushUpdate();
      }
    });
    if (this.dashboardPollTimer) {
      clearInterval(this.dashboardPollTimer);
    }
    this.dashboardPollTimer = setInterval(() => {
      if (this.view?.visible) {
        void this.pushUpdate();
      }
    }, 45_000);
    webviewView.onDidDispose(() => {
      this.dashboardRootShellReady = false;
      if (this.dashboardPollTimer) {
        clearInterval(this.dashboardPollTimer);
        this.dashboardPollTimer = undefined;
      }
      if (this.view === webviewView) {
        this.view = undefined;
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
      if (!this.dashboardRootShellReady) {
        webview.html = this.buildHtml(webview, rootInner);
        this.dashboardRootShellReady = true;
      } else {
        await webview.postMessage({ type: "wcReplaceRoot", html: rootInner });
      }
    } catch (e) {
      logDashboard(`dashboard push failed: ${e instanceof Error ? e.message : String(e)}`);
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

    const bootstrap = `(function(){var vscode=acquireVsCodeApi();window.addEventListener("message",function(ev){var m=ev.data;if(!m||m.type!=="wcReplaceRoot"||typeof m.html!=="string")return;var root=document.getElementById("root");if(!root)return;var open={};root.querySelectorAll("details[data-wc-track]").forEach(function(d){var k=d.getAttribute("data-wc-track");if(k&&d.open)open[k]=true;});root.innerHTML=m.html;Object.keys(open).forEach(function(k){var el=root.querySelector('details[data-wc-track="'+k+'"]');if(el)el.open=true;});});var btn=document.getElementById("btn");var rootEl=document.getElementById("root");if(btn)btn.addEventListener("click",function(){vscode.postMessage({type:"refresh"});});if(rootEl)rootEl.addEventListener("click",function(ev){var t=ev.target;if(!t||t.tagName!=="BUTTON")return;var act=t.getAttribute("data-wc-action");if(!act)return;ev.stopPropagation();if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});})();`;

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
    button { cursor: pointer; }
    .dash-row-list { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 8px 0; }
    .dash-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 4px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .dash-row-label { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.35; }
    .dash-row-actions { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; align-items: flex-start; }
    button.dash-row-action { margin-top: 0; flex-shrink: 0; padding: 2px 8px; font-size: 11px; border-radius: 4px; }
    /* Primary row actions (Accept, Process, …) — VS Code button palette */
    button.dash-row-action-primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.dash-row-action-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.dash-row-action-primary:active {
      filter: brightness(0.94);
    }
    button.dash-row-action-secondary {
      color: var(--vscode-foreground);
      background: transparent;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
    }
    button.dash-row-action-secondary:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .ok { color: var(--vscode-testing-iconPassed); }
    .bad { color: var(--vscode-errorForeground); }
    .phase-stack { margin: 4px 0 8px 0; }
    details.phase-bucket { margin-bottom: 6px; }
    details.phase-bucket summary { cursor: pointer; user-select: none; font-weight: 600; }
    details.phase-bucket summary.phase-bucket-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 10px;
    }
    .phase-bucket-summary-label { flex: 1; min-width: 0; }
    button.dash-phase-release-btn {
      flex-shrink: 0;
      margin: 0;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.dash-phase-release-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.dash-phase-release-btn:active {
      filter: brightness(0.94);
    }
    details.phase-bucket pre { margin-top: 4px; }
    .dashboard-tasks-block { margin-top: 0; }
    .dash-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 10px 0; }
    button.dash-quick-action-btn {
      margin: 0;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
    }
    button.dash-quick-action-btn.dash-quick-action-primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.dash-quick-action-btn.dash-quick-action-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.dash-quick-action-btn.dash-quick-action-primary:active {
      filter: brightness(0.94);
    }
    .dash-card { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; padding: 8px; margin: 10px 0; }
    details.status-section { margin-bottom: 8px; }
    details.status-section > summary { cursor: pointer; user-select: none; font-weight: 600; }
    details.status-section > .status-section-body { padding-left: 2px; }
    .dash-card > details.status-section:last-child { margin-bottom: 0; }
    .dash-count-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin: 4px 0 10px 0; }
    .dash-count-cell { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
    .dash-count-label { font-size: 11px; opacity: 0.85; line-height: 1.25; flex: 1; min-width: 0; }
    .dash-count-num { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; line-height: 1.25; }
    .a11y-note { font-size: 11px; }
    pre.resume-cli { font-size: 11px; }
    .dash-footer { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25)); }
    #btn.dash-refresh-btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.02em;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      transition: background 0.12s ease, filter 0.12s ease;
    }
    #btn.dash-refresh-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #btn.dash-refresh-btn:active {
      filter: brightness(0.92);
    }
    #btn.dash-refresh-btn:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <div id="root">${rootInnerHtml}</div>
  <footer class="dash-footer">
    <button type="button" id="btn" class="dash-refresh-btn" title="Reload dashboard from workspace-kit">Refresh</button>
  </footer>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
