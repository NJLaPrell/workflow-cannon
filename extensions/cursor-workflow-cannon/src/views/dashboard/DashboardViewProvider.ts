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
  buildPhaseNotesDiscoveryPrompt,
  buildPlanningInterviewPrompt,
  buildPlanningInterviewResumePrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../../playbook-chat-prompts.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { executeCreateWishlistFromValidatedFields } from "../../add-wishlist-item-flow.js";
import {
  escapeHtml,
  lazyTerminalBucketListLimit,
  renderDashboardQueueTaskRowsHtml,
  renderDashboardRootInnerHtml,
  type DashboardPhaseJournalBundle,
  type PhaseJournalKitPayload,
  type PlanningInterviewWizardPanel
} from "./render-dashboard.js";
import { GuidanceAuthoringExtensionSide } from "../guidance/guidance-authoring-extension-side.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "../guidance/render-guidance-panel.js";
import { STATUS_PANEL_EMBED_CSS } from "../status/render-status-tab.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";
import {
  buildAcceptProposedDrawerSpec,
  buildAddPhaseNoteDrawerSpec,
  buildAddWishlistDrawerSpec,
  buildAssignTaskPhaseDrawerSpec,
  buildConvertPhaseNoteDrawerSpec,
  buildDismissPhaseNoteDrawerSpec,
  buildEditPhaseNoteDrawerSpec,
  buildPersistPhaseNoteProposalsDrawerSpec,
  buildRegisterPhaseCatalogDrawerSpec,
  buildViewPhaseNoteDrawerSpec,
  normalizeDrawerValues,
  renderDrawerFormHtml,
  validateAcceptProposedSubmit,
  validateAddPhaseNoteSubmit,
  validateAddWishlistSubmit,
  validateAssignTaskPhaseSubmit,
  validateDismissPhaseNoteSubmit,
  validateEditPhaseNoteSubmit,
  validateRegisterPhaseCatalogSubmit
} from "./dashboard-input-drawer.js";

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

type DashboardDrawerSession =
  | { kind: "register-catalog" }
  | { kind: "dismiss-note"; noteId: string; priority: string }
  | { kind: "view-phase-note"; noteId: string }
  | { kind: "edit-phase-note"; noteId: string }
  | { kind: "add-wishlist" }
  | { kind: "assign-task-phase"; taskId: string }
  | { kind: "add-phase-note" }
  | { kind: "convert-phase-note"; noteId: string }
  | { kind: "persist-phase-note-proposals" }
  | { kind: "accept-proposed"; taskIds: string[]; categoryLabel: string };

function logDashboard(message: string): void {
  if (!dashboardOutput) {
    dashboardOutput = vscode.window.createOutputChannel("Workflow Cannon", { log: true });
  }
  dashboardOutput.appendLine(`[dashboard] ${message}`);
}

const DASHBOARD_GUIDANCE_AUTHORING_MESSAGE_TYPES = new Set([
  "validateRegistry",
  "openArtifact",
  "artifactAction",
  "activationAction",
  "artifactMutation",
  "activationMutation",
  "guidancePreview",
  "listRegistryVersions",
  "portabilityRun",
  "activationBulk"
]);

function isDashboardGuidanceAuthoringMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return typeof t === "string" && DASHBOARD_GUIDANCE_AUTHORING_MESSAGE_TYPES.has(t);
}

function isWishlistPagingArgRejection(raw: Record<string, unknown>): boolean {
  if (raw.ok !== false || raw.code !== "invalid-run-args") return false;
  const details = raw.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const errors = (details as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((error) => {
    if (!error || typeof error !== "object" || Array.isArray(error)) return false;
    const params = (error as Record<string, unknown>).params;
    if (!params || typeof params !== "object" || Array.isArray(params)) return false;
    const additionalProperty = (params as Record<string, unknown>).additionalProperty;
    return additionalProperty === "wishlistPage" || additionalProperty === "wishlistPageSize";
  });
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
    const cat = phaseSlice.phaseCatalog;
    if (cat && typeof cat === "object") {
      const phases = (cat as { phases?: unknown }).phases;
      if (Array.isArray(phases)) {
        for (const raw of phases) {
          if (!raw || typeof raw !== "object") {
            continue;
          }
          const pk = (raw as { phaseKey?: unknown }).phaseKey;
          const sd = (raw as { shortDescription?: unknown }).shortDescription;
          const inCatalog = (raw as { inCatalog?: unknown }).inCatalog === true;
          if (typeof pk !== "string" || !pk.trim()) {
            continue;
          }
          const key = pk.trim();
          if (typeof sd === "string" && sd.trim()) {
            // Catalogued with description: show the deliverable.
            add(key, `Catalog · ${String(sd).trim().slice(0, 72)}`);
          } else if (inCatalog) {
            // Catalogued but no description recorded yet.
            add(key, `Phase ${key} (no description)`);
          }
          // Else: phantom phase key (no catalog row, no description). Skip — the
          // bucket scan below will add it with a meaningful label if any live tasks
          // reference it; otherwise it stays out of the dropdown.
        }
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

  /** Monotonic render token so slower dashboard reads cannot overwrite newer user navigation. */
  private dashboardUpdateSequence = 0;

  /** Coalesce refresh triggers so watcher churn and button flows do not spawn overlapping CLI reads. */
  private dashboardUpdateInFlight: Promise<void> | undefined;
  private dashboardUpdateQueued = false;
  private dashboardDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** 0-based page for wishlist rows in `dashboard-summary` (5 per page). */
  private wishlistPage = 0;

  private planningWizard: DashboardPlanningWizardState = { kind: "idle" };

  /** In-webview drawer session (register catalog, dismiss phase note, …). */
  private dashboardDrawerSession: DashboardDrawerSession | null = null;

  /** CAE authoring bootstrap messages + mutation drawer (same contract as Guidance panel). */
  private dashboardGuidanceAuthoring?: GuidanceAuthoringExtensionSide;

  /** Last successful `dashboard-summary` `data` — used for phase QuickPick targets. */
  private lastDashboardSummaryData: Record<string, unknown> | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>,
    private readonly notifyKitStateChanged: () => void
  ) {
    onKitStateChanged(() => {
      this.schedulePushUpdate(400);
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    const { webview } = webviewView;
    this.dashboardGuidanceAuthoring = new GuidanceAuthoringExtensionSide({
      client: this.client,
      workspaceFolder: vscode.workspace.workspaceFolders?.[0],
      extensionUri: this.extensionUri,
      getWebview: () => this.view?.webview,
      reloadAfterMutations: async () => {
        await this.pushUpdate();
      }
    });
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    logDashboard("resolveWebviewView: wiring handlers");
    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "refresh") {
        await this.pushUpdate();
      }
      if (msg?.type === "loadLazyTerminalBucket") {
        const terminalRaw = (msg as { terminalStatus?: unknown }).terminalStatus;
        const terminalStatus =
          terminalRaw === "completed" || terminalRaw === "cancelled" ? terminalRaw : null;
        const phaseKey =
          typeof (msg as { phaseKey?: unknown }).phaseKey === "string"
            ? (msg as { phaseKey: string }).phaseKey
            : "";
        if (terminalStatus) {
          void this.loadLazyTerminalBucket(phaseKey, terminalStatus);
        }
      }
      if (msg?.type === "wishlistPage") {
        const rawP = (msg as { page?: unknown }).page;
        const p =
          typeof rawP === "number" && Number.isInteger(rawP) && rawP >= 0
            ? rawP
            : typeof rawP === "string" && /^\d+$/.test(rawP.trim())
              ? parseInt(rawP.trim(), 10)
              : 0;
        this.wishlistPage = p;
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
        await this.openAddWishlistDrawer();
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
        const phaseKeyRaw = msg?.phaseKey;
        const phaseKey =
          typeof phaseKeyRaw === "string" && phaseKeyRaw.trim().length > 0
            ? phaseKeyRaw.trim()
            : phaseKeyFromPhrase(phasePhrase);
        const wsCur =
          typeof msg?.workspaceCurrentPhase === "string" ? msg.workspaceCurrentPhase.trim() : "";
        const wsNext =
          typeof msg?.workspaceNextPhase === "string" ? msg.workspaceNextPhase.trim() : "";
        const seededRaw = msg?.seededTaskIds;
        const seededTaskIds = Array.isArray(seededRaw)
          ? seededRaw
              .map((x: unknown) => String(x ?? "").trim())
              .filter((id: string) => id.length > 0)
          : typeof msg?.seededTaskIdsCsv === "string"
            ? msg.seededTaskIdsCsv
                .split(",")
                .map((x: string) => x.trim())
                .filter((id: string) => id.length > 0)
            : [];
        const scopeRaw = msg?.scope;
        const scope =
          scopeRaw === "current" || scopeRaw === "bucket" ? scopeRaw : undefined;
        await this.client.recordActivity({
          kind: "releasing",
          command: "phase-complete-release",
          phaseKey,
          details: {
            source: "dashboard-complete-release",
            phasePhrase,
            scope: scope ?? "bucket",
            seededTaskCount: seededTaskIds.length
          }
        });
        await prefillCursorChat(
          buildPhaseCompleteReleaseChatPrompt(phasePhrase, {
            phaseKey,
            workspaceCurrentPhase: wsCur || undefined,
            workspaceNextPhase: wsNext || undefined,
            seededTaskIds,
            scope
          })
        );
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
          if (!this.dashboardDrawerSession) {
            await this.pushUpdate();
          }
        }
      }
      if (msg?.type === "viewPhaseNote") {
        const noteId = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        if (noteId.length > 0) {
          await this.onViewPhaseNote({
            noteId,
            noteType: typeof msg.noteType === "string" ? msg.noteType : "",
            priority: typeof msg.priority === "string" ? msg.priority : "",
            summary: typeof msg.summary === "string" ? msg.summary : "",
            details: typeof msg.details === "string" ? msg.details : ""
          });
        }
      }
      if (msg?.type === "editPhaseNote") {
        const noteId = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        if (noteId.length > 0) {
          await this.onEditPhaseNote({
            noteId,
            summary: typeof msg.summary === "string" ? msg.summary : "",
            details: typeof msg.details === "string" ? msg.details : ""
          });
        }
      }
      if (msg?.type === "deletePhaseNote") {
        const noteId = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        const priority = typeof msg.priority === "string" ? msg.priority.trim() : "";
        if (noteId.length > 0) {
          await this.onDismissPhaseNote(noteId, priority);
        }
      }
      if (msg?.type === "addPhaseNote") {
        await this.onAddPhaseNote();
        await this.pushUpdate();
      }
      if (msg?.type === "prefillPhaseNotesDiscoveryChat") {
        await prefillCursorChat(buildPhaseNotesDiscoveryPrompt(), { newChat: true });
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
      if (msg?.type === "registerPhaseCatalogEntry") {
        await this.onRegisterPhaseCatalogEntry();
        if (!this.dashboardDrawerSession) {
          await this.pushUpdate();
        }
      }
      if (msg?.type === "updatePhaseDeliverables") {
        const phaseKey = typeof msg.phaseKey === "string" ? msg.phaseKey.trim() : "";
        const rawValue = msg.deliverables;
        const deliverables =
          rawValue === null ? null : typeof rawValue === "string" ? rawValue : "";
        const rawMutationId = typeof msg.clientMutationId === "string" ? msg.clientMutationId.trim() : "";
        const clientMutationId = rawMutationId.length > 0 ? rawMutationId : undefined;
        if (phaseKey.length > 0 && (deliverables === null || typeof deliverables === "string")) {
          const refreshed = await this.onUpdatePhaseDeliverables(phaseKey, deliverables, clientMutationId);
          if (refreshed) {
            await this.pushUpdate();
          } else {
            await this.view?.webview.postMessage({
              type: "wcPhaseDeliverablesError",
              phaseKey,
              message: "Unable to save deliverables. The previous value was restored."
            });
          }
        }
      }
      if (msg?.type === "drawerSubmit") {
        const rawVals = (msg as { values?: unknown }).values;
        const values = normalizeDrawerValues(rawVals);
        if (await this.dashboardGuidanceAuthoring?.handleCaeDrawerSubmitIfActive(values)) {
          return;
        }
        const refreshed = await this.handleDrawerSubmit(values);
        if (refreshed) {
          await this.pushUpdate();
        }
      }
      if (msg?.type === "drawerCancel") {
        if (await this.dashboardGuidanceAuthoring?.handleCaeDrawerCancelIfActive()) {
          return;
        }
        this.closeDashboardDrawer();
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
      if (msg?.type === "viewTaskComments") {
        const tid = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        if (tid.length > 0) {
          await this.onTaskCommentsComingSoon(tid, "view");
        }
      }
      if (msg?.type === "addTaskComment") {
        const tid = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        if (tid.length > 0) {
          await this.onTaskCommentsComingSoon(tid, "add");
        }
      }
      if (isDashboardGuidanceAuthoringMessage(msg)) {
        this.dashboardGuidanceAuthoring?.dispatchWebviewMessage(msg);
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
      if (this.dashboardDebounceTimer) {
        clearTimeout(this.dashboardDebounceTimer);
        this.dashboardDebounceTimer = undefined;
      }
      if (this.dashboardPollTimer) {
        clearInterval(this.dashboardPollTimer);
        this.dashboardPollTimer = undefined;
      }
      if (this.view === webviewView) {
        this.view = undefined;
      }
      this.dashboardGuidanceAuthoring = undefined;
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

  private async loadLazyTerminalBucket(
    phaseKey: string,
    terminalStatus: "completed" | "cancelled"
  ): Promise<void> {
    const pk = phaseKey.trim();
    const phaseKeyArg = pk.length > 0 ? pk : "__no_phase__";
    try {
      const raw = await this.client.run("list-tasks", {
        phaseKey: phaseKeyArg,
        status: terminalStatus,
        limit: lazyTerminalBucketListLimit()
      });
      const data =
        raw && typeof raw === "object" && "data" in raw
          ? (raw as { data?: unknown }).data
          : undefined;
      const tasks =
        data && typeof data === "object" && Array.isArray((data as { tasks?: unknown }).tasks)
          ? ((data as { tasks: unknown[] }).tasks as unknown[])
          : [];
      const html = renderDashboardQueueTaskRowsHtml(tasks);
      await this.view?.webview.postMessage({
        type: "wcLazyTerminalBucketHtml",
        phaseKey: pk,
        terminalStatus,
        html
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load tasks.";
      await this.view?.webview.postMessage({
        type: "wcLazyTerminalBucketHtml",
        phaseKey: pk,
        terminalStatus,
        html:
          '<p class="muted wc-lazy-bucket-hint" role="status">' + escapeHtml(message) + "</p>"
      });
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

  /** Resolve `phaseKey` for `add-phase-note` from the last dashboard-summary payload. */
  private inferPhaseKeyForKitPhaseNoteFromDashboard(): string | undefined {
    const data = this.lastDashboardSummaryData;
    if (!data || typeof data !== "object") {
      return undefined;
    }
    const sys = data.systemStatus as Record<string, unknown> | undefined;
    const sl = sys?.phase as Record<string, unknown> | undefined;
    if (!sl || typeof sl !== "object") {
      return undefined;
    }
    for (const key of ["canonicalPhaseKey", "workspaceStatusPhaseKey", "configPhaseKey"] as const) {
      const v = sl[key];
      if (typeof v === "string" && v.trim()) {
        return v.trim();
      }
    }
    const curKP = sl.currentKitPhase;
    if (typeof curKP === "string" && curKP.trim()) {
      const fromPhrase = phaseKeyFromPhrase(curKP.trim());
      if (fromPhrase) {
        return fromPhrase;
      }
      const t = curKP.trim();
      if (/^\d+$/.test(t)) {
        return t;
      }
    }
    return undefined;
  }

  /**
   * Register or update a future phase row in `kit_phase_catalog` (upsert-phase-catalog-entry).
   * Uses the in-webview drawer (no `showInputBox`).
   */
  private async onRegisterPhaseCatalogEntry(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildRegisterPhaseCatalogDrawerSpec());
    this.dashboardDrawerSession = { kind: "register-catalog" };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  /** Update a phase roster Deliverables value via upsert-phase-catalog-entry with one mismatch retry. */
  private async onUpdatePhaseDeliverables(
    phaseKey: string,
    deliverables: string | null,
    clientMutationId?: string
  ): Promise<boolean> {
    const runOnce = async () => {
      const args: Record<string, unknown> = {
        phaseKey,
        actor: "cursor-dashboard",
        ...expectedPlanningGenerationArgs()
      };
      if (clientMutationId) {
        args.clientMutationId = clientMutationId;
      }
      args.shortDescription = deliverables === null ? null : deliverables.trim();
      return this.client.run("upsert-phase-catalog-entry", args);
    };

    await this.client.recordActivity({
      kind: "validating",
      phaseKey,
      command: "upsert-phase-catalog-entry",
      details: { source: "dashboard-phase-roster-deliverables" }
    });

    let out = await runOnce();
    if (out.ok !== true && out.code === "planning-generation-mismatch") {
      await this.ingestPlanningGenFromDashboard();
      out = await runOnce();
    }
    await this.client.clearActivity();

    if (out.ok !== true) {
      await vscode.window.showErrorMessage(
        `upsert-phase-catalog-entry failed: ${String(out.message ?? out.code ?? "unknown error")}`
      );
      return false;
    }

    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    this.notifyKitStateChanged();
    return true;
  }

  private closeDashboardDrawer(): void {
    this.dashboardDrawerSession = null;
    void this.view?.webview.postMessage({ type: "wcDrawerClose" });
  }

  private async openAddWishlistDrawer(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildAddWishlistDrawerSpec());
    this.dashboardDrawerSession = { kind: "add-wishlist" };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onTaskCommentsComingSoon(taskId: string, mode: "view" | "add"): Promise<void> {
    const actionLabel = mode === "add" ? "Add comment" : "View comments";
    const pick = await vscode.window.showInformationMessage(
      `${actionLabel} for ${taskId} is coming soon. Use the wishlist flow to track comment work, or open the task detail meanwhile.`,
      "Add wishlist item",
      "Open task detail"
    );
    if (pick === "Add wishlist item") {
      await this.openAddWishlistDrawer();
      return;
    }
    if (pick === "Open task detail") {
      await vscode.commands.executeCommand("workflowCannon.task.showDetail", taskId);
    }
  }

  private async postDrawerValidationToWebview(message: string): Promise<void> {
    await this.view?.webview.postMessage({ type: "wcDrawerValidation", message });
  }

  /**
   * @returns true when dashboard-summary should refresh (mutating kit command succeeded).
   */
  private async handleDrawerSubmit(values: Record<string, string>): Promise<boolean> {
    const session = this.dashboardDrawerSession;
    if (!session) {
      return false;
    }
    if (session.kind === "register-catalog") {
      const validated = validateRegisterPhaseCatalogSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { phaseKey, shortDescription } = validated.values;
      await this.client.recordActivity({
        kind: "validating",
        phaseKey,
        command: "upsert-phase-catalog-entry",
        details: { source: "dashboard-phase-catalog" }
      });
      const args: Record<string, unknown> = {
        phaseKey,
        ...expectedPlanningGenerationArgs()
      };
      args.shortDescription = shortDescription.length > 0 ? shortDescription : null;
      const out = await this.client.run("upsert-phase-catalog-entry", args);
      await this.client.clearActivity();
      if (!out.ok) {
        const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
        await this.postDrawerValidationToWebview(`upsert-phase-catalog-entry failed: ${detail}`);
        return false;
      }
      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(`Phase catalog updated for ${phaseKey}`);
      return true;
    }
    if (session.kind === "dismiss-note") {
      const validated = validateDismissPhaseNoteSubmit(session.priority, values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { reason, policyRationale } = validated.values;
      let policyApproval: { confirmed: boolean; rationale: string } | undefined;
      if (session.priority === "critical") {
        const gate = await vscode.window.showWarningMessage(
          "Dismiss an active critical phase note — kit policy may require explicit approval.",
          { modal: true },
          "Continue"
        );
        if (gate !== "Continue") {
          return false;
        }
        policyApproval = { confirmed: true, rationale: policyRationale };
      }
      const args: Record<string, unknown> = {
        noteId: session.noteId,
        reason,
        ...expectedPlanningGenerationArgs()
      };
      if (policyApproval) {
        args.policyApproval = policyApproval;
      }
      const r = await this.client.run("dismiss-phase-note", args);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(r.message ?? "Phase note dismissed");
      return true;
    }
    if (session.kind === "view-phase-note") {
      this.closeDashboardDrawer();
      return false;
    }
    if (session.kind === "edit-phase-note") {
      const validated = validateEditPhaseNoteSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const args: Record<string, unknown> = {
        noteId: session.noteId,
        summary: validated.values.summary,
        details: validated.values.details.length > 0 ? validated.values.details : null,
        ...expectedPlanningGenerationArgs()
      };
      const r = await this.client.run("update-phase-note", args);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(r.message ?? "Phase note updated");
      return true;
    }
    if (session.kind === "add-wishlist") {
      const validated = validateAddWishlistSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const created = await executeCreateWishlistFromValidatedFields(this.client, validated.values);
      if (!created.ok) {
        await this.postDrawerValidationToWebview(created.error.slice(0, 900));
        return false;
      }
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      this.wishlistPage = 0;
      return true;
    }
    if (session.kind === "assign-task-phase") {
      const validated = validateAssignTaskPhaseSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { phaseKey } = validated.values;
      const shortDescription = validated.values.shortDescription;
      const taskId = session.taskId;
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
      await this.client.clearActivity();
      if (!out.ok) {
        const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
        await this.postDrawerValidationToWebview(`assign-task-phase failed: ${detail}`.slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
      // If the operator supplied a deliverable, upsert (or create) the catalog row
      // so future dropdown labels are meaningful for this phase key.
      let deliverableNote = "";
      if (shortDescription) {
        const deliverableOk = await this.onUpdatePhaseDeliverables(
          phaseKey,
          shortDescription,
          `assign-${taskId}-${Date.now()}`
        );
        deliverableNote = deliverableOk
          ? " · catalog row updated"
          : " · catalog upsert failed (see error)";
      }
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(
        `Phase set for ${taskId} → ${phaseKey}${deliverableNote}`
      );
      return true;
    }
    if (session.kind === "add-phase-note") {
      const phaseKey = this.inferPhaseKeyForKitPhaseNoteFromDashboard();
      if (!phaseKey) {
        await this.postDrawerValidationToWebview("Could not resolve phaseKey from dashboard summary; refresh and retry.");
        return false;
      }
      const validated = validateAddPhaseNoteSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { noteType, summary, priority, details } = validated.values;
      const args: Record<string, unknown> = {
        phaseKey,
        noteType,
        summary,
        priority,
        ...expectedPlanningGenerationArgs()
      };
      if (details.length > 0) {
        args.details = details;
      }
      const r = await this.client.run("add-phase-note", args);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(r.message ?? "Phase note added");
      return true;
    }
    if (session.kind === "convert-phase-note") {
      const r = await this.client.run("convert-phase-note-to-task", {
        noteId: session.noteId,
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(r.message ?? "Converted phase note to task");
      return true;
    }
    if (session.kind === "persist-phase-note-proposals") {
      const r = await this.client.run("propose-tasks-from-phase-notes", {
        persist: true,
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      await vscode.window.showInformationMessage(r.message ?? "Persisted phase note proposals");
      return true;
    }
    if (session.kind === "accept-proposed") {
      const validated = validateAcceptProposedSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { phaseKey, policyRationale } = validated.values;
      const taskIds = session.taskIds;
      const categoryLabel = session.categoryLabel;
      if (taskIds.length === 0) {
        return false;
      }
      if (taskIds.length === 1) {
        const taskId = taskIds[0]!;
        const r = await this.client.run("run-transition", {
          taskId,
          action: "accept",
          policyApproval: { confirmed: true, rationale: policyRationale },
          ...expectedPlanningGenerationArgs()
        });
        if (!r.ok) {
          await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
          return false;
        }
        ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
        const r2 = await this.client.run("assign-task-phase", {
          taskId,
          phaseKey,
          ...expectedPlanningGenerationArgs()
        });
        if (!r2.ok) {
          this.closeDashboardDrawer();
          this.notifyKitStateChanged();
          await vscode.window.showErrorMessage(
            `Accepted ${taskId} but assign-task-phase failed: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 520)}`
          );
          return true;
        }
        ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
        this.closeDashboardDrawer();
        this.notifyKitStateChanged();
        await vscode.window.showInformationMessage(`Accepted ${taskId} and assigned phase ${phaseKey}.`);
        return true;
      }
      const failures: string[] = [];
      for (const taskId of taskIds) {
        const r = await this.client.run("run-transition", {
          taskId,
          action: "accept",
          policyApproval: { confirmed: true, rationale: policyRationale },
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
          failures.push(`${taskId} assign: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 180)}`);
        } else {
          ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
        }
      }
      this.closeDashboardDrawer();
      this.notifyKitStateChanged();
      if (failures.length > 0) {
        await vscode.window.showErrorMessage(
          `Some batch operations failed (${String(failures.length)}/${String(taskIds.length)}): ${failures
            .slice(0, 3)
            .join(" · ")}`.slice(0, 900)
        );
        return true;
      }
      await vscode.window.showInformationMessage(
        `Accepted ${String(taskIds.length)} proposed ${categoryLabel.trim() || "task"}(s) into phase ${phaseKey}.`
      );
      return true;
    }
    return false;
  }

  /**
   * Dashboard "Phase" row action → `assign-task-phase` with planning-generation prelude when required.
   */
  private async onAssignTaskPhase(taskId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const html = renderDrawerFormHtml(buildAssignTaskPhaseDrawerSpec(taskId, suggestions));
    this.dashboardDrawerSession = { kind: "assign-task-phase", taskId };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onDismissPhaseNote(noteId: string, priority: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildDismissPhaseNoteDrawerSpec(noteId, priority));
    this.dashboardDrawerSession = { kind: "dismiss-note", noteId, priority };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onViewPhaseNote(params: {
    noteId: string;
    noteType: string;
    priority: string;
    summary: string;
    details: string;
  }): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildViewPhaseNoteDrawerSpec(params));
    this.dashboardDrawerSession = { kind: "view-phase-note", noteId: params.noteId };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onEditPhaseNote(params: {
    noteId: string;
    summary: string;
    details: string;
  }): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildEditPhaseNoteDrawerSpec(params));
    this.dashboardDrawerSession = { kind: "edit-phase-note", noteId: params.noteId };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onAddPhaseNote(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const phaseKey = this.inferPhaseKeyForKitPhaseNoteFromDashboard();
    if (!phaseKey) {
      await vscode.window.showErrorMessage(
        "Cannot resolve phaseKey for add-phase-note from the dashboard summary. Refresh the dashboard and try again."
      );
      return;
    }
    const html = renderDrawerFormHtml(buildAddPhaseNoteDrawerSpec(phaseKey));
    this.dashboardDrawerSession = { kind: "add-phase-note" };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onConvertPhaseNote(noteId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildConvertPhaseNoteDrawerSpec(noteId));
    this.dashboardDrawerSession = { kind: "convert-phase-note", noteId };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onPersistPhaseNoteProposals(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildPersistPhaseNoteProposalsDrawerSpec());
    this.dashboardDrawerSession = { kind: "persist-phase-note-proposals" };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  /** Proposed-row Accept → drawer (phase + policy rationale) → run-transition accept → assign-task-phase. */
  private async onDashboardAcceptProposed(taskId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const html = renderDrawerFormHtml(
      buildAcceptProposedDrawerSpec({ taskIds: [taskId], categoryLabel: "", suggestions })
    );
    this.dashboardDrawerSession = { kind: "accept-proposed", taskIds: [taskId], categoryLabel: "" };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  private async onDashboardAcceptProposedBatch(taskIds: string[], categoryLabel: string): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    if (this.dashboardDrawerSession) {
      return;
    }
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const html = renderDrawerFormHtml(
      buildAcceptProposedDrawerSpec({ taskIds, categoryLabel, suggestions })
    );
    this.dashboardDrawerSession = { kind: "accept-proposed", taskIds, categoryLabel };
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
  }

  /**
   * Embeds rendered HTML in `webview.html` so the panel works even when postMessage delivery is flaky.
   * Buttons still use a tiny inline script + postMessage (host only receives clicks).
   */
  private async pushUpdate(): Promise<void> {
    if (this.dashboardDebounceTimer) {
      clearTimeout(this.dashboardDebounceTimer);
      this.dashboardDebounceTimer = undefined;
    }
    if (this.dashboardUpdateInFlight) {
      this.dashboardUpdateQueued = true;
      await this.dashboardUpdateInFlight;
      return;
    }
    const refresh = this.runDashboardUpdateLoop();
    this.dashboardUpdateInFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.dashboardUpdateInFlight === refresh) {
        this.dashboardUpdateInFlight = undefined;
      }
    }
  }

  private schedulePushUpdate(delayMs: number): void {
    if (!this.view) {
      return;
    }
    if (this.dashboardDebounceTimer) {
      clearTimeout(this.dashboardDebounceTimer);
    }
    this.dashboardDebounceTimer = setTimeout(() => {
      this.dashboardDebounceTimer = undefined;
      void this.pushUpdate();
    }, delayMs);
  }

  private async runDashboardUpdateLoop(): Promise<void> {
    do {
      this.dashboardUpdateQueued = false;
      await this.pushUpdateOnce();
    } while (this.dashboardUpdateQueued && this.view);
  }

  private async pushUpdateOnce(): Promise<void> {
    const activeView = this.view;
    if (!activeView) {
      return;
    }
    const { webview } = activeView;
    const updateSequence = ++this.dashboardUpdateSequence;
    const requestedWishlistPage = this.wishlistPage;
    const startedAt = Date.now();
    let raw: DashboardSummaryCommandSuccess | Record<string, unknown>;
    try {
      raw = (await this.client.run("dashboard-summary", {
        wishlistPage: requestedWishlistPage,
        wishlistPageSize: 5
      })) as DashboardSummaryCommandSuccess | Record<string, unknown>;
      if (isWishlistPagingArgRejection(raw as Record<string, unknown>)) {
        logDashboard("pushUpdate: dashboard-summary runtime rejected wishlist paging args; retrying without paging");
        this.wishlistPage = 0;
        raw = (await this.client.run("dashboard-summary", {})) as DashboardSummaryCommandSuccess | Record<string, unknown>;
      }
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
    if (updateSequence !== this.dashboardUpdateSequence || this.view !== activeView) {
      logDashboard(
        `pushUpdate: stale dashboard-summary ignored page=${String(requestedWishlistPage)}`
      );
      return;
    }
    let phaseJournal: DashboardPhaseJournalBundle | undefined;
    let embeddedCaePanelHtml: string | null = null;
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      this.lastDashboardSummaryData = raw.data as Record<string, unknown>;
      ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
      try {
        const [lp, gpc, caeSummary] = (await Promise.all([
          this.client.run("list-phase-notes", {
            ...expectedPlanningGenerationArgs()
          }),
          this.client.run("get-phase-context", {
            ...expectedPlanningGenerationArgs()
          }),
          this.client.run("cae-dashboard-summary", { schemaVersion: 1 })
        ])) as [
          PhaseJournalKitPayload & Record<string, unknown>,
          PhaseJournalKitPayload & Record<string, unknown>,
          Record<string, unknown>
        ];
        ingestPlanningMetaFromData(lp.data as Record<string, unknown> | undefined);
        ingestPlanningMetaFromData(gpc.data as Record<string, unknown> | undefined);
        embeddedCaePanelHtml = renderGuidanceAuthoringPanelInnerHtml(caeSummary);

        const pastFromSummary = (raw.data as Record<string, unknown>).pastPhaseNotes;
        const pastPhaseNotes: DashboardPhaseJournalBundle["pastPhaseNotes"] = Array.isArray(
          pastFromSummary
        )
          ? pastFromSummary
              .map((entry) => {
                if (!entry || typeof entry !== "object") {
                  return null;
                }
                const rec = entry as Record<string, unknown>;
                const phaseKey = typeof rec.phaseKey === "string" ? rec.phaseKey.trim() : "";
                const notes = Array.isArray(rec.notes) ? rec.notes : [];
                if (!phaseKey || notes.length === 0) {
                  return null;
                }
                return { phaseKey, notes };
              })
              .filter((e): e is { phaseKey: string; notes: unknown[] } => e !== null)
          : undefined;

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
          },
          pastPhaseNotes
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
    if (updateSequence !== this.dashboardUpdateSequence || this.view !== activeView) {
      logDashboard(`pushUpdate: stale phase context ignored page=${String(requestedWishlistPage)}`);
      return;
    }
    {
      let tabTitle = "Dashboard";
      if (raw.ok === true && raw.data && typeof raw.data === "object") {
        const d = raw.data as Record<string, unknown>;
        const snap = d.workspaceSnapshot;
        if (snap && typeof snap === "object") {
          const rec = snap as Record<string, unknown>;
          const ph =
            rec.currentKitPhase != null ? String(rec.currentKitPhase).trim() : "";
          if (ph.length > 0) {
            tabTitle = `Dashboard — ${ph}`;
          }
        }
      }
      activeView.title =
        tabTitle.length > 48 ? `${tabTitle.slice(0, 48)}\u2026` : tabTitle;
    }
    let rootInner: string;
    const wizardPanel: PlanningInterviewWizardPanel | null = raw.ok === true ? this.planningWizardPanel() : null;
    try {
      const editorIntegration = await resolveEditorIntegrationState();
      rootInner = renderDashboardRootInnerHtml(
        raw,
        wizardPanel,
        editorIntegration,
        phaseJournal,
        embeddedCaePanelHtml
      );
    } catch (e) {
      rootInner = '<pre class="bad">Host render error: ' + escapeHtml(String(e)) + "</pre>";
    }
    logDashboard(
      `pushUpdate: ok=${String(raw.ok)} code=${String(raw.code ?? "")} htmlBytes≈${rootInner.length} elapsedMs=${String(Date.now() - startedAt)}`
    );
    if (updateSequence !== this.dashboardUpdateSequence || this.view !== activeView) {
      logDashboard(`pushUpdate: stale render ignored page=${String(requestedWishlistPage)}`);
      return;
    }
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
  var vscode = window.__wfcVscode || (window.__wfcVscode = acquireVsCodeApi());
  var activeTab = 'overview';
  var activeFilter = 'all';
  var activePhaseFilter = 'all';
  var PHASE_READINESS_EXPAND_KEY = 'wc-phase-readiness-expanded';
  var PHASE_PROGRESS_EXPAND_KEY = 'wc-phase-progress-expanded';

  function persistPhaseCardExpanded(storageKey, expanded) {
    try {
      if (expanded) sessionStorage.setItem(storageKey, '1');
      else sessionStorage.removeItem(storageKey);
    } catch (e) {}
  }

  function capturePhaseCardCollapseState(root) {
    if (!root) return;
    var readiness = root.querySelector('.wc-cae-readiness');
    if (readiness) {
      persistPhaseCardExpanded(
        PHASE_READINESS_EXPAND_KEY,
        !readiness.classList.contains('wc-cae-readiness-collapsed')
      );
    }
    var progress = root.querySelector('.wc-phase-progress');
    if (progress) {
      persistPhaseCardExpanded(
        PHASE_PROGRESS_EXPAND_KEY,
        !progress.classList.contains('wc-phase-progress-collapsed')
      );
    }
  }

  function lazyTerminalBucketSelector(terminalStatus, phaseKey) {
    var pk = phaseKey != null ? String(phaseKey) : '';
    return 'details.wc-lazy-terminal-bucket[data-wc-lazy-terminal="' +
      String(terminalStatus).replace(/"/g, '\\\\"') +
      '"][data-wc-phase-key="' +
      pk.replace(/"/g, '\\\\"') +
      '"]';
  }

  function requestLazyTerminalBucketLoad(detailsEl) {
    if (!detailsEl || detailsEl.getAttribute('data-wc-lazy-loaded') === '1') return;
    if (detailsEl.getAttribute('data-wc-lazy-loading') === '1') return;
    var status = (detailsEl.getAttribute('data-wc-lazy-terminal') || '').trim();
    if (status !== 'completed' && status !== 'cancelled') return;
    detailsEl.setAttribute('data-wc-lazy-loading', '1');
    var body = detailsEl.querySelector('.wc-lazy-bucket-body');
    if (body) {
      var hint = body.querySelector('.wc-lazy-bucket-hint');
      if (hint) hint.textContent = 'Loading…';
    }
    vscode.postMessage({
      type: 'loadLazyTerminalBucket',
      terminalStatus: status,
      phaseKey: detailsEl.getAttribute('data-wc-phase-key') || ''
    });
  }

  function applyLazyTerminalBucketHtml(terminalStatus, phaseKey, html) {
    var root = document.getElementById('root');
    if (!root) return;
    var bucket = root.querySelector(lazyTerminalBucketSelector(terminalStatus, phaseKey));
    if (!bucket) return;
    bucket.removeAttribute('data-wc-lazy-loading');
    bucket.setAttribute('data-wc-lazy-loaded', '1');
    var body = bucket.querySelector('.wc-lazy-bucket-body');
    if (body) {
      body.innerHTML = typeof html === 'string' ? html : '';
      body.setAttribute('data-wc-lazy-loaded', '1');
    }
  }

  function reloadOpenLazyTerminalBuckets(root) {
    if (!root) return;
    root.querySelectorAll('details.wc-lazy-terminal-bucket[open]').forEach(function(d) {
      if (d.getAttribute('data-wc-lazy-loaded') !== '1') requestLazyTerminalBucketLoad(d);
    });
  }

  function restorePhaseCardCollapseState(root) {
    if (!root) return;
    var readiness = root.querySelector('.wc-cae-readiness');
    if (readiness) {
      var readinessExpanded = false;
      try { readinessExpanded = sessionStorage.getItem(PHASE_READINESS_EXPAND_KEY) === '1'; } catch (e) {}
      readiness.classList.toggle('wc-cae-readiness-collapsed', !readinessExpanded);
      var readinessToggle = readiness.querySelector('[data-wc-action="phase-readiness-toggle"]');
      if (readinessToggle) {
        readinessToggle.setAttribute('aria-expanded', readinessExpanded ? 'true' : 'false');
      }
    }
    var progress = root.querySelector('.wc-phase-progress');
    if (progress) {
      var progressExpanded = false;
      try { progressExpanded = sessionStorage.getItem(PHASE_PROGRESS_EXPAND_KEY) === '1'; } catch (e) {}
      progress.classList.toggle('wc-phase-progress-collapsed', !progressExpanded);
      var progressToggle = progress.querySelector('[data-wc-action="phase-progress-toggle"]');
      if (progressToggle) {
        progressToggle.setAttribute('aria-expanded', progressExpanded ? 'true' : 'false');
      }
    }
  }

  function togglePhaseDeliverablesEdit(row, editing) {
    if (!row) return;
    var text = row.querySelector('.dash-phase-deliverables-text');
    var editBtn = row.querySelector('.dash-phase-edit-anchor');
    var editor = row.querySelector('.dash-phase-deliverables-editor');
    var saving = row.querySelector('.dash-phase-saving');
    var error = row.querySelector('.dash-phase-deliverables-error');
    if (text) text.hidden = !!editing;
    if (editBtn) editBtn.hidden = !!editing;
    if (editor) editor.hidden = !editing;
    if (saving) saving.hidden = true;
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    if (editing && editor) {
      var input = editor.querySelector('input');
      if (input && input.focus) {
        input.focus();
        if (input.select) input.select();
      }
    }
  }

  function phaseDeliverablesInputFromPhase(phaseKey) {
    if (!phaseKey) return null;
    return document.querySelector('[data-wc-phase-input="' + phaseKey.replace(/"/g, '\\"') + '"]');
  }

  function submitPhaseDeliverablesInput(input) {
    if (!input) return;
    var phaseKey = (input.getAttribute('data-wc-phase-input') || '').trim();
    if (!phaseKey) return;
    var row = input.closest('[data-wc-phase-row]');
    if (!row) return;
    var saving = row.querySelector('.dash-phase-saving');
    var error = row.querySelector('.dash-phase-deliverables-error');
    var original = input.getAttribute('data-wc-original') || '';
    var current = input.value != null ? String(input.value).trim() : '';
    if (current === original) {
      togglePhaseDeliverablesEdit(row, false);
      return;
    }
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    var mutationId = 'dashboard-phase-deliverables-' + phaseKey + '-' + Date.now().toString(36);
    input.setAttribute('data-wc-pending', '1');
    input.setAttribute('data-wc-mutation-id', mutationId);
    if (saving) saving.hidden = false;
    input.disabled = true;
    var rowEdit = row.querySelector('.dash-phase-deliverables-editor');
    if (rowEdit) rowEdit.hidden = true;
    vscode.postMessage({
      type: 'updatePhaseDeliverables',
      phaseKey: phaseKey,
      deliverables: current.length > 0 ? current : null,
      clientMutationId: mutationId
    });
  }

  function restorePhaseDeliverablesFromError(phaseKey, message) {
    var input = phaseDeliverablesInputFromPhase(phaseKey);
    if (!input) return;
    var row = input.closest('[data-wc-phase-row]');
    if (!row) return;
    var original = input.getAttribute('data-wc-original') || '';
    input.value = original;
    input.disabled = false;
    input.removeAttribute('data-wc-pending');
    input.removeAttribute('data-wc-mutation-id');
    togglePhaseDeliverablesEdit(row, false);
    var err = row.querySelector('.dash-phase-deliverables-error');
    if (err) {
      err.textContent = message || 'Unable to save deliverables.';
      err.hidden = false;
    }
  }

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

  function syncQueueFiltersUi(root) {
    if (!root) return;
    root.querySelectorAll('.wc-filter-chip').forEach(function(c) {
      c.classList.toggle('wc-filter-active', c.getAttribute('data-wc-filter-btn') === activeFilter);
    });
    var phaseSelect = root.querySelector('[data-wc-phase-filter]');
    if (!phaseSelect) return;
    var hasOption = false;
    phaseSelect.querySelectorAll('option').forEach(function(opt) {
      if (opt.value === activePhaseFilter) hasOption = true;
    });
    if (!hasOption) activePhaseFilter = 'all';
    phaseSelect.value = activePhaseFilter;
  }

  function applyQueueFilters(root) {
    if (!root) return;
    root.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) {
      var sf = s.getAttribute('data-wc-filter');
      s.style.display = (activeFilter === 'all' || sf === activeFilter) ? '' : 'none';
    });
    var termHost = root.querySelector('.dashboard-terminal-tasks');
    if (termHost) termHost.style.display = (activeFilter === 'all') ? '' : 'none';

    root.querySelectorAll('details.phase-bucket[data-wc-phase-bucket]').forEach(function(b) {
      var pk = b.getAttribute('data-wc-phase-bucket') || '__no_phase__';
      b.style.display = (activePhaseFilter === 'all' || pk === activePhaseFilter) ? '' : 'none';
    });

    root.querySelectorAll('details.status-section[data-wc-filter]').forEach(function(s) {
      if (s.style.display === 'none') return;
      var buckets = s.querySelectorAll('details.phase-bucket[data-wc-phase-bucket]');
      if (!buckets.length) return;
      var visible = false;
      buckets.forEach(function(b) { if (b.style.display !== 'none') visible = true; });
      s.style.display = visible ? '' : 'none';
    });

    syncQueueFiltersUi(root);
  }

  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (m && m.type === 'wcDrawerOpen' && typeof m.html === 'string') {
      var dh = document.getElementById('wc-drawer-host');
      if (!dh) return;
      if (!String(m.html).trim()) return;
      dh.innerHTML = m.html;
      dh.classList.remove('wc-drawer-host--hidden');
      dh.setAttribute('aria-hidden','false');
      var ve = document.getElementById('wc-drawer-validation');
      if (ve) { ve.textContent=''; ve.hidden=true; }
      var prim = dh.querySelector('[data-wc-drawer-action="submit"]');
      if (prim && prim.focus) prim.focus();
      return;
    }
    if (m && m.type === 'wcDrawerClose') {
      var dh2 = document.getElementById('wc-drawer-host');
      if (dh2) { dh2.innerHTML=''; dh2.classList.add('wc-drawer-host--hidden'); dh2.setAttribute('aria-hidden','true'); }
      return;
    }
    if (m && m.type === 'wcDrawerValidation' && typeof m.message === 'string') {
      var v = document.getElementById('wc-drawer-validation');
      if (v) { v.textContent = m.message; v.hidden = false; }
      return;
    }
    if (m && m.type === 'wcPhaseDeliverablesError') {
      var pk = typeof m.phaseKey === 'string' ? m.phaseKey.trim() : '';
      var msg = typeof m.message === 'string' ? m.message : 'Unable to save deliverables.';
      if (pk) restorePhaseDeliverablesFromError(pk, msg);
      return;
    }
    if (m && m.type === 'wcLazyTerminalBucketHtml') {
      var lazyStatus = typeof m.terminalStatus === 'string' ? m.terminalStatus : '';
      var lazyPk = typeof m.phaseKey === 'string' ? m.phaseKey : '';
      applyLazyTerminalBucketHtml(lazyStatus, lazyPk, m.html);
      return;
    }
    if (!m || m.type !== 'wcReplaceRoot' || typeof m.html !== 'string') return;
    var root = document.getElementById('root');
    if (!root) return;
    var open = {};
    root.querySelectorAll('details[data-wc-track]').forEach(function(d) {
      var k = d.getAttribute('data-wc-track');
      if (k && d.open) open[k] = true;
    });
    capturePhaseCardCollapseState(root);
    root.innerHTML = m.html;
    Object.keys(open).forEach(function(k) {
      var el = root.querySelector('details[data-wc-track="' + k + '"]');
      if (el) el.open = true;
    });
    restorePhaseCardCollapseState(root);
    applyTab(activeTab);
    applyQueueFilters(root);
    reloadOpenLazyTerminalBuckets(root);
  });

  applyTab(activeTab);
  restorePhaseCardCollapseState(document.getElementById('root'));

  document.addEventListener('click', function(ev) {
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-wc-drawer-action]') : null;
    if (!t || !dh.contains(t)) return;
    var act = t.getAttribute('data-wc-drawer-action');
    if (act === 'backdrop' || act === 'cancel') { vscode.postMessage({type:'drawerCancel'}); return; }
    if (act === 'submit') {
      var vals = {};
      dh.querySelectorAll('[data-wc-drawer-field]').forEach(function(el) {
        var id = el.getAttribute('data-wc-drawer-field');
        if (!id) return;
        vals[id] = ('value' in el && el.value != null) ? String(el.value) : '';
      });
      vscode.postMessage({type:'drawerSubmit', values: vals});
    }
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    var dh = document.getElementById('wc-drawer-host');
    if (!dh || dh.classList.contains('wc-drawer-host--hidden')) return;
    ev.preventDefault();
    vscode.postMessage({type:'drawerCancel'});
  });

  var btn = document.getElementById('btn');
  var rootEl = document.getElementById('root');
  if (btn) btn.addEventListener('click', function() { vscode.postMessage({type:'refresh'}); });
  if (rootEl) rootEl.addEventListener('click', function(ev) {
    var rawTarget = ev.target;
    var el = rawTarget;
    while (el && el.nodeType !== 1) el = el.parentElement;
    var tabBtn = el && el.closest ? el.closest('.wc-tab-btn') : null;
    if (tabBtn && rootEl.contains(tabBtn) && !tabBtn.disabled) {
      applyTab(tabBtn.getAttribute('data-wc-tab'));
      return;
    }
    var t = el && typeof el.closest === 'function' ? el.closest('button') : null;
    if (!t || t.tagName !== 'BUTTON' || !rootEl.contains(t) || t.disabled) return;
    if (t.closest && t.closest('.wc-dash-cae-host')) return;
    if (t.classList.contains('wc-filter-chip')) {
      var f = t.getAttribute('data-wc-filter-btn') || 'all';
      activeFilter = f;
      if (f === 'all') activePhaseFilter = 'all';
      applyQueueFilters(rootEl);
      return;
    }
    if (t.classList.contains('wc-stat-pill')) {
      var navTab = t.getAttribute('data-wc-pill-nav');
      var navFilter = t.getAttribute('data-wc-pill-filter') || 'all';
      if (navTab) applyTab(navTab);
      activeFilter = navFilter;
      applyQueueFilters(rootEl);
      return;
    }
    var gpTab = t.getAttribute('data-gp-tab');
    if (gpTab) {
      var gpRoot = t.closest('.gp-root') || rootEl;
      gpRoot.querySelectorAll('[data-gp-tab]').forEach(function(btn) {
        if (btn === t) btn.classList.add('is-active');
        else btn.classList.remove('is-active');
      });
      gpRoot.querySelectorAll('.gp-tab-panel').forEach(function(panel) {
        var ok = panel.getAttribute('data-gp-panel') === gpTab;
        if (ok) panel.classList.add('is-active');
        else panel.classList.remove('is-active');
      });
      return;
    }
    var gpAction = t.getAttribute('data-gp-action');
    if (gpAction) {
      var gpTabTarget = t.getAttribute('data-gp-tab-target');
      if (gpTabTarget) {
        var gpScope = t.closest('.gp-root') || rootEl;
        var gpBtn = gpScope.querySelector('[data-gp-tab="' + gpTabTarget + '"]');
        if (gpBtn && gpBtn.click) gpBtn.click();
      }
      var gpPayload = {
        activationId: t.getAttribute('data-gp-activation-id') || '',
        artifactId: t.getAttribute('data-gp-artifact-id') || '',
        versionId: t.getAttribute('data-version-id') || '',
        commandName: t.getAttribute('data-gp-command-name') || ''
      };
      vscode.postMessage({ type: 'embeddedCaeAction', action: gpAction, payload: gpPayload });
      return;
    }
    var act = t.getAttribute('data-wc-action');
    if (!act) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (act === 'phase-readiness-toggle') {
      var readinessCard = t.closest('.wc-cae-readiness');
      if (!readinessCard) return;
      readinessCard.classList.toggle('wc-cae-readiness-collapsed');
      var readinessExpanded = !readinessCard.classList.contains('wc-cae-readiness-collapsed');
      persistPhaseCardExpanded(PHASE_READINESS_EXPAND_KEY, readinessExpanded);
      var readinessToggle = readinessCard.querySelector('[data-wc-action="phase-readiness-toggle"]');
      if (readinessToggle) {
        readinessToggle.setAttribute('aria-expanded', readinessExpanded ? 'true' : 'false');
      }
      return;
    }
    if (act === 'phase-progress-toggle') {
      var progressCard = t.closest('.wc-phase-progress');
      if (!progressCard) return;
      progressCard.classList.toggle('wc-phase-progress-collapsed');
      var progressExpanded = !progressCard.classList.contains('wc-phase-progress-collapsed');
      persistPhaseCardExpanded(PHASE_PROGRESS_EXPAND_KEY, progressExpanded);
      var progressToggle = progressCard.querySelector('[data-wc-action="phase-progress-toggle"]');
      if (progressToggle) {
        progressToggle.setAttribute('aria-expanded', progressExpanded ? 'true' : 'false');
      }
      return;
    }
    if (act === 'phase-deliverables-edit') {
      var row = t.closest('[data-wc-phase-row]');
      if (!row) return;
      var input = row.querySelector('.dash-phase-deliverables-input');
      if (input) {
        input.disabled = false;
        input.removeAttribute('data-wc-pending');
        input.removeAttribute('data-wc-mutation-id');
        input.setAttribute('data-wc-original', input.value != null ? String(input.value).trim() : '');
      }
      togglePhaseDeliverablesEdit(row, true);
      return;
    }
    if (act === 'phase-note-view') {
      var viewId = (t.getAttribute('data-note-id') || '').trim();
      if (!viewId) return;
      vscode.postMessage({
        type: 'viewPhaseNote',
        noteId: viewId,
        noteType: t.getAttribute('data-note-type') || '',
        priority: t.getAttribute('data-note-priority') || '',
        summary: t.getAttribute('data-note-summary') || '',
        details: t.getAttribute('data-note-details') || ''
      });
      return;
    }
    if (act === 'phase-note-edit') {
      var editId = (t.getAttribute('data-note-id') || '').trim();
      if (!editId) return;
      vscode.postMessage({
        type: 'editPhaseNote',
        noteId: editId,
        summary: t.getAttribute('data-note-summary') || '',
        details: t.getAttribute('data-note-details') || ''
      });
      return;
    }
    if (act === 'phase-note-delete') {
      var delId = (t.getAttribute('data-note-id') || '').trim();
      if (!delId) return;
      vscode.postMessage({
        type: 'deletePhaseNote',
        noteId: delId,
        priority: t.getAttribute('data-note-priority') || ''
      });
      return;
    }
    if (act === 'wishlist-view') { var wv = (t.getAttribute('data-wishlist-id') || '').trim(); if (wv) vscode.postMessage({type:'openWishlistDetail',wishlistId:wv}); return; }
    if (act === 'planning-new-plan') { vscode.postMessage({type:'prefillPlanningInterviewChat'}); return; }
    if (act === 'planning-resume-chat') { var rc = (t.getAttribute('data-resume-cli') || '').trim(); vscode.postMessage({type:'prefillPlanningResumeChat',resumeCli:rc}); return; }
    if (act === 'planning-discard') { vscode.postMessage({type:'planningDiscard'}); return; }
    if (act === 'planning-wizard-start') { var sel = document.getElementById('wc-planning-type'); var pt = sel && sel.value ? String(sel.value).trim() : ''; if (pt) vscode.postMessage({type:'planningWizardStart',planningType:pt}); return; }
    if (act === 'planning-wizard-submit') { var ta = document.getElementById('wc-planning-answer'); var txt = ta && typeof ta.value === 'string' ? ta.value.trim() : ''; vscode.postMessage({type:'planningWizardSubmit',answer:txt}); return; }
    if (act === 'planning-wizard-cancel') { vscode.postMessage({type:'planningWizardCancel'}); return; }
    if (act === 'planning-wizard-dismiss') { vscode.postMessage({type:'planningWizardDismiss'});return;}if(act==="collaboration-hub"){vscode.postMessage({type:"prefillCollaborationHubChat"});return;}if(act==="deliver-phase-prompt"){var kp=(t.getAttribute("data-wc-kit-phase")||"").trim();vscode.postMessage({type:"prefillDeliverPhaseChat",kitPhase:kp});return;}if(act==="add-wishlist-item"){vscode.postMessage({type:"addWishlistItem"});return;}if(act==="generate-features-chat"){vscode.postMessage({type:"prefillGenerateFeaturesChat"});return;}if(act==="transcript-churn-research-chat"){var tcTid=(t.getAttribute("data-task-id")||"").trim();vscode.postMessage({type:"prefillTranscriptChurnResearchChat",taskId:tcTid});return;}if(act==="wishlist-chat"){var wid=t.getAttribute("data-wishlist-id")||"";vscode.postMessage({type:"prefillWishlistChat",wishlistId:wid});return;}if(act==="wishlist-page"){var wpp=parseInt(String(t.getAttribute("data-wishlist-page")||"0"),10);if(!Number.isNaN(wpp)&&wpp>=0)vscode.postMessage({type:"wishlistPage",page:wpp});return;}if(act==="wishlist-decline"){var wlTid=(t.getAttribute("data-task-id")||"").trim();if(wlTid)vscode.postMessage({type:"dashboardTransition",taskId:wlTid,action:"reject",transitionKind:"wishlist"});return;}if(act==="phase-complete-release"){var ph=(t.getAttribute("data-wc-phase-phrase")||"").trim();var pk=(t.getAttribute("data-wc-phase-key")||"").trim();var ids=(t.getAttribute("data-wc-phase-task-ids")||"").trim();var wcur=(t.getAttribute("data-wc-workspace-current-phase")||"").trim();var wnxt=(t.getAttribute("data-wc-workspace-next-phase")||"").trim();var rscope=(t.getAttribute("data-wc-release-scope")||"").trim();vscode.postMessage({type:"prefillPhaseCompleteReleaseChat",phasePhrase:ph,phaseKey:pk,seededTaskIdsCsv:ids,workspaceCurrentPhase:wcur,workspaceNextPhase:wnxt,scope:rscope==="current"?"current":rscope==="bucket"?"bucket":undefined});return;}if(act==="proposed-imp-accept-phase"||act==="proposed-exe-accept-phase"){var batch=(t.getAttribute("data-proposed-task-ids")||"").trim();var cat=act==="proposed-exe-accept-phase"?"execution":"improvement";vscode.postMessage({type:"dashboardAcceptProposedPhase",category:cat,taskIds:batch});return;}if(act==="phase-notes-chat"){vscode.postMessage({type:"prefillPhaseNotesDiscoveryChat"});return;}if(act==="phase-note-add"){vscode.postMessage({type:"addPhaseNote"});return;}if(act==="phase-note-dismiss"){var dpn=(t.getAttribute("data-note-id")||"").trim();var dpp=(t.getAttribute("data-note-priority")||"").trim();if(dpn)vscode.postMessage({type:"dismissPhaseNote",noteId:dpn,priority:dpp});return;}if(act==="phase-note-convert"){var cpn=(t.getAttribute("data-note-id")||"").trim();if(cpn)vscode.postMessage({type:"convertPhaseNote",noteId:cpn});return;}if(act==="phase-notes-propose-persist"){vscode.postMessage({type:"persistPhaseNoteProposals"});return;}if(act==="register-phase-catalog"){vscode.postMessage({type:"registerPhaseCatalogEntry"});return;}if(act==="assign-phase"){var apTid=(t.getAttribute("data-task-id")||"").trim();if(apTid)vscode.postMessage({type:"assignTaskPhase",taskId:apTid});return;}var tid=(t.getAttribute("data-task-id")||"").trim();if(act==="task-detail"){if(tid)vscode.postMessage({type:"openTaskDetail",taskId:tid});return;}if(act==="task-comments-view"){if(tid)vscode.postMessage({type:"viewTaskComments",taskId:tid});return;}if(act==="task-comment-add"){if(tid)vscode.postMessage({type:"addTaskComment",taskId:tid});return;}if(act==="proposed-imp-accept"||act==="proposed-exe-accept"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"accept"});return;}if(act==="proposed-imp-decline"||act==="proposed-exe-decline"){vscode.postMessage({type:"dashboardTransition",taskId:tid,action:"reject"});return;}});

  if (rootEl) rootEl.addEventListener('keydown', function(ev) {
    var target = ev.target;
    if (!target || !target.classList || !target.classList.contains('dash-phase-deliverables-input')) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      submitPhaseDeliverablesInput(target);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      var row = target.closest('[data-wc-phase-row]');
      if (!row) return;
      var original = target.getAttribute('data-wc-original') || '';
      target.value = original;
      target.disabled = false;
      target.removeAttribute('data-wc-pending');
      target.removeAttribute('data-wc-mutation-id');
      togglePhaseDeliverablesEdit(row, false);
    }
  });
  if (rootEl) rootEl.addEventListener('change', function(ev) {
    var target = ev.target;
    if (!target || !target.matches || !target.matches('[data-wc-phase-filter]')) return;
    activePhaseFilter = target.value || 'all';
    applyQueueFilters(rootEl);
  });

  if (rootEl) rootEl.addEventListener('focusout', function(ev) {
    var target = ev.target;
    if (!target || !target.classList || !target.classList.contains('dash-phase-deliverables-input')) return;
    if (target.getAttribute('data-wc-pending') === '1') return;
    var next = ev.relatedTarget;
    var row = target.closest('[data-wc-phase-row]');
    if (!row) return;
    if (next && row.contains(next)) return;
    submitPhaseDeliverablesInput(target);
  });

  if (rootEl) rootEl.addEventListener('toggle', function(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'DETAILS' || !rootEl.contains(el)) return;
    if (!el.classList.contains('wc-lazy-terminal-bucket') || !el.open) return;
    requestLazyTerminalBucketLoad(el);
  }, true);
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Workflow Cannon</title>
  <style>
    ${WC_BASE_CSS}
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
    .dash-row-actions.wc-task-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 4px;
      align-content: flex-start;
      width: 160px;
      max-width: 100%;
    }
    .dash-row-actions.wc-task-actions > .wc-btn {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      text-align: center;
      justify-content: center;
    }
    .dash-task-row-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      white-space: normal;
    }
    .dash-task-row-line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .dash-task-row-id {
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .dash-task-row-chips {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      min-width: 0;
    }
    .dash-task-chip {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 9.5px;
      font-weight: 600;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
      line-height: 1.35;
    }
    .dash-task-chip-priority {
      color: var(--vscode-testing-iconPassed, #4ec9b0);
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, #4ec9b0) 55%, transparent);
    }
    .dash-task-chip-severity {
      color: var(--vscode-editorWarning-foreground, #cca700);
      border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 55%, transparent);
    }
    .dash-task-chip-component {
      color: var(--vscode-textLink-foreground, #4fc1ff);
      border-color: color-mix(in srgb, var(--vscode-textLink-foreground, #4fc1ff) 45%, transparent);
    }
    .dash-task-chip-feature {
      color: var(--vscode-foreground);
      opacity: 0.88;
    }
    .dash-task-row-summary {
      display: block;
      font-size: 11px;
      line-height: 1.3;
      opacity: 0.82;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dash-phase-notes-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .dash-phase-notes-head p {
      margin: 0;
    }
    .dash-phase-notes-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .dash-phase-catalog-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      margin-top: 6px;
    }
    .dash-phase-catalog-table th,
    .dash-phase-catalog-table td {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    .dash-phase-catalog-table th {
      font-weight: 600;
      font-size: 11px;
      background: var(--vscode-textCodeBlock-background);
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-phase,
    .dash-phase-catalog-table td.dash-phase-roster-col-phase,
    .dash-phase-catalog-table th.dash-phase-roster-col-status,
    .dash-phase-catalog-table td.dash-phase-roster-col-status {
      width: 1%;
      white-space: nowrap;
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-deliverables,
    .dash-phase-catalog-table td.dash-phase-roster-col-deliverables {
      width: 100%;
    }
    .dash-phase-no-catalog {
      cursor: help;
      text-decoration: none;
      font-weight: 600;
    }
    .dash-phase-deliverables-cell {
      min-width: 0;
    }
    .dash-phase-deliverables {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 8px;
      row-gap: 4px;
      align-items: start;
      width: 100%;
      min-width: 0;
    }
    .dash-phase-deliverables-body {
      grid-column: 1;
      grid-row: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dash-phase-deliverables-text {
      min-width: 0;
      word-break: break-word;
      line-height: 1.35;
    }
    .dash-phase-edit-anchor {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
      align-self: start;
      margin: 0;
    }
    .dash-phase-deliverables-editor {
      width: 100%;
      min-width: 0;
    }
    .dash-phase-deliverables-editor[hidden] {
      display: none !important;
    }
    .dash-phase-deliverables-input {
      min-width: 0;
    }
    .dash-phase-saving {
      font-size: 11px;
      opacity: 0.8;
    }
    .dash-phase-deliverables-error {
      grid-column: 1 / -1;
      grid-row: 2;
      margin: 0;
      width: 100%;
      font-size: 11px;
    }
    .dash-editor-integration--embedded {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
    }
    .dash-status-editor-integration .dash-editor-integration--embedded {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
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
    .dash-agent-row-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .dash-agent-row { display: grid; grid-template-columns: auto minmax(92px, 1.2fr) minmax(92px, 1fr) minmax(70px, auto); gap: 6px; align-items: center; padding: 4px 5px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .dash-agent-row--subagent { margin-left: 14px; border-left: 2px solid var(--vscode-textLink-foreground); }
    .dash-agent-row-icon { font-size: 10px; opacity: 0.75; }
    .dash-agent-row-main { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
    .dash-agent-row-main b, .dash-agent-row-detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dash-agent-row-detail { min-width: 0; font-size: 11px; }
    .dash-agent-row-meta { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; min-width: 0; font-size: 10px; }
    .dash-agent-row-chip { display: inline-flex; align-items: center; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); background: var(--vscode-sideBar-background); font-size: 9.5px; line-height: 1.3; }
    .dash-agent-row-chip-sub { color: var(--vscode-textLink-foreground); }
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
    button.dash-planning-discard-btn {
      margin: 0;
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
    .phase-bucket-summary-deliverables {
      display: inline;
      font-weight: normal;
    }
    button.dash-phase-release-btn {
      flex-shrink: 0;
      margin: 0;
    }
    .dash-phase-release-overview-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 12px;
    }
    .dash-phase-release-overview-row p { margin: 0; }
    details.phase-bucket pre { margin-top: 4px; }
    .wc-lazy-bucket-hint { margin: 6px 0 4px 0; font-style: italic; }
    details.wc-lazy-terminal-bucket[open] .wc-lazy-bucket-hint { margin-bottom: 2px; }
    .dashboard-tasks-block { margin-top: 0; }
    .dash-quick-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 10px 0; }
    .dash-card { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; padding: 8px; margin: 10px 0; }
    .wc-dash-cae-host.dash-cae-embedded {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 8px;
      padding: 10px 12px 12px;
      margin: 0;
      max-height: min(78vh, 920px);
      overflow: auto;
      background: var(--vscode-editor-background);
    }
    .wc-dash-cae-host .gp-shell { max-width: none; margin: 0; padding: 8px 0 12px 0; }
    details.status-section { margin-bottom: 8px; }
    details.status-section > summary { cursor: pointer; user-select: none; font-weight: 600; }
    details.status-section > .status-section-body { padding-left: 2px; }
    .dash-card > details.status-section:last-child { margin-bottom: 0; }
    .dash-count-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin: 4px 0 10px 0; }
    .dash-count-cell { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
    .dash-count-label { font-size: 11px; opacity: 0.85; line-height: 1.25; flex: 1; min-width: 0; }
    .dash-count-num { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; line-height: 1.25; }
    pre.resume-cli { font-size: 11px; }
    /* ── Tab system (agent status banner lives in .wc-dashboard-tab-shell above this bar) ── */
    .wc-dashboard-tab-shell { display: flex; flex-direction: column; min-height: 0; }
    .wc-dashboard-tab-shell > .dash-agent-status-banner {
      margin: 0 0 6px 0;
      padding: 4px 6px;
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      background: var(--vscode-sideBarSectionHeader-background, rgba(127,127,127,.12));
    }
    .wc-dashboard-tab-shell > .dash-agent-status-banner p { margin: 0; }
    .wc-dashboard-tab-shell > .dash-agent-status-banner .dash-agent-row-list { margin-top: 5px; }
    @media (max-width: 520px) {
      .dash-agent-row { grid-template-columns: auto minmax(0, 1fr); }
      .dash-agent-row-detail, .dash-agent-row-meta { grid-column: 2; justify-content: flex-start; }
    }
    .wc-tab-bar {
      display: flex;
      gap: 0;
      margin: -2px -8px 10px -8px;
      padding: 0 4px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      overflow-x: auto;
      scrollbar-width: none;
      position: sticky;
      top: 0;
      z-index: 30;
      background: var(--vscode-sideBar-background);
      box-shadow: 0 1px 0 var(--vscode-widget-border, rgba(127,127,127,.25));
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
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
      line-height: 1.25;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, transparent));
    }
    .wc-rec-tag-ready {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-color: var(--vscode-contrastBorder, var(--vscode-badge-background));
    }
    .wc-rec-tag-cat {
      background: var(--vscode-editorWidget-background, var(--vscode-input-background));
      color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
      border-color: var(--vscode-widget-border, var(--vscode-panel-border));
    }
    .wc-rec-tag-phase {
      background: var(--vscode-button-secondaryBackground, var(--vscode-badge-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-badge-foreground));
      border-color: var(--vscode-button-border, var(--vscode-contrastBorder));
    }
    .wc-rec-next-wishlist {
      border-color: var(--vscode-textLink-foreground);
    }
    .wc-rec-tag-wishlist {
      background: var(--vscode-inputValidation-infoBackground, var(--vscode-badge-background));
      color: var(--vscode-inputValidation-infoForeground, var(--vscode-badge-foreground));
      border-color: var(--vscode-inputValidation-infoBorder, var(--vscode-textLink-foreground));
    }
    .wc-rec-tag-open {
      background: var(--vscode-editorWidget-background, var(--vscode-input-background));
      color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
      border-color: var(--vscode-widget-border, var(--vscode-panel-border));
    }
    /* Phase schedule tags (roster, queue buckets, status tab) */
    .wc-phase-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .wc-phase-tag-delivered {
      background: #1b4d1f;
      color: #c8f5c8;
      border-color: #2e7d32;
    }
    .wc-phase-tag-current {
      background: #1b4d1f;
      color: #c8f5c8;
      border-color: #2e7d32;
    }
    .wc-phase-tag-next {
      background: #5c4a12;
      color: #fff3b0;
      border-color: #9a7b1a;
    }
    .wc-phase-tag-future {
      background: #1a3358;
      color: #b8d4ff;
      border-color: #2a5490;
    }
    .phase-bucket-summary {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .phase-bucket-summary-label {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }
    .phase-bucket-summary-phase code {
      font-size: 11px;
    }
    .phase-bucket-summary-count {
      font-size: 10px;
    }
    .dash-phase-roster-col-status .wc-phase-tag {
      vertical-align: middle;
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
    .wc-rec-footer .wc-btn:first-of-type {
      margin-left: auto;
    }
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
      color: var(--vscode-foreground);
    }
    .wc-stat-num {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .wc-stat-lbl {
      font-size: 10px;
      font-weight: 600;
      opacity: 0.9;
      line-height: 1;
      text-align: center;
      color: var(--vscode-foreground);
    }
    .wc-pill-ready {
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, #4ec9b0) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-testing-iconPassed, #4ec9b0) 14%, var(--vscode-textCodeBlock-background));
    }
    .wc-pill-ready .wc-stat-num { color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-pill-proposed {
      border-color: color-mix(in srgb, var(--vscode-textLink-foreground, #4fc1ff) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-textLink-foreground, #4fc1ff) 14%, var(--vscode-textCodeBlock-background));
    }
    .wc-pill-proposed .wc-stat-num { color: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-pill-blocked {
      border-color: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 14%, var(--vscode-textCodeBlock-background));
    }
    .wc-pill-blocked .wc-stat-num { color: var(--vscode-errorForeground, #f44747); }
    .wc-pill-done {
      border-color: var(--vscode-widget-border, rgba(127,127,127,.45));
    }
    .wc-pill-done .wc-stat-num { color: var(--vscode-foreground); opacity: 0.7; }
    /* ── Filter chips ── */
    .wc-filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0 0 8px 0;
      align-items: center;
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
    .wc-phase-filter-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      font-size: 10.5px;
      opacity: 0.85;
    }
    .wc-phase-filter-select {
      font-size: 11px;
      border-radius: 6px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 2px 6px;
      min-width: 124px;
    }
    /* ── CAE readiness ── */
    .wc-cae-readiness { }
    .wc-cae-readiness-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .wc-cae-readiness-collapsed .wc-cae-readiness-head {
      margin-bottom: 0;
    }
    .wc-cae-readiness-head .dash-phase-release-btn {
      flex-shrink: 0;
      margin: 0;
    }
    .wc-cae-readiness-head .wc-phase-readiness-delivered {
      flex-shrink: 0;
    }
    button.dash-phase-release-btn.dash-phase-release-btn--preflight {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border, transparent);
    }
    button.dash-phase-release-btn.wc-btn-disabled,
    button.dash-phase-release-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: none;
    }
    button.wc-cae-readiness-toggle {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex: 1;
      min-width: 0;
      cursor: pointer;
      border-radius: 4px;
      padding: 2px 0;
    }
    .wc-cae-readiness-title {
      min-width: 0;
      flex: 1;
    }
    .wc-cae-readiness-title b {
      font-weight: 600;
    }
    button.wc-cae-readiness-toggle:hover {
      background: var(--vscode-list-hoverBackground, rgba(127,127,127,.12));
    }
    button.wc-cae-readiness-toggle:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: 2px;
    }
    .wc-cae-readiness-collapsed .wc-cae-readiness-body,
    .wc-phase-progress-collapsed .wc-phase-progress-body {
      display: none;
    }
    .wc-cae-readiness:not(.wc-cae-readiness-collapsed) .wc-cae-readiness-body,
    .wc-phase-progress:not(.wc-phase-progress-collapsed) .wc-phase-progress-body {
      margin-top: 6px;
    }
    .wc-phase-progress-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .wc-phase-progress-collapsed .wc-phase-progress-head {
      margin-bottom: 0;
    }
    .wc-phase-progress-head .dash-phase-release-btn,
    .wc-phase-progress-head .wc-phase-readiness-delivered {
      flex-shrink: 0;
      margin: 0;
    }
    .wc-phase-card-hint {
      margin: 0 0 8px 0;
      font-size: 11px;
      line-height: 1.35;
    }
    .wc-phase-progress-summary {
      margin: 0 0 8px 0;
      font-size: 12px;
    }
    .wc-phase-progress-track {
      display: flex;
      width: 100%;
      height: 12px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,.2));
      margin-bottom: 8px;
    }
    .wc-phase-progress-track-empty {
      align-items: center;
      justify-content: center;
      height: auto;
      min-height: 28px;
      padding: 6px 8px;
    }
    .wc-phase-progress-seg {
      display: block;
      height: 100%;
      min-width: 2px;
    }
    .wc-phase-seg-completed { background: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-phase-seg-cancelled { background: var(--vscode-descriptionForeground, #888); }
    .wc-phase-seg-in-progress { background: var(--vscode-progressBar-background, #0e639c); }
    .wc-phase-seg-ready { background: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-phase-seg-proposed { background: var(--vscode-badge-background, #4d4d4d); }
    .wc-phase-seg-blocked { background: var(--vscode-errorForeground, #f44747); }
    .wc-phase-seg-research { background: var(--vscode-charts-purple, #8b5cf6); }
    .wc-phase-progress-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-bottom: 8px;
      font-size: 10.5px;
    }
    .wc-phase-progress-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .wc-phase-progress-legend-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .wc-phase-closeout-ok {
      margin: 0;
      font-size: 11px;
      color: var(--vscode-testing-iconPassed, #4ec9b0);
    }
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
    .wc-drawer-host { position: fixed; inset: 0; z-index: 20000; pointer-events: none; }
    .wc-drawer-host--hidden { display: none !important; }
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-scrim,
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-panel {
      pointer-events: auto;
    }
    .wc-drawer-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
    .wc-drawer-panel {
      position: absolute; left: 8px; right: 8px; bottom: 8px; max-height: 78vh; overflow: auto;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      border-radius: 8px; padding: 10px 12px 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    .wc-drawer-title { margin: 0 0 6px 0; font-size: 14px; font-weight: 600; }
    .wc-drawer-desc { margin: 0 0 10px 0; opacity: 0.9; line-height: 1.35; }
    .wc-drawer-validation { margin: 0 0 8px 0; padding: 6px 8px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .wc-drawer-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    .wc-drawer-field-label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 4px; }
    .wc-drawer-input, .wc-drawer-textarea, .wc-drawer-select {
      width: 100%; box-sizing: border-box; font-family: var(--vscode-font-family); font-size: 12px;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(127,127,127,.35)); border-radius: 4px; padding: 4px 6px;
    }
    .wc-drawer-textarea { resize: vertical; min-height: 48px; }
    .wc-drawer-summary-body { font-size: 12px; line-height: 1.4; padding: 6px 8px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .wc-drawer-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    /* ── Status tab embed: shared with the standalone Status webview panel ── */
    ${STATUS_PANEL_EMBED_CSS}
    .wc-status-tab-embedded { margin-top: 12px; }
    .wc-status-tab-embedded > .wc-status-head { padding-top: 4px; }
  </style>
</head>
<body>
  <div id="root">${rootInnerHtml}</div>
  <div id="wc-drawer-host" class="wc-drawer-host wc-drawer-host--hidden" aria-hidden="true"></div>
  <footer class="dash-footer">
    <button type="button" id="btn" class="wc-btn wc-btn-lg wc-btn-primary dash-refresh-btn" title="Refetch dashboard-summary now. The panel also reloads when you switch back to it, when kit-owned files change, and about every 45s while visible.">Refresh</button>
  </footer>
  <script>${bootstrap}</script>
</body>
</html>`;
  }
}
