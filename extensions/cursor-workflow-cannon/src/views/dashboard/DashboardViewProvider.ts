import * as vscode from "vscode";
import type { DashboardSummaryCommandSuccess } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import { prefillCursorChat } from "../../cursor-chat-prefill.js";
import type { CommandClient } from "../../runtime/command-client.js";
import { expectedPlanningGenerationArgs, ingestPlanningMetaFromData } from "../../planning-generation-cache.js";
import { buildWishlistIntakeAgentPrompt } from "../../wishlist-chat-prompt.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../../phase-complete-release-prompt.js";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildCollaborationProfilesHubPrompt,
  buildImprovementTriagePrompt,
  buildPlanningInterviewPrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../../playbook-chat-prompts.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { promptAndCreateWishlist } from "../../add-wishlist-item-flow.js";
import {
  escapeHtml,
  renderDashboardRootInnerHtml,
  type PlanningInterviewWizardPanel
} from "./render-dashboard.js";

let dashboardOutput: vscode.OutputChannel | undefined;

type DashboardPlanningWizardState =
  | { kind: "idle" }
  | {
      kind: "question";
      planningType: string;
      outputMode: string;
      answers: Record<string, string>;
      question: { id: string; prompt: string; examples: string[]; whyItMatters: string };
    }
  | { kind: "done"; planningType: string; code: string; message: string }
  | { kind: "error"; message: string };

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

  private planningWizard: DashboardPlanningWizardState = { kind: "idle" };

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
        await prefillCursorChat(GENERATE_FEATURES_SLASH_TEXT, { newChat: true });
      }
      if (msg?.type === "prefillTranscriptChurnResearchChat") {
        const raw = msg?.taskId;
        const taskId = typeof raw === "string" ? raw.trim() : "";
        const prompt = buildTranscriptChurnResearchPrompt(
          taskId.length > 0 ? { taskId } : undefined
        );
        await prefillCursorChat(prompt, { newChat: true });
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
      if (msg?.type === "openWishlistDetail") {
        const wid = typeof msg.wishlistId === "string" ? msg.wishlistId.trim() : "";
        if (wid.length > 0) {
          await vscode.commands.executeCommand("workflowCannon.wishlist.showDetail", wid);
        }
      }
      if (msg?.type === "prefillPlanningInterviewChat") {
        await prefillCursorChat(buildPlanningInterviewPrompt(), { newChat: true });
      }
      if (msg?.type === "planningWizardStart") {
        const pt = typeof msg.planningType === "string" ? msg.planningType.trim() : "";
        if (pt.length > 0) {
          void this.onPlanningWizardStart(pt);
        }
      }
      if (msg?.type === "planningWizardSubmit") {
        const a = typeof msg.answer === "string" ? msg.answer : "";
        void this.onPlanningWizardSubmit(a);
      }
      if (msg?.type === "planningWizardCancel" || msg?.type === "planningWizardDismiss") {
        void this.onPlanningWizardReset();
      }
      if (msg?.type === "prefillCollaborationHubChat") {
        await prefillCursorChat(buildCollaborationProfilesHubPrompt(), { newChat: true });
      }
      if (msg?.type === "prefillDeliverPhaseChat") {
        const ph = typeof msg.kitPhase === "string" ? msg.kitPhase.trim() : "";
        await prefillCursorChat(
          buildTaskToPhaseBranchPrompt(ph.length > 0 ? { kitPhase: ph } : {}),
          { newChat: true }
        );
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

  private planningWizardPanel(): PlanningInterviewWizardPanel {
    switch (this.planningWizard.kind) {
      case "idle":
        return { kind: "picker" };
      case "question":
        return {
          kind: "question",
          planningType: this.planningWizard.planningType,
          questionId: this.planningWizard.question.id,
          prompt: this.planningWizard.question.prompt,
          examples: this.planningWizard.question.examples,
          whyItMatters: this.planningWizard.question.whyItMatters,
          progressHint: `${Object.keys(this.planningWizard.answers).length} answered`
        };
      case "done":
        return {
          kind: "success",
          planningType: this.planningWizard.planningType,
          code: this.planningWizard.code,
          message: this.planningWizard.message
        };
      case "error":
        return { kind: "error", message: this.planningWizard.message };
    }
  }

  private pickFirstPlanningQuestion(data: Record<string, unknown> | undefined): {
    id: string;
    prompt: string;
    examples: string[];
    whyItMatters: string;
  } | null {
    const nq = data?.nextQuestions;
    if (!Array.isArray(nq) || nq.length === 0) {
      return null;
    }
    const q = nq[0] as Record<string, unknown>;
    const id = typeof q.id === "string" ? q.id.trim() : "";
    const prompt = typeof q.prompt === "string" ? q.prompt : "";
    if (!id || !prompt) {
      return null;
    }
    const examples = Array.isArray(q.examples)
      ? q.examples.filter((x): x is string => typeof x === "string")
      : [];
    const whyItMatters = typeof q.whyItMatters === "string" ? q.whyItMatters : "";
    return { id, prompt, examples, whyItMatters };
  }

  private async ingestPlanningGenFromDashboard(): Promise<void> {
    const dash = await this.client.run("dashboard-summary", {});
    if (dash.ok && dash.data && typeof dash.data === "object") {
      ingestPlanningMetaFromData(dash.data as Record<string, unknown>);
    }
  }

  private async onPlanningWizardStart(planningType: string): Promise<void> {
    try {
      await this.ingestPlanningGenFromDashboard();
      const res = await this.client.run("build-plan", {
        planningType,
        outputMode: "response",
        ...expectedPlanningGenerationArgs()
      });
      if (!res.ok) {
        this.planningWizard = {
          kind: "error",
          message: res.message ?? String(res.code ?? "build-plan failed")
        };
        await this.pushUpdate();
        return;
      }
      const code = String(res.code ?? "");
      if (code === "planning-response-ready") {
        this.planningWizard = {
          kind: "done",
          planningType,
          code,
          message: String(res.message ?? "Interview complete")
        };
        this.notifyKitStateChanged();
        await this.pushUpdate();
        return;
      }
      if (code === "planning-questions") {
        const pq = this.pickFirstPlanningQuestion(res.data as Record<string, unknown> | undefined);
        if (!pq) {
          this.planningWizard = { kind: "error", message: "build-plan returned no questions" };
        } else {
          this.planningWizard = {
            kind: "question",
            planningType,
            outputMode: "response",
            answers: {},
            question: pq
          };
        }
        this.notifyKitStateChanged();
        await this.pushUpdate();
        return;
      }
      this.planningWizard = {
        kind: "error",
        message: `Unexpected build-plan code: ${code}`
      };
      await this.pushUpdate();
    } catch (e) {
      this.planningWizard = {
        kind: "error",
        message: e instanceof Error ? e.message : String(e)
      };
      await this.pushUpdate();
    }
  }

  private async onPlanningWizardSubmit(answer: string): Promise<void> {
    if (this.planningWizard.kind !== "question") {
      return;
    }
    const text = answer.trim();
    if (text.length === 0) {
      void vscode.window.showWarningMessage("Enter an answer before submitting.");
      return;
    }
    const { planningType, outputMode, question, answers } = this.planningWizard;
    const nextAnswers = { ...answers, [question.id]: text };
    try {
      await this.ingestPlanningGenFromDashboard();
      const res = await this.client.run("build-plan", {
        planningType,
        outputMode,
        answers: nextAnswers,
        ...expectedPlanningGenerationArgs()
      });
      if (!res.ok) {
        this.planningWizard = {
          kind: "error",
          message: res.message ?? String(res.code ?? "build-plan failed")
        };
        await this.pushUpdate();
        return;
      }
      const code = String(res.code ?? "");
      if (code === "planning-response-ready") {
        this.planningWizard = {
          kind: "done",
          planningType,
          code,
          message: String(res.message ?? "Interview complete")
        };
        this.notifyKitStateChanged();
        await this.pushUpdate();
        return;
      }
      if (code === "planning-questions") {
        const pq = this.pickFirstPlanningQuestion(res.data as Record<string, unknown> | undefined);
        if (!pq) {
          this.planningWizard = { kind: "error", message: "build-plan returned no next question" };
        } else {
          this.planningWizard = {
            kind: "question",
            planningType,
            outputMode,
            answers: nextAnswers,
            question: pq
          };
        }
        this.notifyKitStateChanged();
        await this.pushUpdate();
        return;
      }
      this.planningWizard = {
        kind: "error",
        message: `Unexpected build-plan code: ${code}`
      };
      await this.pushUpdate();
    } catch (e) {
      this.planningWizard = {
        kind: "error",
        message: e instanceof Error ? e.message : String(e)
      };
      await this.pushUpdate();
    }
  }

  private async onPlanningWizardReset(): Promise<void> {
    this.planningWizard = { kind: "idle" };
    await this.pushUpdate();
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
    let listApprovalQueueResult: unknown;
    try {
      const [summaryRes, aqRes] = await Promise.all([
        this.client.run("dashboard-summary", {}),
        this.client.run("list-approval-queue", {})
      ]);
      raw = summaryRes as DashboardSummaryCommandSuccess | Record<string, unknown>;
      listApprovalQueueResult = aqRes;
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
      listApprovalQueueResult = undefined;
    }
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
    }
    let rootInner: string;
    const wizardPanel: PlanningInterviewWizardPanel | null = raw.ok === true ? this.planningWizardPanel() : null;
    try {
      rootInner = renderDashboardRootInnerHtml(raw, listApprovalQueueResult, wizardPanel);
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

    const bootstrap = `(function(){var vscode=acquireVsCodeApi();window.addEventListener("message",function(ev){var m=ev.data;if(!m||m.type!=="wcReplaceRoot"||typeof m.html!=="string")return;var root=document.getElementById("root");if(!root)return;var open={};root.querySelectorAll("details[data-wc-track]").forEach(function(d){var k=d.getAttribute("data-wc-track");if(k&&d.open)open[k]=true;});root.innerHTML=m.html;Object.keys(open).forEach(function(k){var el=root.querySelector('details[data-wc-track="'+k+'"]');if(el)el.open=true;});});var btn=document.getElementById("btn");var rootEl=document.getElementById("root");if(btn)btn.addEventListener("click",function(){vscode.postMessage({type:"refresh"});});if(rootEl)rootEl.addEventListener("click",function(ev){var t=ev.target;if(!t||t.tagName!=="BUTTON")return;var act=t.getAttribute("data-wc-action");if(!act)return;ev.stopPropagation();if(act==="wishlist-view"){var wv=(t.getAttribute("data-wishlist-id")||"").trim();if(wv)vscode.postMessage({type:"openWishlistDetail",wishlistId:wv});return;}if(act==="planning-new-plan"){vscode.postMessage({type:"prefillPlanningInterviewChat"});return;}if(act==="planning-wizard-start"){var sel=document.getElementById("wc-planning-type");var pt=sel&&sel.value?String(sel.value).trim():"";if(pt)vscode.postMessage({type:"planningWizardStart",planningType:pt});return;}if(act==="planning-wizard-submit"){var ta=document.getElementById("wc-planning-answer");var txt=ta&&typeof ta.value==="string"?ta.value.trim():"";vscode.postMessage({type:"planningWizardSubmit",answer:txt});return;}if(act==="planning-wizard-cancel"){vscode.postMessage({type:"planningWizardCancel"});return;}if(act==="planning-wizard-dismiss"){vscode.postMessage({type:"planningWizardDismiss"});return;}if(act==="collaboration-hub"){vscode.postMessage({type:"prefillCollaborationHubChat"});return;}if(act==="deliver-phase-prompt"){var kp=(t.getAttribute("data-wc-kit-phase")||"").trim();vscode.postMessage({type:"prefillDeliverPhaseChat",kitPhase:kp});return;}if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="transcript-churn-research-chat"){var tcTid=(t.getAttribute("data-task-id")||"").trim();vscode.postMessage({type:"prefillTranscriptChurnResearchChat",taskId:tcTid});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});})();`;

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
    button.dash-row-action-tertiary {
      color: var(--vscode-textLink-foreground);
      background: transparent;
      border: 1px solid var(--vscode-textLink-foreground);
    }
    button.dash-row-action-tertiary:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    button.dash-row-action-tertiary:active {
      filter: brightness(0.92);
    }
    .dash-overview-phase-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 6px 0;
    }
    .dash-overview-phase-text { flex: 1; min-width: 0; }
    button.dash-deliver-chip {
      margin: 0;
      flex-shrink: 0;
      padding: 3px 10px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 5px;
      letter-spacing: 0.02em;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.dash-deliver-chip:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.dash-deliver-chip:active {
      filter: brightness(0.94);
    }
    button.dash-deliver-chip:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .dash-planning-head {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 8px 0;
    }
    .dash-planning-head-main { flex: 1; min-width: 0; }
    p.dash-planning-title { margin: 0; }
    button.dash-new-plan-btn {
      margin: 0;
      flex-shrink: 0;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.dash-new-plan-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.dash-new-plan-btn:active {
      filter: brightness(0.94);
    }
    .dash-planning-wizard {
      margin: 8px 0 10px 0;
      padding: 8px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
    }
    .dash-planning-wizard-label {
      display: block;
      margin: 6px 0 2px 0;
      font-size: 11px;
      font-weight: 600;
    }
    .dash-planning-wizard-select {
      max-width: min(100%, 220px);
      margin-right: 6px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }
    .dash-planning-wizard-textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin: 4px 0 8px 0;
      padding: 6px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      border-radius: 4px;
    }
    .dash-planning-wizard-actions {
      margin: 0;
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
    ul.dash-hint-list { margin: 4px 0 8px 18px; padding: 0; font-size: 11px; line-height: 1.4; }
    ul.dash-hint-list li { margin: 2px 0; }
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
    <button type="button" id="btn" class="dash-refresh-btn" title="Refetch dashboard-summary and list-approval-queue now. The panel also reloads when you switch back to it, when kit-owned files change, and about every 45s while visible.">Refresh</button>
  </footer>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
