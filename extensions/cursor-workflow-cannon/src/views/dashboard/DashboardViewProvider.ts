import * as vscode from "vscode";
import type { DashboardSummaryCommandSuccess } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import { prefillCursorChat, resolveEditorIntegrationState } from "../../cursor-chat-prefill.js";
import type { CommandClient } from "../../runtime/command-client.js";
import { expectedPlanningGenerationArgs, ingestPlanningMetaFromData } from "../../planning-generation-cache.js";
import { buildWishlistIntakeAgentPrompt } from "../../wishlist-chat-prompt.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../../phase-complete-release-prompt.js";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildCollaborationProfilesHubPrompt,
  buildImprovementTriagePrompt,
  buildPlanningInterviewPrompt,
  buildPlanningInterviewResumePrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../../playbook-chat-prompts.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { promptAndCreateWishlist } from "../../add-wishlist-item-flow.js";
import {
  escapeHtml,
  renderDashboardRootInnerHtml,
  type DashboardPhaseJournalBundle,
  type PhaseJournalKitPayload,
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

function phaseKeyFromPhrase(phasePhrase: string): string | undefined {
  const raw = phasePhrase.trim();
  if (!raw || raw.toLowerCase() === "not phased") return undefined;
  const match = raw.match(/^Phase\s+(.+)$/i);
  return (match?.[1] ?? raw).trim() || undefined;
}

/** Build QuickPick labels from the last dashboard-summary `data` payload (phase buckets + workspace phase slice). */
function collectPhaseKeySuggestions(data: Record<string, unknown>): Array<{ label: string; phaseKey: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; phaseKey: string }> = [];
  const add = (pk: string, label?: string) => {
    const k = pk.trim();
    if (!k.length || seen.has(k)) return;
    seen.add(k);
    out.push({ phaseKey: k, label: label ?? `Phase ${k}` });
  };
  const sys = data.systemStatus as Record<string, unknown> | undefined;
  const phaseSlice = sys?.phase as Record<string, unknown> | undefined;
  if (phaseSlice && typeof phaseSlice === "object") {
    const canon = phaseSlice.canonicalPhaseKey;
    if (typeof canon === "string" && canon.trim()) add(canon.trim(), `Canonical: ${canon.trim()}`);
    const ws = phaseSlice.workspaceStatusPhaseKey;
    if (typeof ws === "string" && ws.trim()) add(ws.trim(), `Workspace DB: ${ws.trim()}`);
    const cf = phaseSlice.configPhaseKey;
    if (typeof cf === "string" && cf.trim()) add(cf.trim(), `Config hint: ${cf.trim()}`);
    const parseRoadmapPhase = (raw: string): string => {
      const t = raw.trim();
      const fromPhrase = phaseKeyFromPhrase(t);
      if (fromPhrase) {
        return fromPhrase;
      }
      return /^\d+$/.test(t) ? t : "";
    };
    const curKP = phaseSlice.currentKitPhase;
    if (typeof curKP === "string" && curKP.trim()) {
      const pk = parseRoadmapPhase(curKP);
      if (pk) {
        add(pk, `Current kit phase (${curKP.trim()})`);
      }
    }
    const nextKP = phaseSlice.nextKitPhase;
    if (typeof nextKP === "string" && nextKP.trim()) {
      const pk = parseRoadmapPhase(nextKP);
      if (pk) {
        add(pk, `Next kit phase (${nextKP.trim()})`);
      }
    }
  }
  const scan = (summary: unknown) => {
    if (!summary || typeof summary !== "object") return;
    const buckets = (summary as { phaseBuckets?: unknown }).phaseBuckets;
    if (!Array.isArray(buckets)) return;
    for (const rawBucket of buckets) {
      if (!rawBucket || typeof rawBucket !== "object") continue;
      const pk = (rawBucket as { phaseKey?: unknown }).phaseKey;
      const lb = (rawBucket as { label?: unknown }).label;
      if (typeof pk === "string" && pk.trim()) {
        add(pk.trim(), typeof lb === "string" && lb.trim() ? lb.trim() : undefined);
      }
    }
  };
  scan(data.readyExecutionSummary);
  scan(data.proposedExecutionSummary);
  scan(data.readyImprovementsSummary);
  scan(data.proposedImprovementsSummary);
  scan(data.completedSummary);
  scan(data.cancelledSummary);
  scan(data.transcriptChurnResearchSummary);
  if (data.blockedSummary && typeof data.blockedSummary === "object") {
    scan({ phaseBuckets: (data.blockedSummary as { phaseBuckets?: unknown }).phaseBuckets });
  }
  return out;
}

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.dashboard";

  private view?: vscode.WebviewView;
  /** Poll dashboard while the sidebar view exists so the panel stays fresh without manual refresh. */
  private dashboardPollTimer: ReturnType<typeof setInterval> | undefined;
  /** After first full HTML load, refresh only swaps `#root` via postMessage so `<details open>` state survives. */
  private dashboardRootShellReady = false;

  private planningWizard: DashboardPlanningWizardState = { kind: "idle" };

  /** Last successful `dashboard-summary` `data` — used for phase QuickPick targets. */
  private lastDashboardSummaryData: Record<string, unknown> | null = null;

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
      if (msg?.type === "prefillPlanningResumeChat") {
        const resumeCli = typeof msg.resumeCli === "string" ? msg.resumeCli.trim() : "";
        await prefillCursorChat(buildPlanningInterviewResumePrompt(resumeCli), { newChat: true });
      }
      if (msg?.type === "planningDiscard") {
        await this.onPlanningDiscard();
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
        await this.client.recordActivity({
          kind: "releasing",
          command: "phase-complete-release",
          phaseKey: phaseKeyFromPhrase(phasePhrase),
          details: { source: "dashboard-complete-release", phasePhrase }
        });
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
          if (action === "accept") {
            await this.onDashboardAcceptProposed(taskId);
          } else {
            await confirmAndRunTransition(
              this.client,
              this.notifyKitStateChanged,
              taskId,
              action,
              rejectSubject
            );
          }
          await this.pushUpdate();
        }
      }
      if (msg?.type === "dismissPhaseNote") {
        const nid = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        const pri = typeof msg.priority === "string" ? msg.priority.trim() : "";
        if (nid.length > 0) {
          await this.onDismissPhaseNote(nid, pri);
          await this.pushUpdate();
        }
      }
      if (msg?.type === "convertPhaseNote") {
        const nid = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        if (nid.length > 0) {
          await this.onConvertPhaseNote(nid);
          await this.pushUpdate();
        }
      }
      if (msg?.type === "persistPhaseNoteProposals") {
        await this.onPersistPhaseNoteProposals();
        await this.pushUpdate();
      }
      if (msg?.type === "assignTaskPhase") {
        const rawId = msg?.taskId;
        const taskId = typeof rawId === "string" ? rawId.trim() : "";
        if (taskId.length > 0) {
          await this.onAssignTaskPhase(taskId);
        }
      }
      if (msg?.type === "dashboardAcceptProposedPhase") {
        const rawIds = typeof msg.taskIds === "string" ? msg.taskIds : "";
        const taskIds = rawIds
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        const cat = msg.category === "execution" ? "execution" : "improvement";
        const label = cat === "execution" ? "execution" : "improvement";
        if (taskIds.length > 0) {
          await this.onDashboardAcceptProposedBatch(taskIds, label);
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

  /** Toast + optional open-detail when a guided interview finishes (wishlist / persistence clarity). */
  private async planningWizardCompletionNotice(
    code: string,
    data: Record<string, unknown> | undefined
  ): Promise<void> {
    if (code === "planning-artifact-created") {
      const wid = typeof data?.wishlistId === "string" ? data.wishlistId.trim() : "";
      const taskId = typeof data?.taskId === "string" ? data.taskId.trim() : "";
      const openId = wid || taskId;
      if (openId.length > 0) {
        const pick = await vscode.window.showInformationMessage(
          `Wishlist row persisted: ${openId}. Refresh the dashboard or open the full record.`,
          "Open wishlist detail",
          "Dismiss"
        );
        if (pick === "Open wishlist detail") {
          await vscode.commands.executeCommand("workflowCannon.wishlist.showDetail", openId);
        }
      }
      return;
    }
    if (code === "planning-wishlist-ready") {
      void vscode.window.showInformationMessage(
        "Planning interview finished. No wishlist row was written yet — use build-plan finalize with createWishlist from the CLI or chat when you want it persisted."
      );
      return;
    }
  }

  private async onPlanningWizardStart(planningType: string): Promise<void> {
    try {
      await this.ingestPlanningGenFromDashboard();
      await this.client.recordActivity({
        kind: "planning",
        command: "build-plan",
        details: { planningType, source: "dashboard-planning-wizard" }
      });
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
      if (
        code === "planning-response-ready" ||
        code === "planning-artifact-created" ||
        code === "planning-wishlist-ready"
      ) {
        this.planningWizard = {
          kind: "done",
          planningType,
          code,
          message: String(res.message ?? "Interview complete")
        };
        await this.client.clearActivity({ command: "build-plan" });
        this.notifyKitStateChanged();
        await this.planningWizardCompletionNotice(code, res.data as Record<string, unknown> | undefined);
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
      await this.client.recordActivity({
        kind: "planning",
        command: "build-plan",
        details: { planningType, source: "dashboard-planning-wizard" }
      });
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
      if (
        code === "planning-response-ready" ||
        code === "planning-artifact-created" ||
        code === "planning-wishlist-ready"
      ) {
        this.planningWizard = {
          kind: "done",
          planningType,
          code,
          message: String(res.message ?? "Interview complete")
        };
        await this.client.clearActivity({ command: "build-plan" });
        this.notifyKitStateChanged();
        await this.planningWizardCompletionNotice(code, res.data as Record<string, unknown> | undefined);
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
    await this.client.clearActivity({ command: "build-plan" });
    await this.pushUpdate();
  }

  private async onPlanningDiscard(): Promise<void> {
    const pick = await vscode.window.showWarningMessage(
      "Discard the saved planning interview?",
      { modal: true },
      "Discard"
    );
    if (pick !== "Discard") {
      return;
    }
    const res = await this.client.run("build-plan", { action: "discard" });
    if (!res.ok) {
      await vscode.window.showErrorMessage(res.message ?? String(res.code ?? "Failed to discard planning interview"));
      return;
    }
    this.planningWizard = { kind: "idle" };
    await this.client.clearActivity({ command: "build-plan" });
    this.notifyKitStateChanged();
    await this.pushUpdate();
  }

  private async pickPhaseKeyFromDashboard(options: {
    title: string;
    /** Prefill for custom key entry */
    valueHint?: string;
  }): Promise<string | undefined> {
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const quickItems: vscode.QuickPickItem[] = [
      ...suggestions.map((s) => ({
        label: s.label,
        description: s.phaseKey
      })),
      {
        label: "Enter another phase key…",
        description: "Custom stable phase key",
        alwaysShow: true
      }
    ];
    const picked = await vscode.window.showQuickPick(quickItems, {
      title: options.title,
      placeHolder: "Choose a phase target",
      matchOnDescription: true
    });
    if (!picked) {
      return undefined;
    }
    if (picked.label === "Enter another phase key…") {
      const input = await vscode.window.showInputBox({
        title: "Phase key",
        prompt: "Stable kit phase key (assign-task-phase)",
        value: options.valueHint ?? suggestions[0]?.phaseKey ?? "",
        validateInput: (v) => (v.trim().length > 0 ? null : "Phase key required")
      });
      if (!input?.trim()) {
        return undefined;
      }
      return input.trim();
    }
    const phaseKey = (picked.description ?? "").trim();
    return phaseKey.length > 0 ? phaseKey : undefined;
  }

  /**
   * Dashboard "Phase" row action → `assign-task-phase` with planning-generation prelude when required.
   */
  private async onAssignTaskPhase(taskId: string): Promise<void> {
    const phaseKey = await this.pickPhaseKeyFromDashboard({
      title: `Set phase for ${taskId}`
    });
    if (!phaseKey) {
      return;
    }
    await this.client.recordActivity({
      kind: "working_task",
      taskId,
      phaseKey,
      command: "assign-task-phase",
      details: { source: "dashboard-phase-button" }
    });
    const args: Record<string, unknown> = {
      taskId,
      phaseKey,
      ...expectedPlanningGenerationArgs()
    };
    const out = await this.client.run("assign-task-phase", args);
    if (!out.ok) {
      const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
      await vscode.window.showErrorMessage(`assign-task-phase failed: ${detail}`);
      await this.client.clearActivity();
      return;
    }
    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    await this.client.clearActivity();
    this.notifyKitStateChanged();
    await this.pushUpdate();
    await vscode.window.showInformationMessage(`Updated phase for ${taskId} → ${phaseKey}`);
  }

  private async onDismissPhaseNote(noteId: string, priority: string): Promise<void> {
    const reasonRaw =
      (await vscode.window.showInputBox({
        prompt: "Reason for dismiss-phase-note (required; audited)",
        placeHolder: "Short operator reason"
      })) ?? "";
    const reason = reasonRaw.trim();
    if (!reason.length) {
      await vscode.window.showErrorMessage("dismiss-phase-note requires a non-empty reason.");
      return;
    }
    let policyApproval: { confirmed: boolean; rationale: string } | undefined;
    if (priority === "critical") {
      const gate = await vscode.window.showWarningMessage(
        "Dismiss an active critical phase note — kit policy may require explicit approval.",
        { modal: true },
        "Continue"
      );
      if (gate !== "Continue") {
        return;
      }
      const rationaleRaw =
        (await vscode.window.showInputBox({
          prompt: "Policy rationale for critical phase note dismiss (policyApproval.rationale)",
          placeHolder: "Shown in policy trace"
        })) ?? "";
      const rationale = rationaleRaw.trim();
      if (!rationale.length) {
        await vscode.window.showErrorMessage("Critical dismiss requires a non-empty policy rationale.");
        return;
      }
      policyApproval = { confirmed: true, rationale };
    }
    const args: Record<string, unknown> = {
      noteId,
      reason,
      ...expectedPlanningGenerationArgs()
    };
    if (policyApproval) {
      args.policyApproval = policyApproval;
    }
    const r = await this.client.run("dismiss-phase-note", args);
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      return;
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    this.notifyKitStateChanged();
    await vscode.window.showInformationMessage(r.message ?? "Phase note dismissed");
  }

  private async onConvertPhaseNote(noteId: string): Promise<void> {
    const gate = await vscode.window.showWarningMessage(
      `Convert phase note ${noteId} to a proposed task (convert-phase-note-to-task)?`,
      { modal: true },
      "Convert"
    );
    if (gate !== "Convert") {
      return;
    }
    const r = await this.client.run("convert-phase-note-to-task", {
      noteId,
      ...expectedPlanningGenerationArgs()
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      return;
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    this.notifyKitStateChanged();
    await vscode.window.showInformationMessage(r.message ?? "Converted phase note to task");
  }

  private async onPersistPhaseNoteProposals(): Promise<void> {
    const gate = await vscode.window.showWarningMessage(
      "Persist convertible phase notes into kit suggestions (propose-tasks-from-phase-notes persist:true)?",
      { modal: true },
      "Persist"
    );
    if (gate !== "Persist") {
      return;
    }
    const r = await this.client.run("propose-tasks-from-phase-notes", {
      persist: true,
      ...expectedPlanningGenerationArgs()
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      return;
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    this.notifyKitStateChanged();
    await vscode.window.showInformationMessage(r.message ?? "Persisted phase note proposals");
  }

  /** Proposed-row Accept → pick phase → run-transition accept → assign-task-phase. */
  private async onDashboardAcceptProposed(taskId: string): Promise<void> {
    const phaseKey = await this.pickPhaseKeyFromDashboard({
      title: `Accept proposed task — target phase for ${taskId}`
    });
    if (!phaseKey) {
      return;
    }
    const gate = await vscode.window.showWarningMessage(
      `Accept ${taskId} (→ ready) then assign-task-phase → ${phaseKey}?`,
      { modal: true },
      "Apply"
    );
    if (gate !== "Apply") {
      return;
    }
    const rationale =
      (await vscode.window.showInputBox({
        prompt: `Policy rationale for run-transition accept on ${taskId}`,
        placeHolder: "Shown in policy trace / approval"
      })) ?? "vscode-extension";
    const r = await this.client.run("run-transition", {
      taskId,
      action: "accept",
      policyApproval: { confirmed: true, rationale },
      ...expectedPlanningGenerationArgs()
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      return;
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    const r2 = await this.client.run("assign-task-phase", {
      taskId,
      phaseKey,
      ...expectedPlanningGenerationArgs()
    });
    if (!r2.ok) {
      await vscode.window.showErrorMessage(
        `Accepted ${taskId} but assign-task-phase failed: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 520)}`
      );
    } else {
      ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
      await vscode.window.showInformationMessage(`Accepted ${taskId} and assigned phase ${phaseKey}.`);
    }
    this.notifyKitStateChanged();
  }

  private async onDashboardAcceptProposedBatch(taskIds: string[], categoryLabel: string): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    const phaseKey = await this.pickPhaseKeyFromDashboard({
      title: `Accept ${String(taskIds.length)} proposed ${categoryLabel} task(s) — target phase`
    });
    if (!phaseKey) {
      return;
    }
    const gate = await vscode.window.showWarningMessage(
      `Accept ${String(taskIds.length)} proposed ${categoryLabel} task(s) (→ ready) then assign each to phase ${phaseKey}? Each transition uses the same policy rationale.`,
      { modal: true },
      "Accept all"
    );
    if (gate !== "Accept all") {
      return;
    }
    const rationale =
      (await vscode.window.showInputBox({
        prompt: `Policy rationale for batch accept (${String(taskIds.length)} × accept on proposed ${categoryLabel})`,
        placeHolder: "Shown in policy trace / approval"
      })) ?? "vscode-extension batch accept";
    const failures: string[] = [];
    for (const taskId of taskIds) {
      const r = await this.client.run("run-transition", {
        taskId,
        action: "accept",
        policyApproval: { confirmed: true, rationale },
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        failures.push(`${taskId}: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 200)}`);
        continue;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      const r2 = await this.client.run("assign-task-phase", {
        taskId,
        phaseKey,
        ...expectedPlanningGenerationArgs()
      });
      if (!r2.ok) {
        failures.push(
          `${taskId} assign: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 180)}`
        );
      } else {
        ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
      }
    }
    if (failures.length > 0) {
      await vscode.window.showErrorMessage(
        `Some batch operations failed (${String(failures.length)}/${String(taskIds.length)}): ${failures.slice(0, 3).join(" · ")}`
      );
    } else {
      await vscode.window.showInformationMessage(
        `Accepted ${String(taskIds.length)} proposed ${categoryLabel} task(s) into phase ${phaseKey}.`
      );
    }
    this.notifyKitStateChanged();
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
      raw = (await this.client.run("dashboard-summary", {})) as
        | DashboardSummaryCommandSuccess
        | Record<string, unknown>;
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
    let phaseJournal: DashboardPhaseJournalBundle | undefined;
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      this.lastDashboardSummaryData = raw.data as Record<string, unknown>;
      ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
      try {
        const lp = (await this.client.run("list-phase-notes", {
          ...expectedPlanningGenerationArgs()
        })) as PhaseJournalKitPayload & Record<string, unknown>;
        ingestPlanningMetaFromData(lp.data as Record<string, unknown> | undefined);
        const gpc = (await this.client.run("get-phase-context", {
          ...expectedPlanningGenerationArgs()
        })) as PhaseJournalKitPayload & Record<string, unknown>;
        ingestPlanningMetaFromData(gpc.data as Record<string, unknown> | undefined);
        phaseJournal = {
          listPhaseNotes: {
            ok: lp.ok,
            code: lp.code,
            message: lp.message,
            data: lp.data as Record<string, unknown> | undefined
          },
          getPhaseContext: {
            ok: gpc.ok,
            code: gpc.code,
            message: gpc.message,
            data: gpc.data as Record<string, unknown> | undefined
          }
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        phaseJournal = {
          listPhaseNotes: {
            ok: false,
            code: "extension-phase-journal-read",
            message: msg
          },
          getPhaseContext: {
            ok: false,
            code: "extension-phase-journal-read",
            message: msg
          }
        };
      }
    } else {
      this.lastDashboardSummaryData = null;
    }
    let rootInner: string;
    const wizardPanel: PlanningInterviewWizardPanel | null = raw.ok === true ? this.planningWizardPanel() : null;
    try {
      const editorIntegration = await resolveEditorIntegrationState();
      rootInner = renderDashboardRootInnerHtml(raw, wizardPanel, editorIntegration, phaseJournal);
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

    const bootstrap = `(function(){
  var vscode = acquireVsCodeApi();
  var activeTab = 'overview';
  var activeFilter = 'all';

  function applyTab(tab) {
    if (!tab) return;
    activeTab = tab;
    document.querySelectorAll('.wc-tab-panel').forEach(function(p) {
      p.style.display = p.getAttribute('data-wc-tab') === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.wc-tab-btn').forEach(function(b) {
      var isActive = b.getAttribute('data-wc-tab') === tab;
      if (isActive) b.classList.add('wc-tab-active');
      else b.classList.remove('wc-tab-active');
    });
  }

  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (!m || m.type !== 'wcReplaceRoot' || typeof m.html !== 'string') return;
    var root = document.getElementById('root');
    if (!root) return;
    var open = {};
    root.querySelectorAll('details[data-wc-track]').forEach(function(d) {
      var k = d.getAttribute('data-wc-track');
      if (k && d.open) open[k] = true;
    });
    root.innerHTML = m.html;
    Object.keys(open).forEach(function(k) {
      var el = root.querySelector('details[data-wc-track="' + k + '"]');
      if (el) el.open = true;
    });
    applyTab(activeTab);
    if (activeFilter !== 'all') {
      var fc = root.querySelector('.wc-filter-chip[data-wc-filter-btn="' + activeFilter + '"]');
      if (fc) {
        root.querySelectorAll('.wc-filter-chip').forEach(function(c) { c.classList.toggle('wc-filter-active', c === fc); });
        root.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) { s.style.display = s.getAttribute('data-wc-filter') === activeFilter ? '' : 'none'; });
        var th = root.querySelector('.dashboard-terminal-tasks'); if (th) th.style.display = 'none';
      }
    }
  });

  applyTab(activeTab);

  var btn = document.getElementById('btn');
  var rootEl = document.getElementById('root');
  if (btn) btn.addEventListener('click', function() { vscode.postMessage({type:'refresh'}); });
  if (rootEl) rootEl.addEventListener('click', function(ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'BUTTON') return;
    if (t.classList.contains('wc-tab-btn')) {
      applyTab(t.getAttribute('data-wc-tab'));
      return;
    }
    if (t.classList.contains('wc-filter-chip')) {
      var f = t.getAttribute('data-wc-filter-btn') || 'all';
      activeFilter = f;
      rootEl.querySelectorAll('.wc-filter-chip').forEach(function(c) {
        c.classList.toggle('wc-filter-active', c === t);
      });
      rootEl.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) {
        var sf = s.getAttribute('data-wc-filter');
        s.style.display = (f === 'all' || sf === f) ? '' : 'none';
      });
      var termHost = rootEl.querySelector('.dashboard-terminal-tasks');
      if (termHost) termHost.style.display = (f === 'all') ? '' : 'none';
      return;
    }
    if (t.classList.contains('wc-stat-pill')) {
      var navTab = t.getAttribute('data-wc-pill-nav');
      var navFilter = t.getAttribute('data-wc-pill-filter') || 'all';
      if (navTab) applyTab(navTab);
      activeFilter = navFilter;
      rootEl.querySelectorAll('.wc-filter-chip').forEach(function(c) { c.classList.toggle('wc-filter-active', c.getAttribute('data-wc-filter-btn') === navFilter); });
      rootEl.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) { s.style.display = (navFilter === 'all' || s.getAttribute('data-wc-filter') === navFilter) ? '' : 'none'; });
      var termHostP = rootEl.querySelector('.dashboard-terminal-tasks'); if (termHostP) termHostP.style.display = navFilter === 'all' ? '' : 'none';
      return;
    }
    var act = t.getAttribute('data-wc-action');
    if (!act) return;
    ev.stopPropagation();
    if (act === 'wishlist-view') { var wv = (t.getAttribute('data-wishlist-id') || '').trim(); if (wv) vscode.postMessage({type:'openWishlistDetail',wishlistId:wv}); return; }
    if (act === 'planning-new-plan') { vscode.postMessage({type:'prefillPlanningInterviewChat'}); return; }
    if (act === 'planning-resume-chat') { var rc = (t.getAttribute('data-resume-cli') || '').trim(); vscode.postMessage({type:'prefillPlanningResumeChat',resumeCli:rc}); return; }
    if (act === 'planning-discard') { vscode.postMessage({type:'planningDiscard'}); return; }
    if (act === 'planning-wizard-start') { var sel = document.getElementById('wc-planning-type'); var pt = sel && sel.value ? String(sel.value).trim() : ''; if (pt) vscode.postMessage({type:'planningWizardStart',planningType:pt}); return; }
    if (act === 'planning-wizard-submit') { var ta = document.getElementById('wc-planning-answer'); var txt = ta && typeof ta.value === 'string' ? ta.value.trim() : ''; vscode.postMessage({type:'planningWizardSubmit',answer:txt}); return; }
    if (act === 'planning-wizard-cancel') { vscode.postMessage({type:'planningWizardCancel'}); return; }
    if (act === 'planning-wizard-dismiss') { vscode.postMessage({type:'planningWizardDismiss'});return;}if(act==="collaboration-hub"){vscode.postMessage({type:"prefillCollaborationHubChat"});return;}if(act==="deliver-phase-prompt"){var kp=(t.getAttribute("data-wc-kit-phase")||"").trim();vscode.postMessage({type:"prefillDeliverPhaseChat",kitPhase:kp});return;}if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="transcript-churn-research-chat"){var tcTid=(t.getAttribute("data-task-id")||"").trim();vscode.postMessage({type:"prefillTranscriptChurnResearchChat",taskId:tcTid});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph});return;}if(act==="proposed-imp-accept-phase"||act==="proposed-exe-accept-phase"){var batch=(t.getAttribute("data-proposed-task-ids")||"").trim();var cat=act==="proposed-exe-accept-phase"?"execution":"improvement";vscode.postMessage({type:"dashboardAcceptProposedPhase",category:cat,taskIds:batch});return;}if(act==="phase-note-dismiss"){var dpn=(t.getAttribute("data-note-id")||"").trim();var dpp=(t.getAttribute("data-note-priority")||"").trim();if(dpn)vscode.postMessage({type:"dismissPhaseNote",noteId:dpn,priority:dpp});return;}if(act==="phase-note-convert"){var cpn=(t.getAttribute("data-note-id")||"").trim();if(cpn)vscode.postMessage({type:"convertPhaseNote",noteId:cpn});return;}if(act==="phase-notes-propose-persist"){vscode.postMessage({type:"persistPhaseNoteProposals"});return;}if(act==="assign-phase"){var apTid=(t.getAttribute("data-task-id")||"").trim();if(apTid)vscode.postMessage({type:"assignTaskPhase",taskId:apTid});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});})();`;

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
    .dash-agent-status-banner {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-left: 3px solid var(--vscode-charts-blue, var(--vscode-button-background));
      border-radius: 6px;
      padding: 7px 8px;
      margin: 0 0 10px 0;
      background: var(--vscode-sideBar-background);
    }
    .dash-agent-status-banner p { margin: 0; line-height: 1.35; }
    .dash-agent-status-label { overflow-wrap: anywhere; }
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
    .dash-planning-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0; }
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
    button.dash-planning-discard-btn {
      margin: 0;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
    }
    .dash-planning-wizard {
      margin: 8px 0 10px 0;
      padding: 8px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
    }
    .dash-planning-wizard-picker-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .dash-planning-wizard-label {
      display: block;
      margin: 6px 0 2px 0;
      font-size: 11px;
      font-weight: 600;
    }
    .dash-planning-wizard-label-inline {
      display: inline;
      margin: 0;
      flex-shrink: 0;
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
    pre.resume-cli { font-size: 11px; }
    /* ── Tab system ── */
    .wc-tab-bar {
      display: flex;
      gap: 0;
      margin: -2px -8px 10px -8px;
      padding: 0 4px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      overflow-x: auto;
      scrollbar-width: none;
    }
    .wc-tab-bar::-webkit-scrollbar { display: none; }
    .wc-tab-btn {
      flex-shrink: 0;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 500;
      font-family: var(--vscode-font-family);
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.55;
      cursor: pointer;
      white-space: nowrap;
      transition: opacity 0.1s;
    }
    .wc-tab-btn:hover { opacity: 0.85; }
    .wc-tab-btn.wc-tab-active {
      opacity: 1;
      border-bottom-color: var(--vscode-button-background);
    }
    .wc-tab-panel { display: block; }
    /* ── Status KV rows ── */
    .wc-status-kv-block { margin: 4px 0 0 0; }
    .wc-status-kv {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      padding: 3px 0;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.18));
      font-size: 11px;
    }
    .wc-status-kv:last-child { border-bottom: none; }
    .wc-status-kv-label { color: var(--vscode-foreground); opacity: 0.65; flex-shrink: 0; }
    .wc-status-kv-val { text-align: right; word-break: break-all; opacity: 0.9; }
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
    /* ── Recommended Next card ── */
    .wc-rec-next {
      border: 1px solid var(--vscode-button-background);
      border-radius: 7px;
      padding: 9px 10px 8px;
      margin: 4px 0 10px 0;
      background: var(--vscode-editor-background);
      position: relative;
    }
    .wc-rec-header {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 5px;
    }
    .wc-rec-label {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--vscode-button-background);
      opacity: 0.9;
    }
    .wc-rec-title {
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 7px 0;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--vscode-foreground);
    }
    .wc-rec-footer {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
    .wc-rec-tag {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .wc-rec-tag-ready {
      background: var(--vscode-testing-iconPassed, rgba(30,80,40,0.5));
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      border-color: rgba(78,201,176,0.3);
    }
    .wc-rec-tag-cat {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-foreground);
      opacity: 0.75;
    }
    .wc-rec-tag-phase {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-textLink-foreground);
      opacity: 0.85;
    }
    .wc-rec-next-wishlist {
      border-color: var(--vscode-textLink-foreground);
    }
    .wc-rec-tag-wishlist {
      background: rgba(78, 148, 220, 0.18);
      color: var(--vscode-textLink-foreground);
      border-color: rgba(78, 148, 220, 0.45);
    }
    .wc-rec-tag-open {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-foreground);
      opacity: 0.65;
    }
    .wc-rec-wl-hint {
      font-size: 10px;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }
    .wc-rec-footer-actions {
      margin-left: auto;
      display: inline-flex;
      gap: 4px;
      flex-wrap: wrap;
      align-items: center;
    }
    button.wc-rec-wl-view {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }
    button.wc-rec-wl-view:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .wc-ready-scope-note {
      font-size: 10.5px;
      line-height: 1.35;
      margin: 6px 0 10px 0;
    }
    .wc-status-counts-scope-note {
      font-size: 10.5px;
      line-height: 1.35;
      margin: 8px 0 0 0;
    }
    button.wc-rec-start-btn {
      margin-left: auto;
      padding: 2px 9px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 5px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
      flex-shrink: 0;
    }
    button.wc-rec-start-btn:hover { background: var(--vscode-button-hoverBackground); }
    button.wc-rec-start-btn:active { filter: brightness(0.94); }
    /* ── Stat pills ── */
    .wc-stat-pills {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin: 0 0 10px 0;
    }
    .wc-stat-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 4px 5px;
      border-radius: 7px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      background: var(--vscode-textCodeBlock-background);
    }
    .wc-stat-num {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .wc-stat-lbl {
      font-size: 9px;
      opacity: 0.65;
      line-height: 1;
      text-align: center;
    }
    .wc-pill-ready .wc-stat-num { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-pill-ready { border-color: rgba(78,201,176,0.25); }
    .wc-pill-proposed .wc-stat-num { color: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-pill-proposed { border-color: rgba(79,193,255,0.25); }
    .wc-pill-blocked .wc-stat-num { color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-pill-blocked { border-color: rgba(204,167,0,0.25); }
    .wc-pill-done .wc-stat-num { color: var(--vscode-foreground); opacity: 0.55; }
    /* ── Filter chips ── */
    .wc-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0 0 8px 0;
    }
    button.wc-filter-chip {
      padding: 2px 9px;
      font-size: 10.5px;
      font-weight: 500;
      border-radius: 12px;
      cursor: pointer;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      background: transparent;
      color: var(--vscode-foreground);
      opacity: 0.6;
      transition: opacity 0.1s;
    }
    button.wc-filter-chip:hover { opacity: 0.85; }
    button.wc-filter-chip.wc-filter-active {
      opacity: 1;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
    }
    button.wc-filter-chip-ready.wc-filter-active {
      background: transparent;
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      border-color: var(--vscode-testing-iconPassed, #4ec9b0);
      opacity: 1;
    }
    button.wc-filter-chip-proposed.wc-filter-active {
      background: transparent;
      color: var(--vscode-textLink-foreground, #4fc1ff);
      border-color: var(--vscode-textLink-foreground, #4fc1ff);
      opacity: 1;
    }
    button.wc-filter-chip-blocked.wc-filter-active {
      background: transparent;
      color: var(--vscode-editorWarning-foreground, #cca700);
      border-color: var(--vscode-editorWarning-foreground, #cca700);
      opacity: 1;
    }
    /* ── CAE readiness ── */
    .wc-cae-readiness { }
    .wc-cae-score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .wc-cae-score-row > p { margin: 0; }
    .wc-cae-score-badge {
      font-size: 18px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      flex-shrink: 0;
    }
    .wc-cae-score-badge span { font-size: 11px; font-weight: 500; opacity: 0.7; margin-left: 1px; }
    .wc-cae-score-ok { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-cae-score-warn { color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-cae-score-bad { color: var(--vscode-errorForeground, #f44747); }
    .wc-cae-checks { margin: 6px 0 4px 0; display: flex; flex-direction: column; gap: 3px; }
    .wc-cae-check {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      line-height: 1.3;
    }
    .wc-cae-check-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      font-size: 9px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .wc-cae-check-ok {
      background: rgba(78,201,176,0.18);
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      border: 1px solid rgba(78,201,176,0.35);
    }
    .wc-cae-check-warn {
      background: rgba(204,167,0,0.18);
      color: var(--vscode-editorWarning-foreground, #cca700);
      border: 1px solid rgba(204,167,0,0.35);
    }
    .wc-cae-check-label { flex: 1; min-width: 0; }
    .wc-cae-check-meta { flex-shrink: 0; }
    .wc-cae-decisions { margin-top: 8px; }
    .wc-cae-decisions > p { margin: 0 0 4px 0; }
    .wc-cae-decision {
      font-size: 11px;
      padding: 4px 6px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      margin-bottom: 4px;
      line-height: 1.35;
      border-left: 2px solid var(--vscode-editorWarning-foreground, #cca700);
    }
    /* ── Stat pill as interactive button ── */
    button.wc-stat-pill {
      cursor: pointer;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      background: var(--vscode-textCodeBlock-background);
      transition: border-color 0.1s, background 0.1s;
      width: 100%;
    }
    button.wc-stat-pill:hover { background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.1)); }
    button.wc-pill-ready:hover { border-color: var(--vscode-testing-iconPassed, #4ec9b0); }
    button.wc-pill-proposed:hover { border-color: var(--vscode-textLink-foreground, #4fc1ff); }
    button.wc-pill-blocked:hover { border-color: var(--vscode-editorWarning-foreground, #cca700); }
    button.wc-pill-done:hover { border-color: var(--vscode-foreground); }
    /* ── Empty section muting ── */
    details.status-section.wc-section-empty {
      opacity: 0.32;
      pointer-events: none;
    }
    /* ── Blocker card urgency ── */
    .dash-card.wc-blocker-card {
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
      background: var(--vscode-inputValidation-warningBackground, rgba(204,167,0,0.06));
    }
    /* ── Color-coded section header left-borders ── */
    details.status-section[data-wc-filter="ready"] > summary {
      border-left: 3px solid var(--vscode-testing-iconPassed, #4ec9b0);
      padding-left: 6px;
      margin-left: -2px;
    }
    details.status-section[data-wc-filter="proposed"] > summary {
      border-left: 3px solid var(--vscode-textLink-foreground, #4fc1ff);
      padding-left: 6px;
      margin-left: -2px;
    }
    details.status-section[data-wc-filter="blocked"] > summary {
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
      padding-left: 6px;
      margin-left: -2px;
    }
    details.status-section[data-wc-filter="research"] > summary {
      border-left: 3px solid var(--vscode-foreground);
      padding-left: 6px;
      margin-left: -2px;
      opacity: 0.55;
    }
    details.status-section[data-wc-filter="terminal"] > summary {
      border-left: 3px solid var(--vscode-foreground);
      padding-left: 6px;
      margin-left: -2px;
      opacity: 0.4;
    }
    /* ── Tab badge ── */
    .wc-tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 15px;
      height: 14px;
      border-radius: 7px;
      font-size: 9px;
      font-weight: 700;
      padding: 0 3px;
      margin-left: 4px;
      vertical-align: middle;
      line-height: 1;
    }
    .wc-tab-badge-ready {
      background: var(--vscode-testing-iconPassed, #4ec9b0);
      color: #000;
    }
    .wc-tab-badge-blocked {
      background: var(--vscode-editorWarning-foreground, #cca700);
      color: #000;
    }
  </style>
</head>
<body>
  <div id="root">${rootInnerHtml}</div>
  <footer class="dash-footer">
    <button type="button" id="btn" class="dash-refresh-btn" title="Refetch dashboard-summary now. The panel also reloads when you switch back to it, when kit-owned files change, and about every 45s while visible.">Refresh</button>
  </footer>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
