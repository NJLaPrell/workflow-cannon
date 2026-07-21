import * as vscode from "vscode";
import path from "node:path";
import type { DashboardSummaryCommandSuccess } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import { prefillCursorChat, resolveEditorIntegrationState } from "../../cursor-chat-prefill.js";
import { resolveMcpHostStatus } from "../../mcp/resolve-mcp-host-status.js";
import type { CommandClient, KitRunResult } from "../../runtime/command-client.js";
import {
  expectedPlanningGenerationArgs,
  ingestPlanningGenerationFromMismatch,
  ingestPlanningMetaFromData
} from "../../planning-generation-cache.js";
import {
  GENERATE_FEATURES_SLASH_TEXT,
  buildGenerateFeaturesPrompt,
  buildCollaborationProfilesHubPrompt,
  buildImprovementTriagePrompt,
  buildPhaseNotesDiscoveryPrompt,
  buildSubagentRegistryPrompt,
  buildTaskCheckpointsRecoveryPrompt,
  buildTeamExecutionSupervisorPrompt,
  buildPlanningInterviewPrompt,
  buildPlanningInterviewResumePrompt,
  buildBrainstormSessionPrompt,
  buildTaskToPhaseBranchPrompt,
  buildTranscriptChurnResearchPrompt
} from "../../playbook-chat-prompts.js";
import { buildPhaseCompleteReleaseChatPrompt } from "../../phase-complete-release-prompt.js";
import { confirmAndRunTransition } from "../../run-transition-with-approval.js";
import { isWcTraceVerbose, logWc, logWcDrawerSubmitStep } from "../../runtime/workflow-cannon-log.js";
import { isKitRefreshRunAborted, isLostKitCliOutput } from "../../runtime/kit-refresh-run-commands.js";
import {
  DashboardRefreshController,
  type DashboardRefreshMode
} from "./dashboard-refresh-controller.js";
import { DashboardCoordinator } from "./dashboard-coordinator.js";
import { SideEffectBus } from "./dashboard-side-effects.js";
import { DrawerSessionController } from "./drawer-session.js";
import { buildDashboardWebviewBootstrapScript } from "./dashboard-webview-client.js";
import type { DashboardSectionId, DashboardSectionLoadState } from "./dashboard-section-registry.js";
import { DASHBOARD_SECTION_REGISTRY, isEagerDashboardSection } from "./dashboard-section-registry.js";
import {
  dashboardSectionsForMutation,
  type DashboardMutationKind
} from "./dashboard-section-invalidation.js";
import { renderDashboardShellInnerHtml } from "./render-dashboard-shell.js";
import {
  buildDashboardPolicyApprovalForPath,
  type DashboardPolicyPathRef
} from "../../policy/dashboard-policy-path.js";
import { executeCreateWishlistFromValidatedFields } from "../../add-wishlist-item-flow.js";
import {
  buildListTasksArgsForQueueBucket,
  filterTasksForQueueBucketCategory,
  renderQueueBucketRowsHtml,
  type DashboardQueueBucketCategory
} from "./dashboard-queue-bucket-lazy.js";
import {
  computeQueueContentFingerprint,
  dashboardSummaryNeedsQueueRollupHydration,
  dashboardSummaryProjectionForSectionPatch
} from "./dashboard-queue-fingerprint.js";
import {
  applyQueueAcceptProposedPatchToSummaryCache,
  applyQueuePhasePatchToSummaryCache,
  applyQueueTaskRemovalPatchToSummaryCache,
  lookupProposedTaskSnapshot,
  postQueueCategoryMovePatch,
  postQueuePhaseMovePatch,
  postQueueTaskRemovalPatch,
  queueContentFingerprintAfterPatch,
  resolveFromPhaseKeyForTask,
  resolveQueuePlacementFromTask,
  type QueuePhaseMovePatchArgs,
  type QueuePhasePatchPlacement
} from "./dashboard-queue-phase-patch.js";
import {
  applyQueueHumanGateResumePatchToSummaryCache,
  postQueueHumanGateResumePatch
} from "./dashboard-human-gate-patch.js";
import { DashboardDataStore } from "./dashboard-data-store.js";
import {
  getAllWeeklyCountHistories,
  recordWeeklyTaskCounts
} from "./dashboard-weekly-counts.js";
import { DashboardLoadTrace, isDashboardLoadTraceEnabled } from "./dashboard-load-trace.js";
import { DashboardPollerCoordinator } from "./dashboard-pollers.js";
import { DashboardReadPathCoordinator } from "./dashboard-read-path-coordinator.js";
import {
  type BootstrapSnapshot,
  resolveBootstrapSnapshot
} from "./bootstrap-snapshot-adapter.js";
import {
  DashboardStartupAbortedError,
  DashboardStartupController,
  type DashboardStartupTrigger
} from "./dashboard-startup-controller.js";
import {
  formatDashboardReadModeBadgeDetail,
  formatDashboardReadModeBadgeLabel
} from "./dashboard-read-mode-badge.js";
import {
  dashboardSectionIdForSlice,
  dashboardSummaryNeedsPlanningHydration,
  mergeDashboardProjectionIntoSummary,
  mergeSlicePayloadIntoSummary,
  sliceNamesForDashboardSummaryProjection,
  wrapSectionHtmlWithFreshness
} from "./dashboard-store-bridge.js";
import {
  DASHBOARD_SLICE_REGISTRY,
  sliceNamesForMutation as dashboardSliceNamesForMutation
} from "./dashboard-slice-registry.js";
import type { DashboardSliceName } from "./dashboard-snapshot-types.js";
import {
  escapeHtml,
  lazyTerminalBucketListLimit,
  lookupDashboardTaskPhaseKey,
  lookupProposedTaskPhaseKey,
  mergeReadyQueueRollupSummaries,
  renderDashboardCaeSectionInnerHtml,
  renderDashboardPhaseJournalSectionInnerHtml,
  renderDashboardRootInnerHtml,
  renderDashboardSectionInnerHtml,
  renderWcDashboardBannerHtml,
  type RenderDashboardRootOptions,
  type DashboardPhaseJournalBundle,
  type PhaseJournalKitPayload,
  type PlanningInterviewWizardPanel
} from "./render-dashboard.js";
import { isIdeasUnifiedModelEnabledForDashboard } from "../../ideas-unified-model-feature-flag.js";
import { renderConfigPanelShellHtml } from "../config/config-panel-shell.js";
import {
  buildPhaseKeySuggestion,
  sortPhaseKeySuggestions,
  type PhaseKeySuggestion
} from "../phase-select-options.js";
import { GuidanceAuthoringExtensionSide } from "../guidance/guidance-authoring-extension-side.js";
import { buildGuidanceAuthoringWebviewBootstrap } from "../guidance/guidance-authoring-webview-bootstrap.js";
import { renderGuidanceAuthoringPanelInnerHtml } from "../guidance/render-guidance-panel.js";
import { STATUS_PANEL_EMBED_CSS } from "../status/render-status-tab.js";
import {
  handleConfigExplainMessage,
  handleConfigSetMessage,
  handleConfigUnsetMessage,
  handleConfigValidateKeyMessage,
  pushConfigListToWebview
} from "../config/config-host.js";
import { CONFIG_WEBVIEW_STYLES, buildConfigWebviewBootstrapScript } from "../config/config-webview-client.js";
import { WC_BASE_CSS } from "../shared/wc-base-css.js";
import { GUIDANCE_PANEL_WEBVIEW_CSS } from "../shared/guidance-panel-webview-css.js";
import {
  buildAcceptProposedDrawerSpec,
  buildAddIdeaDrawerSpec,
  buildAddPhaseNoteDrawerSpec,
  buildAddWishlistDrawerSpec,
  buildAssignTaskPhaseDrawerSpec,
  buildConvertPhaseNoteDrawerSpec,
  buildDismissPhaseNoteDrawerSpec,
  buildEditPhaseNoteDrawerSpec,
  buildPersistPhaseNoteProposalsDrawerSpec,
  buildRegisterPhaseCatalogDrawerSpec,
  buildRegisterTeamAssignmentDrawerSpec,
  buildSubmitTeamHandoffDrawerSpec,
  buildReconcileTeamAssignmentDrawerSpec,
  buildBlockTeamAssignmentDrawerSpec,
  buildCancelTeamAssignmentDrawerSpec,
  buildCancelPlanArtifactDrawerSpec,
  buildDeletePlanArtifactDrawerSpec,
  buildRegisterSubagentDrawerSpec,
  buildSpawnSubagentDrawerSpec,
  buildCloseSubagentSessionDrawerSpec,
  buildRetireSubagentDrawerSpec,
  buildCreateCheckpointDrawerSpec,
  buildRewindCheckpointDrawerSpec,
  buildViewCheckpointCompareDrawerSpec,
  buildViewPhaseNoteDrawerSpec,
  normalizeDrawerValues,
  validateRegisterTeamAssignmentSubmit,
  validateSubmitTeamHandoffSubmit,
  validateReconcileTeamAssignmentSubmit,
  validateBlockTeamAssignmentSubmit,
  validateCancelTeamAssignmentSubmit,
  validateCancelPlanArtifactSubmit,
  validateDeletePlanArtifactSubmit,
  validateRegisterSubagentSubmit,
  validateSpawnSubagentSubmit,
  validateCloseSubagentSessionSubmit,
  validateRetireSubagentSubmit,
  validateCreateCheckpointSubmit,
  validateRewindCheckpointSubmit,
  renderDrawerFormHtml,
  validateAcceptProposedSubmit,
  validateAddIdeaSubmit,
  validateAddPhaseNoteSubmit,
  validateAddWishlistSubmit,
  validateAssignTaskPhaseSubmit,
  validateDismissPhaseNoteSubmit,
  validateEditPhaseNoteSubmit,
  validateRegisterPhaseCatalogSubmit
} from "./dashboard-input-drawer.js";

function dashboardPolicyApproval(
  path: DashboardPolicyPathRef,
  context: { taskId?: string | null; phaseKey?: string | null; humanRationale?: string | null }
): { confirmed: true; rationale: string } {
  return buildDashboardPolicyApprovalForPath(path, context);
}

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
  | { kind: "add-idea"; clientMutationId: string }
  | { kind: "assign-task-phase"; taskId: string }
  | { kind: "add-phase-note" }
  | { kind: "convert-phase-note"; noteId: string }
  | { kind: "persist-phase-note-proposals" }
  | { kind: "accept-proposed"; taskIds: string[]; categoryLabel: string }
  | { kind: "register-team-assignment" }
  | { kind: "submit-team-handoff"; assignmentId: string; workerId: string }
  | { kind: "reconcile-team-assignment"; assignmentId: string; supervisorId: string }
  | { kind: "block-team-assignment"; assignmentId: string; supervisorId: string }
  | { kind: "cancel-team-assignment"; assignmentId: string; supervisorId: string }
  | {
      kind: "cancel-plan-artifact";
      planId: string;
      planRef: string;
      ideaId?: string;
      title?: string;
    }
  | {
      kind: "delete-plan-artifact";
      planId: string;
      planRef: string;
      ideaId?: string;
      title?: string;
    }
  | { kind: "register-subagent" }
  | { kind: "spawn-subagent"; subagentId?: string; executionTaskId?: string }
  | { kind: "close-subagent-session"; sessionId: string; definitionId: string }
  | { kind: "retire-subagent"; subagentId?: string }
  | { kind: "create-checkpoint"; mode: "head" | "stash"; taskId?: string }
  | { kind: "rewind-checkpoint"; checkpointId: string; refKind: string; taskId?: string }
  | { kind: "view-checkpoint-compare" };

function summarizeDrawerSession(session: DashboardDrawerSession): string {
  switch (session.kind) {
    case "assign-task-phase":
      return `assign-task-phase taskId=${session.taskId}`;
    case "accept-proposed":
      return `accept-proposed tasks=${session.taskIds.join(",")}`;
    case "dismiss-note":
      return `dismiss-note noteId=${session.noteId}`;
    case "register-catalog":
      return "register-catalog";
    default:
      return session.kind;
  }
}

function logWebviewMessage(msg: unknown): void {
  if (!isWcTraceVerbose() || !msg || typeof msg !== "object") {
    return;
  }
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== "string" || type === "wcUiInteraction") {
    return;
  }
  logWc("webview", type);
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

/** Phase keys for assign-phase drawers: catalog descriptions, live buckets, workspace slice; descending by key. */
function collectPhaseKeySuggestions(data: Record<string, unknown>): PhaseKeySuggestion[] {
  /** phaseKey → shortDescription (null = known key without catalog text). */
  const catalogDesc = new Map<string, string | null>();

  const remember = (pk: string, shortDescription?: string | null) => {
    const k = pk.trim();
    if (!k.length) {
      return;
    }
    const sd =
      typeof shortDescription === "string" && shortDescription.trim()
        ? shortDescription.trim()
        : shortDescription === null
          ? null
          : undefined;
    const prev = catalogDesc.get(k);
    if (prev === undefined) {
      catalogDesc.set(k, sd ?? null);
      return;
    }
    if (sd && sd.length > 0 && (prev === null || prev === undefined)) {
      catalogDesc.set(k, sd);
    }
  };

  const sys = data.systemStatus as Record<string, unknown> | undefined;
  const phaseSlice = sys?.phase as Record<string, unknown> | undefined;
  if (phaseSlice && typeof phaseSlice === "object") {
    const parseRoadmapPhase = (raw: string): string => {
      const t = raw.trim();
      const fromPhrase = phaseKeyFromPhrase(t);
      if (fromPhrase) {
        return fromPhrase;
      }
      return /^\d+$/.test(t) ? t : "";
    };
    for (const rawKey of [
      phaseSlice.canonicalPhaseKey,
      phaseSlice.workspaceStatusPhaseKey,
      phaseSlice.configPhaseKey
    ]) {
      if (typeof rawKey === "string" && rawKey.trim()) {
        remember(rawKey.trim(), null);
      }
    }
    const curKP = phaseSlice.currentKitPhase;
    if (typeof curKP === "string" && curKP.trim()) {
      const pk = parseRoadmapPhase(curKP);
      if (pk) {
        remember(pk, null);
      }
    }
    const nextKP = phaseSlice.nextKitPhase;
    if (typeof nextKP === "string" && nextKP.trim()) {
      const pk = parseRoadmapPhase(nextKP);
      if (pk) {
        remember(pk, null);
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
            remember(key, sd.trim());
          } else if (inCatalog) {
            remember(key, null);
          }
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
      if (typeof pk === "string" && pk.trim()) {
        remember(pk.trim());
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
  const suggestions = [...catalogDesc.entries()].map(([phaseKey, shortDescription]) =>
    buildPhaseKeySuggestion(phaseKey, shortDescription)
  );
  return sortPhaseKeySuggestions(suggestions);
}

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workflowCannon.dashboard";

  private view?: vscode.WebviewView;
  /** Option 1 targeted pollers replace the legacy 45s global refresh timer (T100589). */
  private readonly dashboardStore = new DashboardDataStore();
  private readonly dashboardLoadTrace = new DashboardLoadTrace();
  private readonly dashboardPollers: DashboardPollerCoordinator;
  private readonly readPath: DashboardReadPathCoordinator;
  private storeUnsubscribe?: () => void;
  /** After first full HTML load, refresh only swaps `#root` via postMessage so `<details open>` state survives. */
  private dashboardRootShellReady = false;

  /** First successful data render replaces the full document once; later refreshes patch `#root`. */
  private dashboardRootHydrated = false;

  /** Sole owner of cold-start state machine + single-flight bootstrap (T100843). */
  private readonly startupController: DashboardStartupController;

  /** Coalesces queue rollup upgrades so heavier queue projections stay single-flight. */
  private queueRollupHydrationInFlight?: Promise<void>;

  /** Coalesces planning-tab upgrades from overview stub to queue projection. */
  private planningHydrationInFlight?: Promise<void>;

  /** Coalesces first-load queue projection so Tasks + Planning hydrate from one read. */
  private startupEagerHydrationInFlight?: Promise<void>;

  /** Sections hydrated via tab activation or eager first paint (T100398). */
  private hydratedDashboardSections = new Set<DashboardSectionId>();

  /** Active sidebar tab — drives targeted invalidation (T100399). */
  private activeDashboardTab = "overview";

  /** Sections marked stale while their tab was hidden (T100399). */
  private staleDashboardSections = new Set<DashboardSectionId>();

  /** Monotonic render token lives on {@link DashboardRefreshController}. */
  private readonly refreshController: DashboardRefreshController;

  /** Config tab list refresh — only for config file changes, not every dashboard-summary poll. */
  private configTabRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  /** While the webview reports focus/edit (phase filter, roster inline edit), defer full `wcReplaceRoot` refreshes. */
  private dashboardInteractionLocks = new Set<string>();
  private dashboardRefreshAfterInteraction = false;

  /** Surfaced as wcHostSnapshot.interaction.refreshBusy (T100497). */
  private dashboardRefreshBusy = false;

  /** Host drawer session state machine → wcDrawerState snapshots. */
  private drawerSessionHost?: DrawerSessionController;

  /** Intent/snapshot coordinator scaffold (T100492); drawer flows migrate in T100493+. */
  private dashboardCoordinator?: DashboardCoordinator;

  /** 0-based page for explicitly enabled wishlist rows in `dashboard-summary` (5 per page). */
  private wishlistPage = 0;

  /** Last deleted Idea row, retained for the webview undo action. */
  private lastDeletedIdeaForUndo: Record<string, unknown> | null = null;

  private planningWizard: DashboardPlanningWizardState = { kind: "idle" };

  /** In-webview drawer session (register catalog, dismiss phase note, …). */
  private dashboardDrawerSession: DashboardDrawerSession | null = null;

  /** Toasts/refresh scheduled after coordinator.runMutation (T100493). */
  private drawerSubmitPendingEffects: Array<(bus: SideEffectBus) => void> = [];

  /** Prior webview message subscription — disposed before re-wiring resolveWebviewView. */
  private webviewMessageDisposable: vscode.Disposable | undefined;

  /** CAE authoring bootstrap messages + mutation drawer (same contract as Guidance panel). */
  private dashboardGuidanceAuthoring?: GuidanceAuthoringExtensionSide;

  /** Last successful `dashboard-summary` `data` — used for phase QuickPick targets. */
  private lastDashboardSummaryData: Record<string, unknown> | null = null;

  /**
   * Last `#root` inner HTML posted via `wcReplaceRoot`.
   * Re-sent on webview boot / startup-timeout when the host is already hydrated but the
   * webview still shows the loading shell (lost early postMessage race).
   */
  private lastDashboardRootHtml: string | null = null;

  /** Cached CAE tab HTML for light dashboard refreshes. */
  private lastEmbeddedCaePanelHtml: string | null = null;

  /** Coalesce file-watcher churn so dashboard reads cannot feed back into refresh loops. */
  private kitStateRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private kitStateRefreshInFlight: Promise<void> | undefined;
  private kitStateRefreshQueued = false;
  private lastKitStateRefreshAt = 0;

  /** Options consumed by the next `pushUpdateOnce` (projection / light refresh). */
  private pendingPushUpdateOptions:
    | { light?: boolean; projection?: "full" | "overview"; skipHeavyFetches?: boolean; source?: string }
    | undefined;

  /** Last queue content fingerprint applied (skips kit-state DOM churn when rollups unchanged). */
  private lastQueueContentFingerprint: string | null = null;

  private readonly originalRun: CommandClient["run"];
  private readonly originalRunForPaint: CommandClient["runForDashboardPaint"];
  private inFlightStatusHydration: Promise<KitRunResult> | null = null;
  private readonly inFlightIdeaPlan = new Map<string, Promise<void>>();
  private readonly inFlightIdeaBrainstorm = new Map<string, Promise<void>>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: CommandClient,
    private readonly onKitStateChanged: vscode.Event<void>,
    private readonly notifyKitStateChanged: () => void,
    private readonly isTaskStateSyncInFlight?: () => boolean,
    private readonly onFirstDashboardPaint?: () => void
  ) {
    const wrapDashboardSummaryArgs = (args: Record<string, unknown> | undefined) => {
      const includeWishlist = vscode.workspace.getConfiguration("workflowCannon").get<boolean>("dashboard.includeWishlist", false);
      const newArgs = { ...args };
      if (includeWishlist) {
        newArgs.includeWishlist = true;
        if (newArgs.wishlistPage === undefined) {
          newArgs.wishlistPage = this.wishlistPage;
        }
        if (newArgs.wishlistPageSize === undefined) {
          newArgs.wishlistPageSize = 5;
        }
      } else {
        delete newArgs.wishlistPage;
        delete newArgs.wishlistPageSize;
      }
      const projection = args?.projection;
      if (projection === "overview" || projection === "full" || projection === undefined) {
        newArgs.includePhaseKickoff = true;
      }
      return newArgs;
    };

    const boundRun = this.client.run.bind(this.client);
    this.originalRun = (commandName: string, args: Record<string, unknown>) => {
      const finalArgs = commandName === "dashboard-summary" ? wrapDashboardSummaryArgs(args) : args;
      return boundRun(commandName, finalArgs);
    };

    const boundRunForPaint = this.client.runForDashboardPaint.bind(this.client);
    this.originalRunForPaint = (
      commandName: string,
      args: Record<string, unknown>,
      options?: { bootstrap?: boolean }
    ) => {
      const finalArgs = commandName === "dashboard-summary" ? wrapDashboardSummaryArgs(args) : args;
      return boundRunForPaint(commandName, finalArgs, options);
    };

    const clientAsAny = this.client as any;
    clientAsAny.run = (commandName: string, args: Record<string, unknown>) => {
      if (commandName === "dashboard-summary" && args?.projection === "status") {
        return this.runDashboardSummaryStatus(args);
      }
      return this.originalRun(commandName, args);
    };
    clientAsAny.runForDashboardPaint = (
      commandName: string,
      args: Record<string, unknown>,
      options?: { bootstrap?: boolean }
    ) => {
      if (commandName === "dashboard-summary" && args?.projection === "status") {
        return this.runDashboardSummaryStatus(args, options);
      }
      return this.originalRunForPaint(commandName, args, options);
    };

    this.refreshController = new DashboardRefreshController({
      executeRefresh: (mode, generation) => this.executeDashboardRefresh(mode, generation),
      isDeferred: () => this.isDashboardRefreshDeferred(),
      isRefreshPaused: () => this.client.isRefreshPaused(),
      onMutationStart: () => {
        this.client.setRefreshPaused(true, {
          owner: "dashboard-mutation",
          reason: "drawer/coordinator mutation"
        });
        this.readPath?.pause();
      },
      onMutationEnd: () => {
        this.client.setRefreshPaused(false, {
          owner: "dashboard-mutation",
          reason: "drawer/coordinator mutation complete"
        });
        this.readPath?.resume();
        if (
          dashboardSummaryNeedsQueueRollupHydration(this.lastDashboardSummaryData) ||
          dashboardSummaryNeedsPlanningHydration(this.lastDashboardSummaryData)
        ) {
          void this.ensureStartupEagerSectionsHydrated();
        }
      },
      log: (message) => {
        if (isWcTraceVerbose()) {
          logWc("dashboard", message);
        }
      }
    });
    this.startupController = new DashboardStartupController({
      executeBootstrap: () => this.executeDashboardStartupBootstrap(),
      executeBackgroundHydration: () => this.ensureStartupEagerSectionsHydrated(),
      onHydrated: () => {
        this.markDashboardRootHydrated();
      },
      onReady: () => {
        if (this.dashboardRootHydrated) {
          this.syncVisibleSectionsToPollers();
        }
        // T100845: quiet post-paint promote — store patches only; never restart startup.
        void this.readPath.promoteToService().then(() => {
          this.postDashboardReadModeBadge();
        });
      },
      log: (message) => logWc("dashboard", message)
    });
    this.dashboardPollers = new DashboardPollerCoordinator({
      client: this.client,
      store: this.dashboardStore,
      refreshController: this.refreshController,
      isDeferred: () =>
        !this.dashboardRootHydrated ||
        this.startupController.isBootstrapInFlight() ||
        this.isDashboardRefreshDeferred(),
      isSliceVisible: (name) => this.isDashboardSliceVisible(name),
      isRefreshPaused: () => this.client.isRefreshPaused(),
      log: (message) => {
        if (message.startsWith("dashboard-summary source=") || isWcTraceVerbose()) {
          logWc("dashboard", message);
        }
      },
      trace: isDashboardLoadTraceEnabled() ? this.dashboardLoadTrace : undefined
    });
    this.readPath = new DashboardReadPathCoordinator({
      workspacePath: this.client.getWorkspaceRoot(),
      client: this.client,
      store: this.dashboardStore,
      pollers: this.dashboardPollers,
      log: (message) => {
        if (isWcTraceVerbose()) {
          logWc("dashboard", message);
        }
      },
      onModeChanged: (badge) => {
        const detail = formatDashboardReadModeBadgeDetail(badge);
        logWc(
          "dashboard",
          `dashboard read mode: ${formatDashboardReadModeBadgeLabel(badge)}${detail ? ` — ${detail}` : ""}`
        );
        this.postDashboardReadModeBadge();
      }
    });
    this.storeUnsubscribe = this.dashboardStore.subscribe((update) => {
      void this.onDashboardSliceUpdate(update.name);
    });
    onKitStateChanged(() => {
      this.scheduleKitStateChangedRefresh();
    });
  }

  private dashboardRenderRootOptions(extra?: RenderDashboardRootOptions): RenderDashboardRootOptions {
    return {
      ...extra,
      readModeBadge: this.readPath.getModeBadge(),
      mcpStatus: resolveMcpHostStatus(this.client.getWorkspaceRoot()),
      ideasUnifiedModelEnabled: isIdeasUnifiedModelEnabledForDashboard(),
      weeklySparklines: getAllWeeklyCountHistories(this.client.getWorkspaceRoot())
    };
  }

  private dashboardRenderSectionOptions(
    extra?: Parameters<typeof renderDashboardSectionInnerHtml>[2]
  ): Parameters<typeof renderDashboardSectionInnerHtml>[2] {
    return {
      ...extra,
      mcpStatus: extra?.mcpStatus ?? resolveMcpHostStatus(this.client.getWorkspaceRoot()),
      ideasUnifiedModelEnabled: isIdeasUnifiedModelEnabledForDashboard(),
      weeklySparklines: getAllWeeklyCountHistories(this.client.getWorkspaceRoot())
    };
  }

  private postDashboardReadModeBadge(): void {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    const badge = this.readPath.getModeBadge();
    void webview.postMessage({
      type: "wcDashboardReadMode",
      badge: {
        label: formatDashboardReadModeBadgeLabel(badge),
        detail: formatDashboardReadModeBadgeDetail(badge)
      }
    });
  }

  /** Re-resolve `dashboard.dataSource` after config file changes (T100599). */
  reloadReadPathFromConfig(): void {
    void this.readPath.reloadFromConfig();
  }

  async restartDashboardService(): Promise<void> {
    const result = await this.readPath.restartDashboardService();
    if (!result.ok) {
      await vscode.window.showErrorMessage(
        result.message ?? "Failed to start dashboard service"
      );
      return;
    }
    await vscode.window.showInformationMessage(
      result.message ?? "Dashboard service restarted"
    );
  }

  async forceCliDashboardRefreshMode(): Promise<void> {
    await this.readPath.forceCliPollingMode();
    await vscode.window.showInformationMessage(
      "Dashboard is using CLI refresh mode for this session."
    );
  }

  private markDashboardRootHydrated(): void {
    if (this.dashboardRootHydrated) {
      return;
    }
    this.dashboardRootHydrated = true;
    this.onFirstDashboardPaint?.();
  }

  /** Post `wcReplaceRoot` and retain HTML for boot/timeout recovery repaints. */
  private async postReplaceRootHtml(
    webview: vscode.Webview,
    html: string,
    reason: string
  ): Promise<void> {
    this.lastDashboardRootHtml = html;
    await webview.postMessage({ type: "wcReplaceRoot", html });
    // Ack cancels the webview startup timeout probe when the host already painted.
    await webview.postMessage({ type: "dashboardStartupAck", reason });
  }

  /**
   * Re-send the last successful root HTML when the webview still shows the loading shell
   * after the host already reached hydrated/ready (early `wcReplaceRoot` can be dropped).
   */
  private async repaintCachedDashboardRoot(reason: string): Promise<boolean> {
    const webview = this.view?.webview;
    const html = this.lastDashboardRootHtml;
    if (!webview || !html || !this.startupController.isHydrated()) {
      return false;
    }
    logWc("dashboard", `startup recovery repaint via cached wcReplaceRoot reason=${reason}`);
    await this.postReplaceRootHtml(webview, html, `recovery:${reason}`);
    return true;
  }

  /**
   * Skip coalesced refresh kit reads while a mutation hold is active — except the first
   * dashboard paint bootstrap where the webview must not stall on task-state sync backlog.
   */
  private shouldSkipDashboardKitRefresh(): boolean {
    return (
      (this.client.isRefreshPaused() || this.refreshController.isSuppressed()) &&
      this.dashboardRootHydrated
    );
  }

  /**
   * Bootstrap / queue-upgrade reads use {@link CommandClient.runForDashboardPaint} so
   * task-state sync on the mutation lane cannot leave overview stubs at zero counts.
   */
  private shouldUseDashboardPaintLane(): boolean {
    if (this.shouldSkipDashboardKitRefresh()) {
      return false;
    }
    return !this.dashboardRootHydrated;
  }

  private runDashboardSummary(
    args: Record<string, unknown>,
    source: string
  ): Promise<DashboardSummaryCommandSuccess | Record<string, unknown>> {
    const bootstrapPaint = !this.dashboardRootHydrated;
    const usePaintLane = this.shouldUseDashboardPaintLane();
    logWc(
      "dashboard",
      `dashboard-summary source=${source} projection=${String(args.projection ?? "full")} lane=${usePaintLane ? "paint" : "refresh"} bootstrap=${String(bootstrapPaint)} rootHydrated=${String(this.dashboardRootHydrated)}`
    );
    const runner = usePaintLane
      ? (name: string, a: Record<string, unknown>) =>
          this.client.runForDashboardPaint(name, a, { bootstrap: bootstrapPaint })
      : (name: string, a: Record<string, unknown>) => this.client.run(name, a);
    return runner("dashboard-summary", args) as Promise<
      DashboardSummaryCommandSuccess | Record<string, unknown>
    >;
  }

  private overlayTaskStateSyncForRender(data: Record<string, unknown>): Record<string, unknown> {
    if (!this.isTaskStateSyncInFlight?.()) {
      return data;
    }
    const proj = data.taskStateProjection;
    if (!proj || typeof proj !== "object" || Array.isArray(proj)) {
      return data;
    }
    return {
      ...data,
      taskStateProjection: {
        ...(proj as Record<string, unknown>),
        displayState: "syncing",
        remediation: "Fetching and applying canonical task-state events from git…"
      }
    };
  }

  private wrapDashboardPayloadForRender(raw: Record<string, unknown>): Record<string, unknown> {
    if (raw.ok !== true || !raw.data || typeof raw.data !== "object") {
      return raw;
    }
    return {
      ...raw,
      data: this.overlayTaskStateSyncForRender(raw.data as Record<string, unknown>)
    };
  }

  /** Prefer merged summary cache over a partial projection response when rendering. */
  private dashboardRenderPayload(
    raw: DashboardSummaryCommandSuccess | Record<string, unknown>
  ): Record<string, unknown> {
    const merged = this.lastDashboardSummaryData;
    if (raw.ok === true && merged && Object.keys(merged).length > 0) {
      return this.wrapDashboardPayloadForRender({
        ok: true,
        data: merged,
        code: (raw as { code?: string }).code
      });
    }
    return this.wrapDashboardPayloadForRender(raw as Record<string, unknown>);
  }

  private isDashboardSliceVisible(name: DashboardSliceName): boolean {
    const sectionId = dashboardSectionIdForSlice(name);
    if (!this.hydratedDashboardSections.has(sectionId)) {
      return false;
    }
    const tabId = DASHBOARD_SECTION_REGISTRY.find((s) => s.id === sectionId)?.tabId ?? "";
    if (tabId === this.activeDashboardTab) {
      return true;
    }
    // Eagerly allow queue slice updates on the overview tab to keep the stat pills fresh.
    if (name === "queue" && this.activeDashboardTab === "overview") {
      return true;
    }
    return false;
  }

  private syncVisibleSectionsToPollers(): void {
    const visible = DASHBOARD_SECTION_REGISTRY.filter((section) => {
      if (!this.hydratedDashboardSections.has(section.id)) {
        return false;
      }
      return section.tabId === this.activeDashboardTab;
    }).map((section) => section.id);
    this.readPath.setVisibleSections(visible);
  }

  private ingestDashboardSummaryIntoStore(
    data: Record<string, unknown>,
    projection: "overview" | "queue" | "status" | "agentActivity"
  ): void {
    const planningGeneration =
      typeof data.planningGeneration === "number" ? data.planningGeneration : null;
    for (const sliceName of sliceNamesForDashboardSummaryProjection(projection)) {
      const desc = DASHBOARD_SLICE_REGISTRY.find((entry) => entry.name === sliceName);
      if (!desc) {
        continue;
      }
      this.dashboardStore.updateSlice(sliceName, desc.extractPayload(data), {
        source: desc.command,
        sourceArgs: { ...desc.args },
        planningGeneration
      });
    }
  }

  private async onDashboardSliceUpdate(sliceName: DashboardSliceName): Promise<void> {
    if (!this.view?.visible || this.refreshController.isSuppressed()) {
      return;
    }
    const slice = this.dashboardStore.getSlice(sliceName);
    if (!slice.value || typeof slice.value !== "object") {
      return;
    }
    const sectionId = dashboardSectionIdForSlice(sliceName);
    if (!this.hydratedDashboardSections.has(sectionId)) {
      return;
    }
    const tabId = DASHBOARD_SECTION_REGISTRY.find((s) => s.id === sectionId)?.tabId ?? "";
    if (
      tabId !== this.activeDashboardTab &&
      !isEagerDashboardSection(sectionId) &&
      !(sliceName === "queue" && this.activeDashboardTab === "overview")
    ) {
      return;
    }
    const prior = this.lastDashboardSummaryData ?? {};
    this.lastDashboardSummaryData = mergeSlicePayloadIntoSummary(
      prior,
      sliceName,
      slice.value as Record<string, unknown>
    );
    // Record weekly task counts whenever queue data arrives.
    if (sliceName === "queue") {
      const d = this.lastDashboardSummaryData;
      const readyImp = (d?.readyImprovementsSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const readyExe = (d?.readyExecutionSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const ready =
        typeof d?.readyQueueCount === "number"
          ? d.readyQueueCount
          : (typeof readyImp === "number" ? readyImp : 0) + (typeof readyExe === "number" ? readyExe : 0);
      const proposedImp = (d?.proposedImprovementsSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const proposedExe = (d?.proposedExecutionSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const proposed =
        (typeof proposedImp === "number" ? proposedImp : 0) + (typeof proposedExe === "number" ? proposedExe : 0);
      const blocked = (d?.blockedSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const done = (d?.completedSummary as Record<string, unknown> | undefined)?.count ?? 0;
      const human = (d?.humanGatesSummary as Record<string, unknown> | undefined)?.count ?? 0;
      recordWeeklyTaskCounts(this.client.getWorkspaceRoot(), {
        ready,
        proposed,
        blocked: typeof blocked === "number" ? blocked : 0,
        done: typeof done === "number" ? done : 0,
        human: typeof human === "number" ? human : 0
      });
    }
    await this.patchDashboardSectionFromStore(sectionId, slice);
    if (sliceName === "queue" && this.hydratedDashboardSections.has("overview")) {
      await this.patchDashboardSectionFromStore("overview");
    }
  }

  private async patchDashboardSectionFromStore(
    sectionId: DashboardSectionId,
    slice?: import("./dashboard-snapshot-types.js").DashboardSlice
  ): Promise<void> {
    const activeView = this.view;
    const summaryData = this.lastDashboardSummaryData;
    if (!activeView || !summaryData) {
      return;
    }
    const raw = { ok: true as const, data: summaryData };
    let inner: string | null;
    try {
      const editorIntegration = await resolveEditorIntegrationState();
      inner = renderDashboardSectionInnerHtml(
        sectionId,
        this.wrapDashboardPayloadForRender(raw as Record<string, unknown>),
        this.dashboardRenderSectionOptions({
          editorIntegration,
          embeddedCaePanelHtml: this.lastEmbeddedCaePanelHtml
        })
      );
    } catch (e) {
      logWc(
        "dashboard",
        `patchDashboardSectionFromStore render failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }
    if (inner == null) {
      return;
    }
    const storeSlice = slice ?? this.dashboardStore.getSlice(
      DASHBOARD_SLICE_REGISTRY.find((entry) => entry.sectionId === sectionId)?.name ?? "overview"
    );
    const html = wrapSectionHtmlWithFreshness(inner, storeSlice);
    const state: DashboardSectionLoadState =
      storeSlice.status === "error"
        ? "error"
        : storeSlice.status === "stale"
          ? "stale"
          : storeSlice.status === "loading"
            ? "loading"
            : "ready";
    await this.postSectionPatch(sectionId, html, state);
    this.staleDashboardSections.delete(sectionId);
    if (sectionId === "queue") {
      this.lastQueueContentFingerprint = computeQueueContentFingerprint(summaryData);
      await this.postTaskEngineTabBadgesFromSummary(summaryData);
    }
    if (sectionId === "overview") {
      await this.postBannerPatch(summaryData);
    }
  }

  /**
   * Kit file watcher refresh — never full `wcReplaceRoot` (that wipes lazy queue rows).
   * Patches visible sections only; queue uses content fingerprint to no-op when unchanged.
   */
  private scheduleKitStateChangedRefresh(): void {
    if (this.kitStateRefreshTimer) {
      clearTimeout(this.kitStateRefreshTimer);
    }
    this.kitStateRefreshTimer = setTimeout(() => {
      this.kitStateRefreshTimer = undefined;
      void this.runKitStateChangedRefresh();
    }, 1_500);
  }

  private async runKitStateChangedRefresh(): Promise<void> {
    if (this.kitStateRefreshInFlight) {
      this.kitStateRefreshQueued = true;
      return this.kitStateRefreshInFlight;
    }
    const elapsed = Date.now() - this.lastKitStateRefreshAt;
    if (elapsed < 10_000) {
      this.kitStateRefreshQueued = true;
      if (!this.kitStateRefreshTimer) {
        this.kitStateRefreshTimer = setTimeout(() => {
          this.kitStateRefreshTimer = undefined;
          void this.runKitStateChangedRefresh();
        }, 10_000 - elapsed);
      }
      return;
    }
    const run = (async () => {
      this.lastKitStateRefreshAt = Date.now();
      await this.onKitStateChangedRefresh();
    })().finally(() => {
      if (this.kitStateRefreshInFlight === run) {
        this.kitStateRefreshInFlight = undefined;
      }
      if (this.kitStateRefreshQueued) {
        this.kitStateRefreshQueued = false;
        this.scheduleKitStateChangedRefresh();
      }
    });
    this.kitStateRefreshInFlight = run;
    return run;
  }

  private async onKitStateChangedRefresh(): Promise<void> {
    if (!this.view?.visible || this.refreshController.isSuppressed()) {
      return;
    }
    if (this.dashboardDrawerSession) {
      return;
    }
    if (this.isDashboardRefreshDeferred()) {
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    const updateSequence = this.refreshController.currentGeneration();
    if (this.activeDashboardTab === "task-engine") {
      if (this.hydratedDashboardSections.has("queue")) {
        await this.patchQueueSectionFromKitState(updateSequence);
      }
      if (this.hydratedDashboardSections.has("phase-journal")) {
        await this.patchDashboardSectionsFromSummary(["phase-journal"], updateSequence, {
          light: true
        });
      }
      return;
    }
    if (this.activeDashboardTab === "overview" && this.hydratedDashboardSections.has("overview")) {
      if (
        dashboardSummaryNeedsQueueRollupHydration(this.lastDashboardSummaryData) ||
        dashboardSummaryNeedsPlanningHydration(this.lastDashboardSummaryData)
      ) {
        await this.ensureStartupEagerSectionsHydrated();
        return;
      }
      await this.patchDashboardSectionsFromSummary(
        this.hydratedDashboardSections.has("queue") ? ["overview", "queue"] : ["overview"],
        updateSequence,
        {
          light: true,
          projection: this.hydratedDashboardSections.has("queue") ? "queue" : "overview",
          source: "kit-state refresh"
        }
      );
      return;
    }
    if (this.activeDashboardTab === "planning") {
      const planningSections = DASHBOARD_SECTION_REGISTRY.filter(
        (section) => section.tabId === "planning" && this.hydratedDashboardSections.has(section.id)
      ).map((section) => section.id);
      if (planningSections.length > 0) {
        await this.patchDashboardSectionsFromSummary(planningSections, updateSequence, {
          light: true,
          projection: "queue",
          source: "kit-state refresh"
        });
      }
      return;
    }
    if (this.hydratedDashboardSections.has("queue")) {
      await this.markDashboardSectionStale("queue");
    }
  }

  /** Queue-only kit refresh with content fingerprint short-circuit. */
  private async patchQueueSectionFromKitState(updateSequence?: number): Promise<void> {
    if (this.activeDashboardTab !== "task-engine") {
      this.staleDashboardSections.add("queue");
      return;
    }
    await this.patchDashboardSectionsFromSummary(["queue"], updateSequence, {
      light: true,
      projection: "queue",
      source: "kit-state refresh"
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    const { webview } = webviewView;
    this.drawerSessionHost = new DrawerSessionController(() => {
      this.dashboardCoordinator?.emitSnapshot();
    });
    this.initDashboardCoordinator(webview);
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
    logWc("dashboard", "resolveWebviewView: wiring handlers");
    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = webview.onDidReceiveMessage(async (msg) => {
      logWebviewMessage(msg);
      if (await this.handleConfigWebviewMessage(webview, msg as Record<string, unknown>)) {
        return;
      }
      if (msg?.type === "wcUiInteraction") {
        const source = typeof msg.source === "string" ? msg.source.trim() : "";
        if (source.length > 0) {
          this.setDashboardUiInteraction(source, msg.active === true);
        }
        return;
      }
      if (msg?.type === "refresh") {
        this.dashboardInteractionLocks.clear();
        this.dashboardRefreshAfterInteraction = false;
        await webview.postMessage({ type: "wcReleaseRefreshBlock" });
        await this.pushUpdate({ projection: "overview", skipHeavyFetches: false, source: "manual refresh" });
      }
      if (msg?.type === "dashboardWebviewBoot") {
        logWc("dashboard", "webview boot");
        // Host may have posted wcReplaceRoot before the webview listener existed.
        await this.repaintCachedDashboardRoot("webview-boot");
        await this.requestDashboardStartup("webview-boot");
        return;
      }
      if (msg?.type === "dashboardStartupTimeout") {
        const rootClass = typeof msg.rootClass === "string" ? msg.rootClass : "";
        logWc("dashboard", `startup timeout rootClass=${rootClass}`);
        // Prefer re-sending the last good paint over ignoring a false-positive timeout.
        const recovered = await this.repaintCachedDashboardRoot("startup-timeout");
        if (recovered) {
          return;
        }
        await this.requestDashboardStartup("startup-timeout");
        return;
      }
      if (msg?.type === "dashboardStartupRefresh") {
        logWc("dashboard", "startup diagnostic refresh");
        this.dashboardInteractionLocks.clear();
        this.dashboardRefreshAfterInteraction = false;
        await this.requestDashboardStartup("startup-refresh");
        return;
      }
      if (msg?.type === "dashboardWebviewReady") {
        logWc("dashboard", "webview ready");
        await this.requestDashboardStartup("webview-ready");
        return;
      }
      if (msg?.type === "dashboardTabActivated") {
        const tabId = typeof (msg as { tabId?: unknown }).tabId === "string" ? (msg as { tabId: string }).tabId : "";
        if (tabId.length > 0) {
          this.activeDashboardTab = tabId;
          void this.onDashboardTabActivated(tabId);
        }
      }
      if (msg?.type === "loadQueueBucketRows") {
        const categoryRaw = (msg as { category?: unknown }).category;
        const category =
          typeof categoryRaw === "string" ? (categoryRaw.trim() as DashboardQueueBucketCategory) : null;
        const phaseKey =
          typeof (msg as { phaseKey?: unknown }).phaseKey === "string"
            ? (msg as { phaseKey: string }).phaseKey
            : "";
        const cursor =
          typeof (msg as { cursor?: unknown }).cursor === "string"
            ? (msg as { cursor: string }).cursor
            : undefined;
        if (category) {
          void this.loadQueueBucketRows(category, phaseKey, cursor);
        }
      }
      if (msg?.type === "queuePhasePatchFailed") {
        logWc(
          "dashboard",
          `queue phase patch failed reason=${String((msg as { reason?: unknown }).reason ?? "")}`
        );
        if (this.lastDashboardSummaryData && this.hydratedDashboardSections.has("queue")) {
          if (dashboardSummaryNeedsQueueRollupHydration(this.lastDashboardSummaryData)) {
            this.refreshController.request({ reason: "queue-phase-patch-fallback", mode: "light" });
          } else {
            void this.patchDashboardSectionsFromSummary(["queue"], undefined, {
              light: true,
              projection: "queue",
              cachedSummaryOnly: true,
              source: "queue-phase-patch-fallback-cached"
            });
          }
        } else {
          this.refreshController.request({ reason: "queue-phase-patch-fallback", mode: "light" });
        }
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
          void this.loadQueueBucketRows(terminalStatus, phaseKey);
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
        await this.applyDashboardMutationInvalidation("task-queue");
      }
      if (msg?.type === "prefillWishlistChat") {
        await prefillCursorChat(buildGenerateFeaturesPrompt());
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
      if (msg?.type === "addIdea") {
        await this.openAddIdeaDrawer();
      }
      if (msg?.type === "updateIdea") {
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        const title = typeof msg.title === "string" ? msg.title.trim() : "";
        const note = typeof msg.note === "string" ? msg.note.trim() : "";
        await this.onUpdateIdeaFromDashboard(ideaId, title, note);
      }
      if (msg?.type === "deleteIdea") {
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        await this.onDeleteIdeaFromDashboard(ideaId);
      }
      if (msg?.type === "undoDeleteIdea") {
        await this.onUndoDeleteIdeaFromDashboard();
      }
      if (msg?.type === "prefillIdeaPlanningChat") {
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        const title = typeof msg.title === "string" ? msg.title.trim() : "";
        const note = typeof msg.note === "string" ? msg.note.trim() : "";
        await this.onPrefillIdeaPlanningChat(ideaId, title, note);
      }
      if (msg?.type === "prefillIdeaBrainstormChat") {
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        const planRef = typeof msg.planRef === "string" ? msg.planRef.trim() : "";
        const title = typeof msg.title === "string" ? msg.title.trim() : "";
        const note = typeof msg.note === "string" ? msg.note.trim() : "";
        await this.onPrefillIdeaBrainstormChat(ideaId, planRef, title, note);
      }
      if (msg?.type === "checkIdeaDelivery") {
        const planRef = typeof msg.planRef === "string" ? msg.planRef.trim() : "";
        if (planRef.length > 0) {
          await this.onCheckIdeaDelivery(planRef);
        }
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
        const laterRaw = msg?.laterDeliveredPhases;
        const laterDeliveredPhases =
          typeof laterRaw === "string" && laterRaw.trim().length > 0 ? laterRaw.trim() : undefined;
        await prefillCursorChat(
          buildPhaseCompleteReleaseChatPrompt(phasePhrase, {
            phaseKey,
            phaseLabel: phasePhrase || undefined,
            currentKitPhase: wsCur || undefined,
            nextKitPhase: wsNext || undefined,
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
            if (msg?.transitionKind === "human-gate") {
              await this.client.clearActivity();
            }
            // Drawer submit refreshes the queue after accept+assign; do not patch here (collapses open buckets).
            return;
          }
          const transitionResult = await confirmAndRunTransition(
            this.client,
            () => {
              /* queue refresh via targeted patch or applyDashboardMutationInvalidation below */
            },
            taskId,
            action,
            rejectSubject
          );
          if (transitionResult?.ok) {
            if (msg?.transitionKind === "human-gate") {
              await this.client.clearActivity();
            }
            const patched = await this.tryApplyQueueTransitionTargetedPatch({
              taskId,
              action,
              transitionData: transitionResult.data as Record<string, unknown> | undefined
            });
            if (!patched) {
              await this.applyDashboardMutationInvalidation("task-queue");
            }
          }
        }
      }
      if (msg?.type === "dismissPhaseNote") {
        const nid = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        const pri = typeof msg.priority === "string" ? msg.priority.trim() : "";
        if (nid.length > 0) {
          await this.onDismissPhaseNote(nid, pri);
          if (!this.dashboardDrawerSession) {
            await this.applyDashboardMutationInvalidation("phase-journal");
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
        await this.applyDashboardMutationInvalidation("phase-journal");
      }
      if (msg?.type === "prefillPhaseNotesDiscoveryChat") {
        await prefillCursorChat(buildPhaseNotesDiscoveryPrompt(), { newChat: true });
      }
      if (msg?.type === "prefillTeamExecutionChat") {
        await prefillCursorChat(buildTeamExecutionSupervisorPrompt(), { newChat: true });
      }
      if (msg?.type === "registerTeamAssignment") {
        await this.openRegisterTeamAssignmentDrawer();
      }
      if (msg?.type === "submitTeamHandoff") {
        const assignmentId = typeof msg.assignmentId === "string" ? msg.assignmentId.trim() : "";
        const workerId = typeof msg.workerId === "string" ? msg.workerId.trim() : "";
        if (assignmentId && workerId) {
          await this.openSubmitTeamHandoffDrawer(assignmentId, workerId);
        }
      }
      if (msg?.type === "reconcileTeamAssignment") {
        const assignmentId = typeof msg.assignmentId === "string" ? msg.assignmentId.trim() : "";
        const supervisorId = typeof msg.supervisorId === "string" ? msg.supervisorId.trim() : "";
        if (assignmentId && supervisorId) {
          await this.openReconcileTeamAssignmentDrawer(assignmentId, supervisorId);
        }
      }
      if (msg?.type === "blockTeamAssignment") {
        const assignmentId = typeof msg.assignmentId === "string" ? msg.assignmentId.trim() : "";
        const supervisorId = typeof msg.supervisorId === "string" ? msg.supervisorId.trim() : "";
        if (assignmentId && supervisorId) {
          await this.openBlockTeamAssignmentDrawer(assignmentId, supervisorId);
        }
      }
      if (msg?.type === "cancelTeamAssignment") {
        const assignmentId = typeof msg.assignmentId === "string" ? msg.assignmentId.trim() : "";
        const supervisorId = typeof msg.supervisorId === "string" ? msg.supervisorId.trim() : "";
        if (assignmentId) {
          await this.openCancelTeamAssignmentDrawer(assignmentId, supervisorId);
        }
      }
      if (msg?.type === "cancelPlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const planRef = typeof msg.planRef === "string" ? msg.planRef.trim() : "";
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        const title = typeof msg.title === "string" ? msg.title.trim() : "";
        if (planId && planRef) {
          await this.openCancelPlanArtifactDrawer({
            planId,
            planRef,
            ...(ideaId ? { ideaId } : {}),
            ...(title ? { title } : {})
          });
        }
      }
      if (msg?.type === "deletePlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const planRef = typeof msg.planRef === "string" ? msg.planRef.trim() : "";
        const ideaId = typeof msg.ideaId === "string" ? msg.ideaId.trim() : "";
        const title = typeof msg.title === "string" ? msg.title.trim() : "";
        if (planId && planRef) {
          await this.openDeletePlanArtifactDrawer({
            planId,
            planRef,
            ...(ideaId ? { ideaId } : {}),
            ...(title ? { title } : {})
          });
        }
      }
      if (msg?.type === "prefillSubagentRegistryChat") {
        await prefillCursorChat(buildSubagentRegistryPrompt(), { newChat: true });
      }
      if (msg?.type === "registerSubagent") {
        await this.openRegisterSubagentDrawer();
      }
      if (msg?.type === "spawnSubagent") {
        const subagentId = typeof msg.subagentId === "string" ? msg.subagentId.trim() : "";
        const executionTaskId = typeof msg.executionTaskId === "string" ? msg.executionTaskId.trim() : "";
        await this.openSpawnSubagentDrawer(subagentId, executionTaskId);
      }
      if (msg?.type === "closeSubagentSession") {
        const sessionId = typeof msg.sessionId === "string" ? msg.sessionId.trim() : "";
        const definitionId = typeof msg.definitionId === "string" ? msg.definitionId.trim() : "";
        if (sessionId && definitionId) {
          await this.openCloseSubagentSessionDrawer(sessionId, definitionId);
        }
      }
      if (msg?.type === "retireSubagent") {
        const subagentId = typeof msg.subagentId === "string" ? msg.subagentId.trim() : "";
        await this.openRetireSubagentDrawer(subagentId);
      }
      if (msg?.type === "prefillTaskCheckpointsRecoveryChat") {
        await prefillCursorChat(buildTaskCheckpointsRecoveryPrompt(), { newChat: true });
      }
      if (msg?.type === "createCheckpoint") {
        const mode = msg.mode === "stash" ? "stash" : "head";
        const taskId = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        await this.openCreateCheckpointDrawer(mode, taskId);
      }
      if (msg?.type === "compareCheckpoint") {
        const checkpointId = typeof msg.checkpointId === "string" ? msg.checkpointId.trim() : "";
        if (checkpointId) {
          await this.openCompareCheckpointDrawer(checkpointId);
        }
      }
      if (msg?.type === "rewindCheckpoint") {
        const checkpointId = typeof msg.checkpointId === "string" ? msg.checkpointId.trim() : "";
        const refKind = typeof msg.refKind === "string" ? msg.refKind.trim() : "head";
        const taskId = typeof msg.taskId === "string" ? msg.taskId.trim() : "";
        if (checkpointId) {
          await this.openRewindCheckpointDrawer(checkpointId, refKind, taskId);
        }
      }
      if (msg?.type === "convertPhaseNote") {
        const nid = typeof msg.noteId === "string" ? msg.noteId.trim() : "";
        if (nid.length > 0) {
          await this.onConvertPhaseNote(nid);
          await this.applyDashboardMutationInvalidation("phase-journal");
        }
      }
      if (msg?.type === "persistPhaseNoteProposals") {
        await this.onPersistPhaseNoteProposals();
        await this.applyDashboardMutationInvalidation("phase-journal");
      }
      if (msg?.type === "assignTaskPhase") {
        const rawId = msg?.taskId;
        const taskId = typeof rawId === "string" ? rawId.trim() : "";
        if (taskId.length > 0) {
          logWc("dashboard", `action assignTaskPhase taskId=${taskId}`);
          await this.onAssignTaskPhase(taskId);
        }
      }
      if (msg?.type === "registerPhaseCatalogEntry") {
        await this.onRegisterPhaseCatalogEntry();
        if (!this.dashboardDrawerSession) {
          await this.pushUpdate();
        }
      }
      if (msg?.type === "startPhaseFromRoster") {
        const phaseKey = typeof msg.phaseKey === "string" ? msg.phaseKey.trim() : "";
        if (phaseKey.length > 0) {
          await this.onStartPhaseFromRoster(phaseKey);
        }
      }
      if (msg?.type === "markPhaseComplete") {
        const phaseKey = typeof msg.phaseKey === "string" ? msg.phaseKey.trim() : "";
        if (phaseKey.length > 0) {
          await this.onMarkPhaseComplete(phaseKey);
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
            await this.view?.webview.postMessage({
              type: "wcPhaseDeliverablesSaved",
              phaseKey,
              deliverables
            });
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
        const session = this.dashboardDrawerSession;
        const coordinator = this.dashboardCoordinator;
        if (!coordinator) {
          logWc("dashboard", "drawerSubmit ignored (coordinator not ready)");
          return;
        }
        logWc(
          "dashboard",
          session ? `drawerSubmit ${summarizeDrawerSession(session)}` : "drawerSubmit (no session)"
        );
        await coordinator.dispatch({
          type: "drawer.submit",
          values,
          sessionLabel: session ? summarizeDrawerSession(session) : "drawer submit"
        });
      }
      if (msg?.type === "drawerCancel") {
        logWc("dashboard", "drawerCancel");
        if (await this.dashboardGuidanceAuthoring?.handleCaeDrawerCancelIfActive()) {
          return;
        }
        const coordinator = this.dashboardCoordinator;
        if (coordinator) {
          await coordinator.dispatch({ type: "drawer.cancel" });
        } else {
          await this.closeDashboardDrawer();
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
        const phaseKey = typeof msg.phaseKey === "string" ? msg.phaseKey.trim() : "";
        if (taskIds.length > 0) {
          await this.onDashboardAcceptProposedBatch(taskIds, label, phaseKey || undefined);
        }
      }
      if (msg?.type === "acceptPlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const planRef = typeof msg.planRef === "string" ? msg.planRef.trim() : "";
        const versionRaw = typeof msg.version === "string" ? msg.version.trim() : "";
        const version = Number(versionRaw);
        if (planId && planRef && Number.isFinite(version) && version > 0) {
          await this.onAcceptPlanArtifact(planId, planRef, Math.floor(version));
        }
      }
      if (msg?.type === "invalidPlanArtifactAction") {
        const action = typeof msg.action === "string" && msg.action.trim().length > 0 ? msg.action.trim() : "plan";
        await vscode.window.showWarningMessage(
          `Cannot ${action} this plan because its dashboard identity is incomplete. Refresh the dashboard and try again.`
        );
      }
      if (msg?.type === "reviewPlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const versionRaw = typeof msg.version === "string" ? msg.version.trim() : "";
        const version = Number(versionRaw);
        if (planId && Number.isFinite(version) && version > 0) {
          await this.onReviewPlanArtifact(planId, Math.floor(version));
        } else {
          await vscode.window.showWarningMessage(
            "Cannot review this plan because its dashboard identity is incomplete. Refresh the dashboard and try again."
          );
        }
      }
      if (msg?.type === "finalizePlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const versionRaw = typeof msg.version === "string" ? msg.version.trim() : "";
        const version = Number(versionRaw);
        if (planId && Number.isFinite(version) && version > 0) {
          await this.onFinalizePlanArtifact(planId, Math.floor(version));
        }
      }
      if (msg?.type === "viewPlanArtifact") {
        const planId = typeof msg.planId === "string" ? msg.planId.trim() : "";
        const versionRaw = typeof msg.version === "string" ? msg.version.trim() : "";
        const version = Number(versionRaw);
        if (planId && Number.isFinite(version) && version > 0) {
          await this.onViewPlanArtifact(planId, Math.floor(version));
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
      if (
        !webviewView.visible ||
        this.refreshController.isSuppressed() ||
        !this.dashboardRootHydrated ||
        this.startupController.isBootstrapInFlight()
      ) {
        return;
      }
      this.syncVisibleSectionsToPollers();
    });
    this.dashboardStore.start();
    // T100845: paint-safe probe only — no dashboard-service-start on critical path.
    void this.readPath.startForPaint().then(() => {
      this.postDashboardReadModeBadge();
    });
    webviewView.onDidDispose(() => {
      this.dashboardRootShellReady = false;
      this.dashboardRootHydrated = false;
      this.lastDashboardRootHtml = null;
      this.startupController.reset();
      this.queueRollupHydrationInFlight = undefined;
      this.kitStateRefreshInFlight = undefined;
      this.kitStateRefreshQueued = false;
      if (this.kitStateRefreshTimer) {
        clearTimeout(this.kitStateRefreshTimer);
        this.kitStateRefreshTimer = undefined;
      }
      this.hydratedDashboardSections.clear();
      this.staleDashboardSections.clear();
      this.webviewMessageDisposable?.dispose();
      this.webviewMessageDisposable = undefined;
      this.refreshController.notifyMutationEnd();
      this.client.setRefreshPaused(false, { owner: "dashboard-mutation" });
      this.client.clearRefreshPaused("dashboard disposed");
      void this.readPath.stop();
      this.storeUnsubscribe?.();
      this.storeUnsubscribe = undefined;
      this.dashboardStore.dispose();
      if (this.view === webviewView) {
        this.view = undefined;
      }
      this.dashboardGuidanceAuthoring = undefined;
    });
    // Shell-first paint (T100395): document before any dashboard-summary await.
    this.dashboardRootHydrated = false;
    this.lastDashboardRootHtml = null;
    this.startupController.reset();
    webview.html = this.buildHtml(webview, renderDashboardShellInnerHtml());
    this.dashboardRootShellReady = true;
    this.startupController.markShellPainted();
    logWc("dashboard", "resolveWebviewView: shell painted synchronously");
    // Service start stays off the critical path; bootstrap is owned by the startup controller.
    void this.requestDashboardStartup("resolve-webview");
  }

  /** Route inventoried startup triggers through {@link DashboardStartupController} only. */
  private requestDashboardStartup(trigger: DashboardStartupTrigger): Promise<void> {
    return this.startupController.request(trigger);
  }

  /**
   * Overview bootstrap paint executed exclusively by the startup controller (T100843/T100844).
   * CLI-primary cold path via {@link resolveBootstrapSnapshot} — never waits on service health.
   * Throws on hard failure so the controller can enter `error`; soft kit-abort posts an
   * error message and throws so we do not falsely mark hydrated.
   */
  private async executeDashboardStartupBootstrap(): Promise<void> {
    const activeView = this.view;
    const webview = activeView?.webview;
    if (!activeView || !webview) {
      logWc("dashboard", "startup render skipped (stale webview before summary)");
      throw new DashboardStartupAbortedError("startup render skipped (stale webview before summary)");
    }
    let postedStartupError = false;
    try {
      const snapshot = await resolveBootstrapSnapshot({
        cache: this.lastDashboardSummaryData,
        store: this.dashboardStore,
        fetchCliBootstrap: () =>
          this.client.runForDashboardPaint(
            "dashboard-bootstrap-slices",
            { slices: ["overview", "queue"] },
            { bootstrap: true }
          ),
        fetchCliSummaryOverview: () =>
          this.runDashboardSummary({ projection: "overview" }, "startup overview") as Promise<
            DashboardSummaryCommandSuccess | Record<string, unknown>
          >,
        log: (message) => logWc("dashboard", message)
      });
      if (!this.view || this.view !== activeView || activeView.webview !== webview) {
        logWc("dashboard", "startup render result ignored (stale webview)");
        throw new DashboardStartupAbortedError("startup render result ignored (stale webview)");
      }
      if (!snapshot.ok) {
        let message = snapshot.message;
        if (snapshot.code === "extension-cli-timeout" || /timed out/i.test(message)) {
          message =
            "Dashboard overview timed out before JSON was returned. From a terminal, run: pnpm exec wk run dashboard-summary '{\"projection\":\"overview\"}'";
        }
        if (isKitRefreshRunAborted(snapshot)) {
          message =
            "Dashboard refresh was paused by another Workflow Cannon operation. Try again in a moment.";
          await webview.postMessage({
            type: "dashboardStartupError",
            message
          });
          postedStartupError = true;
          throw new Error(message);
        }
        await webview.postMessage({
          type: "dashboardStartupError",
          message
        });
        postedStartupError = true;
        throw new Error(message);
      }
      await this.applyBootstrapSnapshot(webview, snapshot);
      logWc(
        "dashboard",
        `startup diagnostic direct render applied via wcReplaceRoot provenance=${snapshot.provenance}`
      );
      // Hydrated + eager hydration are owned by DashboardStartupController callbacks.
      logWc("dashboard", "startup eager hydration scheduled");
    } catch (error) {
      if (error instanceof DashboardStartupAbortedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      logWc("dashboard", `startup diagnostic direct render failed: ${message}`);
      if (!postedStartupError) {
        try {
          await webview.postMessage({ type: "dashboardStartupError", message });
        } catch {
          // best-effort error surface
        }
      }
      throw error instanceof Error ? error : new Error(message);
    }
  }

  /**
   * Apply a resolved cold-bootstrap snapshot into session cache + store, then paint root.
   * Overview-minimal: Ideas/detail stay deferred for background hydration.
   */
  private async applyBootstrapSnapshot(
    webview: vscode.Webview,
    snapshot: Extract<BootstrapSnapshot, { ok: true }>
  ): Promise<void> {
    const prior = this.lastDashboardSummaryData ?? {};
    this.lastDashboardSummaryData = {
      ...prior,
      ...snapshot.data,
      dashboardProjection: "overview"
    };
    this.lastQueueContentFingerprint = computeQueueContentFingerprint(this.lastDashboardSummaryData);
    ingestPlanningMetaFromData(snapshot.data);
    this.ingestDashboardSummaryIntoStore(snapshot.data, "overview");
    // Opportunistic queue count fields from cold bootstrap — do not mark queue hydrated.
    if (
      typeof snapshot.data.readyQueueCount === "number" ||
      snapshot.data.readyImprovementsSummary ||
      snapshot.data.readyExecutionSummary
    ) {
      const queueDesc = DASHBOARD_SLICE_REGISTRY.find((entry) => entry.name === "queue");
      if (queueDesc) {
        this.dashboardStore.updateSlice(
          "queue",
          queueDesc.extractPayload(snapshot.data),
          {
            source: "cold-bootstrap-counts",
            sourceArgs: {},
            planningGeneration:
              typeof snapshot.data.planningGeneration === "number"
                ? snapshot.data.planningGeneration
                : null
          }
        );
      }
    }
    const raw: Record<string, unknown> = {
      ok: true,
      code: `bootstrap-${snapshot.provenance}`,
      data: this.lastDashboardSummaryData
    };
    const editorIntegration = await resolveEditorIntegrationState();
    const rootInner = renderDashboardRootInnerHtml(
      this.dashboardRenderPayload(raw),
      this.planningWizardPanel(),
      editorIntegration,
      undefined,
      null,
      {
        deferredSections: new Set<DashboardSectionId>([
          "status",
          "config",
          "cae",
          "phase-journal"
        ]),
        readModeBadge: this.readPath.getModeBadge()
      }
    );
    this.hydratedDashboardSections.clear();
    this.hydratedDashboardSections.add("overview");
    for (const section of DASHBOARD_SECTION_REGISTRY) {
      if (section.tabId === "planning" && section.refreshPolicy === "eager") {
        this.hydratedDashboardSections.add(section.id);
      }
    }
    for (const sectionId of ["queue", "status", "config", "cae", "phase-journal"] as const) {
      this.staleDashboardSections.add(sectionId);
    }
    await this.postReplaceRootHtml(webview, rootInner, `bootstrap-${snapshot.provenance}`);
  }

  private async postSectionPatch(
    sectionId: DashboardSectionId,
    html: string,
    state: DashboardSectionLoadState
  ): Promise<void> {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    await webview.postMessage({ type: "wcSectionPatch", sectionId, html, state });
  }

  private async postBannerPatch(summaryData: Record<string, unknown>): Promise<void> {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    try {
      const bannerHtml = renderWcDashboardBannerHtml(summaryData);
      await webview.postMessage({ type: "wcBannerPatch", html: bannerHtml });
    } catch {
      // banner patch is best-effort; never block the caller
    }
  }

  private sectionsForTabActivation(tabId: string): DashboardSectionId[] {
    return DASHBOARD_SECTION_REGISTRY.filter(
      (section) =>
        section.tabId === tabId &&
        section.refreshPolicy === "on-tab-activate" &&
        !this.hydratedDashboardSections.has(section.id)
    ).map((section) => section.id);
  }

  private async onDashboardTabActivated(tabId: string): Promise<void> {
    for (const sectionId of this.sectionsForTabActivation(tabId)) {
      await this.hydrateDashboardSection(sectionId);
    }
    if (tabId === "task-engine" || tabId === "overview") {
      await this.ensureQueueRollupsHydrated(this.refreshController.currentGeneration());
    } else if (tabId === "planning") {
      await this.ensurePlanningSectionsHydrated(this.refreshController.currentGeneration());
    } else if (tabId === "status" && this.staleDashboardSections.has("status")) {
      await this.ensureStatusHydrated(this.refreshController.currentGeneration());
    }
    const staleOnTab = DASHBOARD_SECTION_REGISTRY.filter(
      (section) =>
        section.tabId === tabId &&
        this.staleDashboardSections.has(section.id) &&
        section.id !== "queue" &&
        section.id !== "status"
    ).map((section) => section.id);
    if (staleOnTab.length > 0) {
      await this.patchDashboardSectionsFromSummary(staleOnTab, this.refreshController.currentGeneration(), {
        source: `tab:${tabId} stale sections`
      });
    }
    this.syncVisibleSectionsToPollers();
  }

  /**
   * First load paints overview quickly, then upgrades Tasks + Planning from one queue projection.
   * This avoids two concurrent `dashboard-summary {projection:"queue"}` reads and prevents the
   * overview stubs (empty ideas/plans/queue) from getting stuck until manual refresh.
   */
  private async ensureStartupEagerSectionsHydrated(): Promise<void> {
    if (this.startupEagerHydrationInFlight) {
      logWc("dashboard", "startup eager hydration coalesced with in-flight dashboard-summary");
      return this.startupEagerHydrationInFlight;
    }
    const run = this.ensureStartupEagerSectionsHydratedOnce().finally(() => {
      if (this.startupEagerHydrationInFlight === run) {
        this.startupEagerHydrationInFlight = undefined;
      }
    });
    this.startupEagerHydrationInFlight = run;
    return run;
  }

  private async ensureStartupEagerSectionsHydratedOnce(): Promise<void> {
    if (!this.view || !this.dashboardRootHydrated) {
      logWc("dashboard", "startup eager hydration deferred: root not hydrated");
      return;
    }
    const needsQueue = dashboardSummaryNeedsQueueRollupHydration(this.lastDashboardSummaryData);
    const needsPlanning = dashboardSummaryNeedsPlanningHydration(this.lastDashboardSummaryData);
    if (!needsQueue && !needsPlanning) {
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      logWc("dashboard", "startup eager hydration deferred: refresh paused or suppressed");
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    logWc("dashboard", "startup eager hydration: upgrading task and planning sections to queue projection");
    await this.patchDashboardSectionsFromSummary(
      ["overview", "queue", "phase-roster", "ideas", "plan-artifact"],
      undefined,
      {
        projection: "queue",
        preserveOnSummaryFailure: true,
        source: "startup eager hydration"
      }
    );
  }

  /** Upgrade queue (+ overview stat pills) from overview stub to queue rollups. */
  private async ensureQueueRollupsHydrated(updateSequence?: number): Promise<void> {
    if (this.queueRollupHydrationInFlight) {
      logWc("dashboard", "queue rollup hydration coalesced with in-flight dashboard-summary");
      return this.queueRollupHydrationInFlight;
    }
    const run = this.ensureQueueRollupsHydratedOnce(updateSequence).finally(() => {
      if (this.queueRollupHydrationInFlight === run) {
        this.queueRollupHydrationInFlight = undefined;
      }
    });
    this.queueRollupHydrationInFlight = run;
    return run;
  }

  /** Upgrade planning sections from overview stub (empty ideas) to queue projection. */
  private async ensurePlanningSectionsHydrated(updateSequence?: number): Promise<void> {
    if (this.planningHydrationInFlight) {
      logWc("dashboard", "planning hydration coalesced with in-flight dashboard-summary");
      return this.planningHydrationInFlight;
    }
    const run = this.ensurePlanningSectionsHydratedOnce(updateSequence).finally(() => {
      if (this.planningHydrationInFlight === run) {
        this.planningHydrationInFlight = undefined;
      }
    });
    this.planningHydrationInFlight = run;
    return run;
  }

  private async ensurePlanningSectionsHydratedOnce(updateSequence?: number): Promise<void> {
    if (!this.view || !this.dashboardRootHydrated) {
      logWc("dashboard", "planning hydration deferred: root not hydrated");
      return;
    }
    if (!dashboardSummaryNeedsPlanningHydration(this.lastDashboardSummaryData)) {
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      logWc("dashboard", "planning hydration deferred: refresh paused or suppressed");
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    logWc("dashboard", "ensurePlanningSectionsHydrated: upgrading planning sections to queue projection");
    const seq = updateSequence ?? this.refreshController.currentGeneration();
    await this.patchDashboardSectionsFromSummary(
      ["phase-roster", "ideas", "plan-artifact"],
      seq,
      {
        projection: "queue",
        preserveOnSummaryFailure: true,
        source: "tab:planning planning hydration"
      }
    );
  }

  private async ensureQueueRollupsHydratedOnce(updateSequence?: number): Promise<void> {
    if (!this.view) {
      return;
    }
    if (!this.dashboardRootHydrated) {
      logWc("dashboard", "queue rollup hydration deferred: root not hydrated");
      return;
    }
    if (!dashboardSummaryNeedsQueueRollupHydration(this.lastDashboardSummaryData)) {
      return;
    }
    if (this.activeDashboardTab !== "task-engine" && this.activeDashboardTab !== "overview") {
      logWc("dashboard", `queue rollup hydration deferred: tab ${this.activeDashboardTab} not visible`);
      this.staleDashboardSections.add("queue");
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      logWc("dashboard", "queue rollup hydration deferred: refresh paused or suppressed");
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    logWc("dashboard", "ensureQueueRollupsHydrated: upgrading overview stub to queue projection");
    const seq = updateSequence ?? this.refreshController.currentGeneration();
    await this.patchDashboardSectionsFromSummary(["queue", "overview"], seq, {
      projection: "queue",
      preserveOnSummaryFailure: true,
      source: this.activeDashboardTab === "task-engine" ? "tab:task-engine queue hydration" : "tab:overview queue hydration"
    });
  }

  private async runDashboardSummaryStatus(
    args: Record<string, unknown> = {},
    options?: { bootstrap?: boolean; source?: string }
  ): Promise<KitRunResult> {
    if (this.inFlightStatusHydration) {
      logWc("dashboard", "status hydration coalesced with in-flight dashboard-summary");
      return this.inFlightStatusHydration;
    }

    const bootstrap = options?.bootstrap ?? !this.dashboardRootHydrated;
    const usePaintLane = this.shouldUseDashboardPaintLane();
    const source = options?.source ?? "tab:status status hydration";
    logWc("dashboard", "status hydration start");
    logWc(
      "dashboard",
      `dashboard-summary source=${source} projection=status lane=${usePaintLane ? "paint" : "refresh"} bootstrap=${String(bootstrap)} rootHydrated=${String(this.dashboardRootHydrated)}`
    );
    const runPromise = usePaintLane
      ? this.originalRunForPaint("dashboard-summary", { ...args, projection: "status" }, { bootstrap })
      : this.originalRun("dashboard-summary", { ...args, projection: "status" });

    this.inFlightStatusHydration = (async () => {
      try {
        const res = await runPromise;
        if (res.ok) {
          logWc("dashboard", "hydration success");
        } else {
          logWc(
            "dashboard",
            `hydration timeout/failure: ${res.message ?? res.code ?? "unknown error"}`
          );
        }
        return res;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logWc("dashboard", `hydration timeout/failure: ${msg}`);
        throw error;
      }
    })();

    try {
      return await this.inFlightStatusHydration;
    } finally {
      this.inFlightStatusHydration = null;
    }
  }

  private async ensureStatusHydrated(updateSequence?: number): Promise<void> {
    if (!this.dashboardRootHydrated) {
      logWc("dashboard", "hydration paused/deferred: root not hydrated");
      return;
    }
    if (this.activeDashboardTab !== "status") {
      logWc("dashboard", "status hydration deferred: status tab not visible");
      this.staleDashboardSections.add("status");
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      logWc("dashboard", "hydration paused/deferred: refresh paused or suppressed");
      this.refreshController.markDeferredRefreshNeeded();
      await this.postSectionPatch("status", "", "stale");
      return;
    }

    const seq = updateSequence ?? this.refreshController.currentGeneration();
    try {
      const raw = await this.runDashboardSummaryStatus({}, { source: "tab:status status hydration" });
      if (raw.ok === true && raw.data && typeof raw.data === "object") {
        const prior = this.lastDashboardSummaryData ?? {};
        this.lastDashboardSummaryData = mergeDashboardProjectionIntoSummary(
          prior,
          "status",
          raw.data as Record<string, unknown>
        );
        ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
        this.ingestDashboardSummaryIntoStore(raw.data as Record<string, unknown>, "status");

        const statusSlice = this.dashboardStore.getSlice("status");
        this.hydratedDashboardSections.add("status");
        await this.patchDashboardSectionFromStore("status", statusSlice);
      } else {
        const msg = String(raw.message ?? raw.code ?? "timeout");
        await this.postSectionPatch(
          "status",
          '<p class="muted wc-dash-section-error" role="status">' + escapeHtml(msg) + "</p>",
          "error"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.postSectionPatch(
        "status",
        '<p class="muted wc-dash-section-error" role="status">' + escapeHtml(message) + "</p>",
        "error"
      );
    }
  }

  private async hydrateDashboardSection(sectionId: DashboardSectionId): Promise<void> {
    if (this.hydratedDashboardSections.has(sectionId)) {
      return;
    }
    await this.postSectionPatch(sectionId, "", "loading");
    try {
      let html = "";
      if (sectionId === "status") {
        await this.ensureStatusHydrated(this.refreshController.currentGeneration());
        return;
      } else if (sectionId === "cae") {
        const caeSummary = await this.client.run("cae-authoring-summary", { schemaVersion: 1 });
        if (isKitRefreshRunAborted(caeSummary as Record<string, unknown>)) {
          return;
        }
        const panel = renderGuidanceAuthoringPanelInnerHtml(caeSummary, { host: "dashboard" });
        this.lastEmbeddedCaePanelHtml = panel;
        html = renderDashboardCaeSectionInnerHtml(panel);
      } else if (sectionId === "phase-journal") {
        const summaryData = this.lastDashboardSummaryData;
        if (!summaryData || !this.summaryHasCanonicalWorkspacePhase(summaryData)) {
          html = renderDashboardPhaseJournalSectionInnerHtml(null, summaryData?.phaseJournalStats);
        } else {
          const [lp, gpc] = (await Promise.all([
            this.client.run("list-phase-notes", { ...expectedPlanningGenerationArgs() }),
            this.client.run("get-phase-context", { ...expectedPlanningGenerationArgs() })
          ])) as [PhaseJournalKitPayload & Record<string, unknown>, PhaseJournalKitPayload & Record<string, unknown>];
          if (
            isKitRefreshRunAborted(lp as Record<string, unknown>) ||
            isKitRefreshRunAborted(gpc as Record<string, unknown>)
          ) {
            return;
          }
          ingestPlanningMetaFromData(lp.data as Record<string, unknown> | undefined);
          ingestPlanningMetaFromData(gpc.data as Record<string, unknown> | undefined);
          const pastFromSummary = summaryData.pastPhaseNotes;
          const pastPhaseNotes: DashboardPhaseJournalBundle["pastPhaseNotes"] = Array.isArray(pastFromSummary)
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
          html = renderDashboardPhaseJournalSectionInnerHtml(
            {
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
            },
            summaryData.phaseJournalStats
          );
        }
      } else if (sectionId === "config") {
        html = renderConfigPanelShellHtml();
      } else {
        return;
      }
      await this.postSectionPatch(sectionId, html, "ready");
      this.hydratedDashboardSections.add(sectionId);
      if (sectionId === "config") {
        await this.refreshDashboardConfigTab(this.view!.webview);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load section.";
      await this.postSectionPatch(
        sectionId,
        '<p class="muted wc-dash-section-error" role="status">' + escapeHtml(message) + "</p>",
        "error"
      );
    }
  }

  private async markDashboardSectionStale(sectionId: DashboardSectionId): Promise<void> {
    if (!this.hydratedDashboardSections.has(sectionId)) {
      return;
    }
    this.staleDashboardSections.add(sectionId);
    await this.postSectionPatch(sectionId, "", "stale");
  }

  private async applyDashboardMutationInvalidation(
    kind: DashboardMutationKind | readonly DashboardSectionId[]
  ): Promise<void> {
    const sectionIds =
      typeof kind === "string" ? dashboardSectionsForMutation(kind) : kind;
    if (typeof kind === "string") {
      for (const sliceName of dashboardSliceNamesForMutation(kind)) {
        this.dashboardStore.markStale(sliceName, `mutation:${kind}`);
      }
    }
    this.readPath.pause();
    const toStale: DashboardSectionId[] = [];
    const toRefresh: DashboardSectionId[] = [];
    for (const sectionId of sectionIds) {
      if (!this.hydratedDashboardSections.has(sectionId)) {
        continue;
      }
      const tabId = DASHBOARD_SECTION_REGISTRY.find((s) => s.id === sectionId)?.tabId ?? "";
      if (tabId === this.activeDashboardTab) {
        toRefresh.push(sectionId);
      } else {
        toStale.push(sectionId);
      }
    }
    for (const sectionId of toStale) {
      await this.markDashboardSectionStale(sectionId);
    }
    try {
      if (toRefresh.length > 0) {
        await this.patchDashboardSectionsFromSummary(toRefresh);
      }
      if (typeof kind === "string") {
        await this.readPath.refreshSlicesNow(dashboardSliceNamesForMutation(kind));
      }
    } finally {
      this.readPath.resume();
    }
  }

  private async fetchPhaseJournalBundleForRender(
    summaryData: Record<string, unknown>
  ): Promise<DashboardPhaseJournalBundle | undefined> {
    if (!this.summaryHasCanonicalWorkspacePhase(summaryData)) {
      return undefined;
    }
    const [lp, gpc] = (await Promise.all([
      this.client.run("list-phase-notes", { ...expectedPlanningGenerationArgs() }),
      this.client.run("get-phase-context", { ...expectedPlanningGenerationArgs() })
    ])) as [
      PhaseJournalKitPayload & Record<string, unknown>,
      PhaseJournalKitPayload & Record<string, unknown>
    ];
    if (
      isKitRefreshRunAborted(lp as Record<string, unknown>) ||
      isKitRefreshRunAborted(gpc as Record<string, unknown>)
    ) {
      return undefined;
    }
    ingestPlanningMetaFromData(lp.data as Record<string, unknown> | undefined);
    ingestPlanningMetaFromData(gpc.data as Record<string, unknown> | undefined);
    const pastFromSummary = summaryData.pastPhaseNotes;
    const pastPhaseNotes: DashboardPhaseJournalBundle["pastPhaseNotes"] = Array.isArray(pastFromSummary)
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
    return {
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
  }

  private async patchDashboardSectionsFromSummary(
    sectionIds: readonly DashboardSectionId[],
    updateSequence?: number,
    options?: {
      light?: boolean;
      projection?: "full" | "queue" | "overview" | "status";
      /** Queue upgrade during startup — bypass refresh lane even after root hydrated. */
      forcePaintLane?: boolean;
      /** Deferred/background upgrades should keep the existing dashboard on summary failure. */
      preserveOnSummaryFailure?: boolean;
      /** Trace source for dashboard-summary reads. */
      source?: string;
      /** Render from `lastDashboardSummaryData` without a dashboard-summary CLI round-trip. */
      cachedSummaryOnly?: boolean;
    }
  ): Promise<void> {
    const activeView = this.view;
    if (!activeView || sectionIds.length === 0) {
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    let sectionsToPatch: DashboardSectionId[] = [...sectionIds];
    const needsPhaseJournal = sectionsToPatch.includes("phase-journal");
    const needsCae = sectionsToPatch.includes("cae");
    const summaryProjection =
      options?.projection ?? dashboardSummaryProjectionForSectionPatch(sectionsToPatch);
    const summarySource =
      options?.source ?? (options?.light === true ? "kit-state refresh" : "manual refresh");
    const patchTraceId = `patch:${sectionsToPatch.join("+")}:${summaryProjection}`;
    let patchStepAt = Date.now();
    logWc("dashboard", `drawerSubmit trace id=${patchTraceId} step=patch-begin source=${summarySource}`);
    let raw: DashboardSummaryCommandSuccess | Record<string, unknown>;
    try {
      if (options?.cachedSummaryOnly === true) {
        const cached = this.lastDashboardSummaryData;
        if (!cached) {
          logWc("dashboard", "patchDashboardSectionsFromSummary: cached summary missing");
          return;
        }
        if (dashboardSummaryNeedsQueueRollupHydration(cached)) {
          logWc(
            "dashboard",
            "patchDashboardSectionsFromSummary: cached summary still on overview stub; skipping cache-only patch"
          );
          return;
        }
        raw = { ok: true, data: cached, code: "dashboard-summary-cached" };
        patchStepAt = logWcDrawerSubmitStep(
          patchTraceId,
          "dashboard-summary-cached",
          patchStepAt,
          `projection=${summaryProjection}`
        );
      } else {
        const summaryArgs = {
          projection: summaryProjection
        };
        if (options?.forcePaintLane === true) {
          logWc(
            "dashboard",
            `dashboard-summary source=${summarySource} projection=${summaryProjection} lane=paint bootstrap=${String(!this.dashboardRootHydrated)} rootHydrated=${String(this.dashboardRootHydrated)}`
          );
        }
        raw = (options?.forcePaintLane === true
          ? ((await this.client.runForDashboardPaint(
              "dashboard-summary",
              summaryArgs,
              { bootstrap: !this.dashboardRootHydrated }
            )) as DashboardSummaryCommandSuccess | Record<string, unknown>)
          : ((await this.runDashboardSummary(summaryArgs, summarySource)) as
              | DashboardSummaryCommandSuccess
              | Record<string, unknown>));
        patchStepAt = logWcDrawerSubmitStep(
          patchTraceId,
          "dashboard-summary",
          patchStepAt,
          `ok=${String((raw as { ok?: boolean }).ok)} code=${String((raw as { code?: string }).code ?? "")}`
        );
      }
      if (isKitRefreshRunAborted(raw as Record<string, unknown>)) {
        logWc("dashboard", "patchDashboardSectionsFromSummary aborted (refresh paused or preempted)");
        return;
      }
    } catch (e) {
      logWc(
        "dashboard",
        `patchDashboardSectionsFromSummary failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      logWc("dashboard", "patchDashboardSectionsFromSummary aborted (refresh paused after summary)");
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    if (
      typeof updateSequence === "number" &&
      this.isPushUpdateStale(updateSequence, activeView)
    ) {
      return;
    }
    if (raw.ok !== true && options?.preserveOnSummaryFailure === true) {
      logWc(
        "dashboard",
        `patchDashboardSectionsFromSummary preserved existing sections after summary failure code=${String(raw.code ?? "")}`
      );
      return;
    }
    let phaseJournal: DashboardPhaseJournalBundle | undefined;
    let embeddedCaePanelHtml: string | null = this.lastEmbeddedCaePanelHtml;
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      const summaryData = raw.data as Record<string, unknown>;
      const prior = this.lastDashboardSummaryData ?? {};
      const ingestProjection =
        summaryProjection === "full" ? "full" : summaryProjection === "overview" ? "overview" : summaryProjection;
      if (options?.cachedSummaryOnly !== true) {
        this.lastDashboardSummaryData = mergeDashboardProjectionIntoSummary(
          prior,
          ingestProjection,
          summaryData
        );
        ingestPlanningMetaFromData(summaryData);
        this.ingestDashboardSummaryIntoStore(summaryData, ingestProjection === "full" ? "overview" : ingestProjection);
      }
      const contentFp = computeQueueContentFingerprint(summaryData);
      if (
        options?.light === true &&
        sectionsToPatch.includes("queue") &&
        this.lastQueueContentFingerprint !== null &&
        contentFp === this.lastQueueContentFingerprint
      ) {
        sectionsToPatch = sectionsToPatch.filter((id) => id !== "queue");
        logWc("dashboard", "patchDashboardSectionsFromSummary: skipped queue (content unchanged)");
      }
      try {
        if (needsPhaseJournal) {
          phaseJournal = await this.fetchPhaseJournalBundleForRender(summaryData);
        }
        if (needsCae) {
          const caeSummary = await this.client.run("cae-authoring-summary", { schemaVersion: 1 });
          if (!isKitRefreshRunAborted(caeSummary as Record<string, unknown>)) {
            embeddedCaePanelHtml = renderGuidanceAuthoringPanelInnerHtml(caeSummary, { host: "dashboard" });
            this.lastEmbeddedCaePanelHtml = embeddedCaePanelHtml;
          }
        }
      } catch {
        /* section patch falls back to summary-only slices */
      }
    }
    if (sectionsToPatch.length === 0) {
      logWcDrawerSubmitStep(patchTraceId, "patch-skipped", patchStepAt, "no sections after fingerprint");
      return;
    }
    let renderedBytes = 0;
    let editorIntegration: Awaited<ReturnType<typeof resolveEditorIntegrationState>>;
    const mcpStatus = this.dashboardRenderRootOptions().mcpStatus;
    try {
      editorIntegration = await resolveEditorIntegrationState();
    } catch (e) {
      logWc(
        "dashboard",
        `patchDashboardSectionsFromSummary render failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }
    for (const sectionId of sectionsToPatch) {
      const inner = renderDashboardSectionInnerHtml(sectionId, this.dashboardRenderPayload(raw), {
        ...this.dashboardRenderSectionOptions({
          editorIntegration,
          phaseJournal,
          embeddedCaePanelHtml
        })
      });
      if (inner == null) {
        continue;
      }
      renderedBytes += inner.length;
      await this.postSectionPatch(sectionId, inner, "ready");
      this.hydratedDashboardSections.add(sectionId);
      this.staleDashboardSections.delete(sectionId);
      if (sectionId === "config") {
        await this.refreshDashboardConfigTab(activeView.webview);
      }
    }
    if (raw.ok === true && raw.data && typeof raw.data === "object" && sectionsToPatch.includes("queue")) {
      const summaryData = raw.data as Record<string, unknown>;
      this.lastQueueContentFingerprint = computeQueueContentFingerprint(summaryData);
      await this.postTaskEngineTabBadgesFromSummary(summaryData);
    }
    if (raw.ok === true && raw.data && typeof raw.data === "object" && sectionsToPatch.includes("overview")) {
      await this.postBannerPatch(raw.data as Record<string, unknown>);
    }
    logWcDrawerSubmitStep(
      patchTraceId,
      "patch-done",
      patchStepAt,
      `sections=${sectionsToPatch.join(",")} htmlBytes≈${renderedBytes}`
    );
  }

  private async tryApplyQueueTaskPhaseTargetedPatch(args: {
    taskId: string;
    task: Record<string, unknown> | undefined;
    fromPhaseKey: string | null;
    toPhaseKey: string | null;
    traceId?: string;
  }): Promise<boolean> {
    const data = this.lastDashboardSummaryData;
    const webview = this.view?.webview;
    if (!data || !webview) {
      return false;
    }
    if (!this.hydratedDashboardSections.has("queue")) {
      return false;
    }
    if (!args.task || typeof args.task !== "object") {
      return false;
    }
    const placement = resolveQueuePlacementFromTask(args.task);
    if (!placement) {
      return false;
    }
    const patchArgs: QueuePhaseMovePatchArgs = {
      taskId: args.taskId,
      task: args.task,
      fromPhaseKey: args.fromPhaseKey,
      toPhaseKey: args.toPhaseKey
    };
    const payload = applyQueuePhasePatchToSummaryCache(data, placement, patchArgs);
    if (!payload) {
      return false;
    }
    this.lastQueueContentFingerprint = queueContentFingerprintAfterPatch(data);
    await postQueuePhaseMovePatch(webview, payload);
    await this.postTaskEngineTabBadgesFromSummary(data);
    if (args.traceId) {
      logWc(
        "dashboard",
        `drawerSubmit trace id=${args.traceId} step=queue-patch-posted category=${placement.category}`
      );
    }
    return true;
  }

  private async tryApplyQueueAcceptProposedTargetedPatch(args: {
    taskId: string;
    task: Record<string, unknown>;
    fromPlacement: QueuePhasePatchPlacement;
    fromPhaseKey: string | null;
    toPhaseKey: string;
    traceId?: string;
  }): Promise<boolean> {
    const data = this.lastDashboardSummaryData;
    const webview = this.view?.webview;
    if (!data || !webview || !this.hydratedDashboardSections.has("queue")) {
      return false;
    }
    const toPlacement = resolveQueuePlacementFromTask(args.task);
    if (!toPlacement) {
      return false;
    }
    const patchArgs: QueuePhaseMovePatchArgs = {
      taskId: args.taskId,
      task: args.task,
      fromPhaseKey: args.fromPhaseKey,
      toPhaseKey: args.toPhaseKey
    };
    const payload = applyQueueAcceptProposedPatchToSummaryCache(
      data,
      args.fromPlacement,
      toPlacement,
      patchArgs
    );
    if (!payload) {
      return false;
    }
    this.lastQueueContentFingerprint = queueContentFingerprintAfterPatch(data);
    await postQueueCategoryMovePatch(webview, payload);
    await this.postTaskEngineTabBadgesFromSummary(data);
    if (args.traceId) {
      logWc(
        "dashboard",
        `drawerSubmit trace id=${args.traceId} step=queue-accept-patch-posted from=${args.fromPlacement.category} to=${toPlacement.category}`
      );
    }
    return true;
  }

  private async tryApplyQueueTransitionTargetedPatch(args: {
    taskId: string;
    action: string;
    transitionData?: Record<string, unknown>;
  }): Promise<boolean> {
    const data = this.lastDashboardSummaryData;
    const webview = this.view?.webview;
    if (!data || !webview || !this.hydratedDashboardSections.has("queue")) {
      return false;
    }
    if (args.action === "reject") {
      const snap = lookupProposedTaskSnapshot(data, args.taskId);
      if (!snap) {
        return false;
      }
      const payload = applyQueueTaskRemovalPatchToSummaryCache(
        data,
        snap.placement,
        args.taskId,
        snap.phaseKey
      );
      if (!payload) {
        return false;
      }
      this.lastQueueContentFingerprint = queueContentFingerprintAfterPatch(data);
      await postQueueTaskRemovalPatch(webview, payload);
      await this.postTaskEngineTabBadgesFromSummary(data);
      logWc("dashboard", `queue transition patch posted action=${args.action} taskId=${args.taskId}`);
      return true;
    }
    if (args.action === "resume_ready" || args.action === "resume_work") {
      const payload = applyQueueHumanGateResumePatchToSummaryCache(
        data,
        args.taskId,
        args.action
      );
      if (!payload) {
        return false;
      }
      this.lastQueueContentFingerprint = queueContentFingerprintAfterPatch(data);
      await postQueueHumanGateResumePatch(webview, payload);
      await this.postTaskEngineTabBadgesFromSummary(data);
      logWc(
        "dashboard",
        `queue human-gate patch posted action=${args.action} taskId=${args.taskId} humanGateCount=${String(payload.humanGateCount)}`
      );
      return true;
    }
    return false;
  }

  private async postTaskEngineTabBadgesFromSummary(summaryData: Record<string, unknown>): Promise<void> {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    const ris = (summaryData.readyImprovementsSummary as Record<string, unknown> | undefined) ?? {};
    const res = (summaryData.readyExecutionSummary as Record<string, unknown> | undefined) ?? {};
    const readyMerged = mergeReadyQueueRollupSummaries(ris, res);
    const blockedSummary = summaryData.blockedSummary as Record<string, unknown> | undefined;
    const blockedCount =
      typeof blockedSummary?.count === "number" ? (blockedSummary.count as number) : 0;
    const humanGatesSummary = summaryData.humanGatesSummary as Record<string, unknown> | undefined;
    const humanGateCount =
      typeof humanGatesSummary?.count === "number" ? (humanGatesSummary.count as number) : 0;
    await webview.postMessage({
      type: "wcUpdateTabBadges",
      readyCount: readyMerged.count,
      blockedCount,
      humanGateCount
    });
  }

  private async executeLightSectionRefresh(updateSequence: number): Promise<void> {
    const activeView = this.view;
    if (!activeView) {
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    const hydrated = DASHBOARD_SECTION_REGISTRY.map((s) => s.id).filter((id) =>
      this.hydratedDashboardSections.has(id)
    );
    if (hydrated.length === 0) {
      return;
    }
    const toRefresh = hydrated.filter(
      (id) => (DASHBOARD_SECTION_REGISTRY.find((s) => s.id === id)?.tabId ?? "") === this.activeDashboardTab
    );
    const toStale = hydrated.filter((id) => !toRefresh.includes(id));
    for (const sectionId of toStale) {
      await this.markDashboardSectionStale(sectionId);
    }
    if (toRefresh.length > 0) {
      await this.patchDashboardSectionsFromSummary(toRefresh, updateSequence, { light: true });
    }
    logWc(
      "dashboard",
      `executeLightSectionRefresh refreshed=${toRefresh.join(",") || "none"} stale=${toStale.join(",") || "none"} tab=${this.activeDashboardTab}`
    );
  }

  refresh(): void {
    if (this.refreshController.isSuppressed()) {
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    void this.refreshController.pushNow();
  }

  private async pushUpdate(options?: {
    light?: boolean;
    projection?: "full" | "overview";
    skipHeavyFetches?: boolean;
    source?: string;
  }): Promise<void> {
    this.pendingPushUpdateOptions = options;
    await this.refreshController.pushNow(options);
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
    logWc("dashboard", "dashboard-summary source=planning-generation refresh projection=overview lane=refresh");
    const dash = await this.client.run("dashboard-summary", { projection: "overview" });
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
        "Legacy planning interview finished. No wishlist row was written yet — prefer Ideas > Plan this / PlanArtifact for the primary flow, and treat build-plan persistence as a compatibility path."
      );
      return;
    }
  }

  private async loadQueueBucketRows(
    category: DashboardQueueBucketCategory,
    phaseKey: string,
    cursor?: string
  ): Promise<void> {
    const pk = phaseKey.trim();
    const phaseKeyArg = pk.length > 0 ? pk : "__no_phase__";
    const append = typeof cursor === "string" && cursor.trim().length > 0;
    try {
      let data: Record<string, unknown> | undefined;
      if (category === "completed" || category === "cancelled") {
        const raw = await this.client.run(
          "dashboard-terminal-rows",
          {
            status: category,
            phaseKey: phaseKeyArg,
            limit: lazyTerminalBucketListLimit(),
            cursor
          }
        );
        data = raw && typeof raw === "object" && "data" in raw
          ? (raw as { data?: Record<string, unknown> }).data
          : undefined;
      } else {
        const raw = await this.client.run(
          "list-tasks",
          buildListTasksArgsForQueueBucket(category, phaseKeyArg, lazyTerminalBucketListLimit(), cursor)
        );
        data = raw && typeof raw === "object" && "data" in raw
          ? (raw as { data?: Record<string, unknown> }).data
          : undefined;
      }
      const tasksRaw =
        data && Array.isArray(data.tasks) ? (data.tasks as unknown[]) : [];
      const tasks = filterTasksForQueueBucketCategory(category, tasksRaw);
      const nextCursor =
        data && typeof data.nextCursor === "string" ? data.nextCursor : null;
      const html = renderQueueBucketRowsHtml(category, tasks, { nextCursor });
      await this.view?.webview.postMessage({
        type: "wcQueueBucketRowsHtml",
        category,
        phaseKey: pk,
        html,
        append
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load tasks.";
      await this.view?.webview.postMessage({
        type: "wcQueueBucketRowsHtml",
        category,
        phaseKey: pk,
        html:
          '<p class="muted wc-lazy-bucket-hint" role="status">' + escapeHtml(message) + "</p>",
        append: false
      });
    }
  }

  /** @deprecated — use {@link loadQueueBucketRows} */
  private async loadLazyTerminalBucket(
    phaseKey: string,
    terminalStatus: "completed" | "cancelled"
  ): Promise<void> {
    await this.loadQueueBucketRows(terminalStatus, phaseKey);
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
    await this.postWcDrawerOpen(html);
  }

  /** Update a phase roster Deliverables value via upsert-phase-catalog-entry with one mismatch retry. */
  private phaseHasAbandonableWork(delivery: Record<string, unknown> | null | undefined): boolean {
    if (!delivery || typeof delivery !== "object") {
      return false;
    }
    const queue = delivery.queue as Record<string, unknown> | undefined;
    const segments = delivery.segments as Record<string, unknown> | undefined;
    const ready = typeof queue?.ready === "number" ? queue.ready : 0;
    const inProgress = typeof queue?.inProgress === "number" ? queue.inProgress : 0;
    const segInProgress = typeof segments?.inProgress === "number" ? segments.inProgress : 0;
    return ready + inProgress > 0 || segInProgress > 0;
  }

  private parseLeadingPhaseDigits(raw: string): string {
    const m = raw.trim().match(/^(\d+)/);
    return m ? m[1]! : raw.trim();
  }

  /** Set workspace current phase from Phase Roster Start (set-current-phase). */
  private async onStartPhaseFromRoster(phaseKey: string): Promise<void> {
    const data = this.lastDashboardSummaryData;
    const ws =
      data?.workspaceStatus && typeof data.workspaceStatus === "object"
        ? (data.workspaceStatus as Record<string, unknown>)
        : null;
    const currentRaw = ws?.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
    const targetKey = this.parseLeadingPhaseDigits(phaseKey);
    const currentKey = currentRaw.length > 0 ? this.parseLeadingPhaseDigits(currentRaw) : "";

    if (targetKey.length === 0) {
      return;
    }
    if (currentKey.length > 0 && currentKey === targetKey) {
      return;
    }

    const delivery = data?.currentPhaseDelivery as Record<string, unknown> | null | undefined;
    const abandoningActiveWork = currentKey.length > 0 && this.phaseHasAbandonableWork(delivery);

    if (abandoningActiveWork) {
      const pick = await vscode.window.showWarningMessage(
        `Switch from Phase ${currentKey} to Phase ${targetKey}? Tasks still in progress stay on Phase ${currentKey} — only switch if you intend to pause that work.`,
        { modal: true },
        "Switch phase"
      );
      if (pick !== "Switch phase") {
        return;
      }
    } else if (currentKey.length > 0) {
      const pick = await vscode.window.showWarningMessage(
        `Set Phase ${targetKey} as your current phase?`,
        { modal: true },
        "Start phase"
      );
      if (pick !== "Start phase") {
        return;
      }
    } else {
      const pick = await vscode.window.showInformationMessage(
        `Start Phase ${targetKey} as your current phase?`,
        { modal: true },
        "Start phase"
      );
      if (pick !== "Start phase") {
        return;
      }
    }

    const kickoffOut = await this.client.run("phase-kickoff-readiness", {
      phaseKey: targetKey,
      includeValidationPlans: false
    });
    if (kickoffOut.ok !== true) {
      await vscode.window.showErrorMessage(
        `Phase kickoff audit failed: ${String(kickoffOut.message ?? kickoffOut.code ?? "unknown error")}`
      );
      return;
    }
    const kickoffData = kickoffOut.data as Record<string, unknown> | undefined;
    const findings = Array.isArray(kickoffData?.findings)
      ? (kickoffData!.findings as Array<Record<string, unknown>>)
      : [];
    const enforcementMode =
      kickoffData?.enforcementMode === "enforce" || kickoffData?.enforcementMode === "advisory"
        ? kickoffData.enforcementMode
        : "off";
    const hasBlock = findings.some((f) => f.severity === "block");
    if (enforcementMode === "enforce" && hasBlock) {
      const summary = findings
        .filter((f) => f.severity === "block")
        .slice(0, 2)
        .map((f) => String(f.message ?? f.code ?? "block"))
        .join("; ");
      const pick = await vscode.window.showWarningMessage(
        `Phase ${targetKey} kickoff blocked${summary.length > 0 ? `: ${summary}` : ""}`,
        { modal: true },
        "Open Queue",
        "Cancel"
      );
      if (pick === "Open Queue") {
        await this.view?.webview.postMessage({ type: "wcOpenQueueForPhase", phaseKey: targetKey });
      }
      return;
    }
    if (enforcementMode === "advisory" && findings.length > 0) {
      const pick = await vscode.window.showInformationMessage(
        `Kickoff audit found ${findings.length} finding(s) for Phase ${targetKey}. Continue anyway?`,
        { modal: true },
        "Continue anyway",
        "Cancel"
      );
      if (pick !== "Continue anyway") {
        return;
      }
    }

    this.beginDashboardMutationRefreshHold();
    try {
      const statusOut = await this.client.run("phase-status", {});
      if (statusOut.ok !== true) {
        await vscode.window.showErrorMessage(
          `Could not read workspace phase status: ${String(statusOut.message ?? statusOut.code ?? "unknown error")}`
        );
        return;
      }
      const statusData = statusOut.data as Record<string, unknown> | undefined;
      const wsStatus = statusData?.workspaceStatus as Record<string, unknown> | undefined;
      const revision = wsStatus?.workspaceRevision;
      if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
        await vscode.window.showErrorMessage("Could not confirm workspace state. Refresh the dashboard and try again.");
        return;
      }

      const nextFromWs =
        ws?.nextKitPhase != null ? this.parseLeadingPhaseDigits(String(ws.nextKitPhase)) : "";
      const targetOrd = Number.parseInt(targetKey, 10);
      const nextKey =
        nextFromWs.length > 0 && Number.isFinite(Number.parseInt(nextFromWs, 10))
          ? nextFromWs
          : Number.isFinite(targetOrd)
            ? String(targetOrd + 1)
            : targetKey;

      const out = await this.client.run("set-current-phase", {
        currentKitPhase: targetKey,
        nextKitPhase: nextKey,
        activeFocus: `Phase ${targetKey} — delivery in progress`,
        blockers: [],
        pendingDecisions: [],
        nextAgentActions: ["Open Queue tab and pick up ready work for this phase"],
        expectedWorkspaceRevision: revision,
        clientMutationId: `dashboard-roster-start-${targetKey}-${Date.now().toString(36)}`,
        actor: "cursor-dashboard"
      });

      if (out.ok !== true) {
        await vscode.window.showErrorMessage(
          `Could not switch phase: ${String(out.message ?? out.code ?? "unknown error")}`
        );
        return;
      }

      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
      const outData = out.data as Record<string, unknown> | undefined;
      const wsFromKit = outData?.workspaceStatus;
      if (wsFromKit && typeof wsFromKit === "object" && this.lastDashboardSummaryData) {
        const prior = this.lastDashboardSummaryData;
        const priorWs =
          prior.workspaceStatus && typeof prior.workspaceStatus === "object"
            ? (prior.workspaceStatus as Record<string, unknown>)
            : {};
        this.lastDashboardSummaryData = {
          ...prior,
          workspaceStatus: { ...priorWs, ...(wsFromKit as Record<string, unknown>) }
        };
        const phaseSlice = prior.systemStatus as Record<string, unknown> | undefined;
        if (phaseSlice?.phase && typeof phaseSlice.phase === "object") {
          const phase = phaseSlice.phase as Record<string, unknown>;
          this.lastDashboardSummaryData.systemStatus = {
            ...phaseSlice,
            phase: {
              ...phase,
              currentKitPhase: targetKey,
              nextKitPhase: nextKey
            }
          };
        }
      }
    } finally {
      this.endDashboardMutationRefreshHold();
    }
    await this.view?.webview.postMessage({ type: "wcReleaseRefreshBlock" });
    await this.applyDashboardMutationInvalidation("workspace-wide");
    await this.pushUpdate({
      projection: "overview",
      skipHeavyFetches: false,
      light: false,
      source: "user:phase-roster start"
    });
    await vscode.window.showInformationMessage(`Workspace phase set to ${targetKey}.`);
  }

  /** Clear workspace current phase after delivery closeout (update-workspace-status). */
  private async onMarkPhaseComplete(phaseKey: string): Promise<void> {
    const data = this.lastDashboardSummaryData;
    const ws =
      data?.workspaceStatus && typeof data.workspaceStatus === "object"
        ? (data.workspaceStatus as Record<string, unknown>)
        : null;
    const currentRaw = ws?.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
    const currentKey = currentRaw.length > 0 ? this.parseLeadingPhaseDigits(currentRaw) : "";
    const targetKey = this.parseLeadingPhaseDigits(phaseKey);

    if (targetKey.length === 0 || currentKey.length === 0) {
      return;
    }
    if (currentKey !== targetKey) {
      await vscode.window.showWarningMessage(
        `Current phase is ${currentKey}, not ${targetKey}. Refresh the dashboard and try again.`
      );
      return;
    }

    const delivery = data?.currentPhaseDelivery as Record<string, unknown> | null | undefined;
    const closeoutPassed = delivery?.closeoutPassed === true;
    const remaining =
      typeof delivery?.remainingCount === "number" ? delivery.remainingCount : Number.MAX_SAFE_INTEGER;
    const humanGatesSummary = data?.humanGatesSummary as Record<string, unknown> | undefined;
    const humanGateCount =
      typeof humanGatesSummary?.count === "number" ? humanGatesSummary.count : 0;
    const evidenceViolations =
      typeof delivery?.deliveryEvidenceViolationCount === "number"
        ? delivery.deliveryEvidenceViolationCount
        : 0;

    if (!closeoutPassed || remaining > 0 || humanGateCount > 0 || evidenceViolations > 0) {
      await vscode.window.showWarningMessage(
        "Mark Phase Complete unlocks when all delivery tasks are finished, human review is clear, and delivery evidence is recorded."
      );
      return;
    }

    const nextFromWs =
      ws?.nextKitPhase != null ? this.parseLeadingPhaseDigits(String(ws.nextKitPhase)) : "";
    const nextHint =
      nextFromWs.length > 0 && nextFromWs !== targetKey ? ` Phase ${nextFromWs} stays queued as next.` : "";

    const pick = await vscode.window.showWarningMessage(
      `Mark Phase ${targetKey} complete? This clears the active workspace phase.${nextHint}`,
      { modal: true },
      "Mark complete"
    );
    if (pick !== "Mark complete") {
      return;
    }

    this.setDashboardUiInteraction("mark-phase-complete", true);
    const webview = this.view?.webview;
    await webview?.postMessage({ type: "wcMarkPhaseBusy", active: true });
    await webview?.postMessage({ type: "wcHidePhaseCards" });

    this.beginDashboardMutationRefreshHold();
    try {
      const statusOut = await this.client.run("phase-status", {});
      if (statusOut.ok !== true) {
        await webview?.postMessage({ type: "wcMarkPhaseBusy", active: false });
        this.setDashboardUiInteraction("mark-phase-complete", false);
        await vscode.window.showErrorMessage(
          `Could not read workspace phase status: ${String(statusOut.message ?? statusOut.code ?? "unknown error")}`
        );
        return;
      }
      const statusData = statusOut.data as Record<string, unknown> | undefined;
      const wsStatus = statusData?.workspaceStatus as Record<string, unknown> | undefined;
      const revision = wsStatus?.workspaceRevision;
      if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
        await webview?.postMessage({ type: "wcMarkPhaseBusy", active: false });
        this.setDashboardUiInteraction("mark-phase-complete", false);
        await vscode.window.showErrorMessage("Could not confirm workspace state. Refresh the dashboard and try again.");
        return;
      }

      const activeFocus =
        nextFromWs.length > 0
          ? `Phase ${targetKey} complete — use roster Start when ready for Phase ${nextFromWs}`
          : `Phase ${targetKey} complete — no active workspace phase`;
      const nextAgentActions =
        nextFromWs.length > 0
          ? [
              `Start Phase ${nextFromWs} from the Phase Roster when you are ready to deliver`,
              "Or use Complete & Release when you are ready to ship this phase."
            ]
          : ["Pick the next phase from the Phase Roster when you are ready to deliver."];

      const out = await this.client.run("update-workspace-status", {
        expectedWorkspaceRevision: revision,
        currentKitPhase: null,
        activeFocus,
        blockers: [],
        pendingDecisions: [],
        nextAgentActions,
        command: "mark-phase-complete",
        actor: "cursor-dashboard"
      });

      if (out.ok !== true) {
        await webview?.postMessage({ type: "wcMarkPhaseBusy", active: false });
        this.setDashboardUiInteraction("mark-phase-complete", false);
        await vscode.window.showErrorMessage(
          `Could not mark phase complete: ${String(out.message ?? out.code ?? "unknown error")}`
        );
        return;
      }

      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    } finally {
      this.endDashboardMutationRefreshHold();
    }
    await this.pushUpdate({ light: true });
    await webview?.postMessage({ type: "wcMarkPhaseBusy", active: false });
    this.setDashboardUiInteraction("mark-phase-complete", false);
    await vscode.window.showInformationMessage(
      `Phase ${targetKey} marked complete. Start the next phase from the roster when you are ready.`
    );
  }

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

    let out = await runOnce();
    if (out.ok !== true && out.code === "planning-generation-mismatch") {
      await this.ingestPlanningGenFromDashboard();
      out = await runOnce();
    }

    if (out.ok !== true) {
      await vscode.window.showErrorMessage(
        `upsert-phase-catalog-entry failed: ${String(out.message ?? out.code ?? "unknown error")}`
      );
      return false;
    }

    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    return true;
  }

  private async closeDashboardDrawer(): Promise<void> {
    this.drawerSessionHost?.beginClosing();
    this.dashboardDrawerSession = null;
    this.drawerSessionHost?.reset();
    logWc("dashboard", "drawer closed");
    this.dashboardCoordinator?.emitSnapshot();
  }

  /** Close drawer first; run notify without blocking submit lock release in the caller `finally`. */
  private async notifyAfterDrawerClosed(notify: () => void | Thenable<unknown>): Promise<void> {
    await this.closeDashboardDrawer();
    void Promise.resolve(notify()).catch((err: unknown) => {
      logWc(
        "dashboard",
        `drawer notify failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  private resetDrawerSubmitPendingEffects(): void {
    this.drawerSubmitPendingEffects = [];
  }

  private flushDrawerSubmitPendingEffects(bus: SideEffectBus): void {
    const pending = this.drawerSubmitPendingEffects;
    this.drawerSubmitPendingEffects = [];
    for (const run of pending) {
      run(bus);
    }
  }

  private queueDrawerSideEffect(run: (bus: SideEffectBus) => void): void {
    this.drawerSubmitPendingEffects.push(run);
  }

  private queueDrawerNotify(message: string, severity: "info" | "error" = "info"): void {
    this.queueDrawerSideEffect((bus) => bus.notify(message, severity));
  }

  private queueDrawerNotifyAfterClose(message: string, severity: "info" | "error" = "info"): void {
    this.queueDrawerSideEffect((bus) => {
      void this.closeDashboardDrawer().then(() => bus.notify(message, severity));
    });
  }

  private async openAddWishlistDrawer(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildAddWishlistDrawerSpec());
    this.dashboardDrawerSession = { kind: "add-wishlist" };
    await this.postWcDrawerOpen(html, "add-wishlist");
  }

  private async openAddIdeaDrawer(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildAddIdeaDrawerSpec());
    // Stable for this drawer open so timeout retries do not mint duplicate ideas.
    this.dashboardDrawerSession = {
      kind: "add-idea",
      clientMutationId: this.dashboardDrawerMutationId("dashboard-add-idea", "new")
    };
    await this.postWcDrawerOpen(html, "add-idea");
  }

  private async onCreateIdeaFromDashboard(
    title: string,
    note: string,
    clientMutationId: string
  ): Promise<void> {
    if (title.length === 0) {
      throw new Error("Title required.");
    }
    const args: Record<string, unknown> = {
      title,
      clientMutationId,
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "create", command: "create-idea" },
        {}
      )
    };
    if (note.length > 0) {
      args.note = note;
    }
    const out = await this.client.run("create-idea", args);
    if (!out.ok) {
      throw new Error((out.message ?? String(out.code ?? "create-idea failed")).slice(0, 900));
    }
    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    await this.applyDashboardMutationInvalidation("ideas");
  }

  private async onUpdateIdeaFromDashboard(ideaId: string, title: string, note: string): Promise<void> {
    if (ideaId.length === 0 || title.length === 0) {
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "update",
        ideaId,
        ok: false,
        message: ideaId.length === 0 ? "Idea id required." : "Title required."
      });
      return;
    }
    const out = await this.client.run("update-idea", {
      ideaId,
      title,
      note: note.length > 0 ? note : null,
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "update", command: "update-idea" },
        {}
      )
    });
    if (!out.ok) {
      const message = (out.message ?? String(out.code ?? "update-idea failed")).slice(0, 900);
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "update", ideaId, ok: false, message });
      return;
    }
    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    await this.applyDashboardMutationInvalidation("ideas");
    await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "update", ideaId, ok: true });
  }

  private async onDeleteIdeaFromDashboard(ideaId: string): Promise<void> {
    if (ideaId.length === 0) {
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "delete", ideaId, ok: false, message: "Idea id required." });
      return;
    }
    const out = await this.client.run("delete-idea", {
      ideaId,
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "delete", command: "delete-idea" },
        {}
      )
    });
    if (!out.ok) {
      const message = (out.message ?? String(out.code ?? "delete-idea failed")).slice(0, 900);
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "delete", ideaId, ok: false, message });
      return;
    }
    const data = out.data && typeof out.data === "object" ? (out.data as Record<string, unknown>) : {};
    this.lastDeletedIdeaForUndo = data.idea && typeof data.idea === "object" ? (data.idea as Record<string, unknown>) : null;
    ingestPlanningMetaFromData(data);
    await this.applyDashboardMutationInvalidation("ideas");
    await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "delete", ideaId, ok: true });
  }

  private async onUndoDeleteIdeaFromDashboard(): Promise<void> {
    const idea = this.lastDeletedIdeaForUndo;
    if (!idea) {
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "undo-delete", ok: false, message: "No deleted idea to restore." });
      return;
    }
    const title = typeof idea.title === "string" ? idea.title.trim() : "";
    if (title.length === 0) {
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "undo-delete", ok: false, message: "Deleted idea cannot be restored." });
      return;
    }
    const args: Record<string, unknown> = {
      title,
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "create", command: "create-idea" },
        {}
      )
    };
    const note = typeof idea.note === "string" ? idea.note.trim() : "";
    if (note.length > 0) {
      args.note = note;
    }
    const status = typeof idea.status === "string" ? idea.status.trim() : "";
    if (status.length > 0) {
      args.status = status;
    }
    const linkedPlanArtifact = typeof idea.linkedPlanArtifact === "string" ? idea.linkedPlanArtifact.trim() : "";
    if (linkedPlanArtifact.length > 0) {
      args.linkedPlanArtifact = linkedPlanArtifact;
    }
    if (Array.isArray(idea.previousPlanArtifacts)) {
      args.previousPlanArtifacts = idea.previousPlanArtifacts.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );
    }
    const out = await this.client.run("create-idea", args);
    if (!out.ok) {
      const message = (out.message ?? String(out.code ?? "create-idea failed")).slice(0, 900);
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "undo-delete", ok: false, message });
      return;
    }
    this.lastDeletedIdeaForUndo = null;
    ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
    await this.applyDashboardMutationInvalidation("ideas");
    await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "undo-delete", ok: true });
  }

  private async onPrefillIdeaPlanningChat(ideaId: string, title: string, note: string): Promise<void> {
    const existing = this.inFlightIdeaPlan.get(ideaId);
    if (existing) {
      return existing;
    }
    const work = this.runPrefillIdeaPlanningChat(ideaId, title, note);
    this.inFlightIdeaPlan.set(ideaId, work);
    try {
      await work;
    } finally {
      if (this.inFlightIdeaPlan.get(ideaId) === work) {
        this.inFlightIdeaPlan.delete(ideaId);
      }
    }
  }

  private async onPrefillIdeaBrainstormChat(
    ideaId: string,
    planRef: string,
    title: string,
    note: string
  ): Promise<void> {
    const flightKey = `${ideaId}:${planRef}`;
    const existing = this.inFlightIdeaBrainstorm.get(flightKey);
    if (existing) {
      return existing;
    }
    const work = this.runPrefillIdeaBrainstormChat(ideaId, planRef, title, note);
    this.inFlightIdeaBrainstorm.set(flightKey, work);
    try {
      await work;
    } finally {
      if (this.inFlightIdeaBrainstorm.get(flightKey) === work) {
        this.inFlightIdeaBrainstorm.delete(flightKey);
      }
    }
  }

  private async runPrefillIdeaPlanningChat(ideaId: string, _title: string, _note: string): Promise<void> {
    if (ideaId.length === 0) {
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "plan",
        ideaId,
        ok: false,
        message: "Idea id required."
      });
      return;
    }
    const out = await this.runMutationWithGenerationRetry("start-idea-planning", {
      ideaId,
      clientMutationId: this.dashboardIdeaPlanMutationId(ideaId),
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "plan", command: "start-idea-planning" },
        {}
      )
    });
    if (!out.ok) {
      const message = this.formatStartIdeaPlanningError(out);
      await this.view?.webview.postMessage({ type: "wcIdeaMutationResult", operation: "plan", ideaId, ok: false, message });
      return;
    }
    const data = out.data && typeof out.data === "object" ? (out.data as Record<string, unknown>) : {};
    const prompt = typeof data.planningChatPrompt === "string" ? data.planningChatPrompt.trim() : "";
    if (prompt.length === 0) {
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "plan",
        ideaId,
        ok: false,
        message: "start-idea-planning succeeded but returned no planningChatPrompt. Refresh and try again."
      });
      return;
    }
    ingestPlanningMetaFromData(data);
    await this.applyDashboardMutationInvalidation("ideas");

    const prefill = await prefillCursorChat(prompt, { newChat: true });
    const resumed = data.mode === "resumed";
    const message = prefill.opened
      ? resumed
        ? prefill.route === "vscode-chat-command"
          ? "Planning session resumed in chat."
          : "Planning session resumed."
        : prefill.route === "vscode-chat-command"
          ? "Planning prompt opened in chat."
          : "Planning prompt opened."
      : prefill.openedDraft
        ? resumed
          ? "Planning session resumed in an editor and copied to clipboard."
          : "Planning prompt opened in an editor and copied to clipboard."
        : prefill.copiedToClipboard
          ? resumed
            ? "Planning session prompt copied to clipboard. Paste it into chat."
            : "Planning prompt copied to clipboard. Paste it into chat."
          : resumed
            ? "Planning session prepared."
            : "Planning prompt prepared.";
    await this.view?.webview.postMessage({
      type: "wcIdeaMutationResult",
      operation: "plan",
      ideaId,
      ok: true,
      message
    });
  }

  private async runPrefillIdeaBrainstormChat(
    ideaId: string,
    planRef: string,
    title: string,
    note: string
  ): Promise<void> {
    let resolvedPlanRefForSession = planRef;
    if (planRef.length === 0) {
      if (ideaId.length === 0) {
        await this.view?.webview.postMessage({
          type: "wcIdeaMutationResult",
          operation: "brainstorm",
          ideaId,
          ok: false,
          message: "Idea id required to create an IdeaPlan document."
        });
        return;
      }
      // No IdeaPlan doc yet — create one on-the-fly via migration (idempotent for existing ideas).
      // Use an inline policyApproval rather than dashboardPolicyApproval because this command
      // is an internal step of the brainstorm flow and is not in the tier matrix on its own.
      const migrateOut = await this.runMutationWithGenerationRetry("migrate-ideas-to-unified-document", {
        dryRun: false,
        policyApproval: { confirmed: true as const, rationale: "dashboard|workflow=ideas|command=migrate-ideas-to-unified-document|action=brainstorm-init|tier=routine" }
      });
      if (!migrateOut.ok) {
        await this.view?.webview.postMessage({
          type: "wcIdeaMutationResult",
          operation: "brainstorm",
          ideaId,
          ok: false,
          message: `Could not create IdeaPlan document: ${String(migrateOut.message ?? migrateOut.code ?? "unknown error")}`
        });
        return;
      }
      const migrateData = migrateOut.data && typeof migrateOut.data === "object" ? (migrateOut.data as Record<string, unknown>) : {};
      const outcomes = Array.isArray(migrateData.outcomes) ? (migrateData.outcomes as Record<string, unknown>[]) : [];
      const myOutcome = outcomes.find((o) => typeof o === "object" && o !== null && o.ideaId === ideaId);
      const createdRef = myOutcome && typeof myOutcome.planRef === "string" ? myOutcome.planRef.trim() : "";
      if (createdRef.length === 0) {
        await this.view?.webview.postMessage({
          type: "wcIdeaMutationResult",
          operation: "brainstorm",
          ideaId,
          ok: false,
          message: "IdeaPlan document creation succeeded but no planRef was returned. Refresh and try again."
        });
        return;
      }
      resolvedPlanRefForSession = createdRef;
      await this.applyDashboardMutationInvalidation("ideas");
    }
    const out = await this.runMutationWithGenerationRetry("start-brainstorm-session", {
      planRef: resolvedPlanRefForSession,
      ...(ideaId.length > 0 ? { ideaId } : {}),
      clientMutationId: this.dashboardIdeaBrainstormMutationId(ideaId, resolvedPlanRefForSession),
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "brainstorm", command: "start-brainstorm-session" },
        {}
      )
    });
    if (!out.ok) {
      const message = this.formatStartBrainstormSessionError(out);
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "brainstorm",
        ideaId,
        ok: false,
        message
      });
      return;
    }
    const data = out.data && typeof out.data === "object" ? (out.data as Record<string, unknown>) : {};
    const sessionIndex = typeof data.sessionIndex === "number" ? data.sessionIndex : Number(data.sessionIndex ?? NaN);
    if (!Number.isFinite(sessionIndex)) {
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "brainstorm",
        ideaId,
        ok: false,
        message: "start-brainstorm-session succeeded but returned no sessionIndex. Refresh and try again."
      });
      return;
    }
    const resolvedIdeaId =
      typeof data.ideaId === "string" && data.ideaId.trim().length > 0 ? data.ideaId.trim() : ideaId;
    const resolvedPlanRef =
      typeof data.planRef === "string" && data.planRef.trim().length > 0 ? data.planRef.trim() : resolvedPlanRefForSession;
    const promptFromResponse =
      typeof data.brainstormChatPrompt === "string" ? data.brainstormChatPrompt.trim() : "";
    const brainstormChatPrompt =
      promptFromResponse.length > 0
        ? promptFromResponse
        : buildBrainstormSessionPrompt({
            ideaId: resolvedIdeaId,
            title,
            note,
            sessionIndex,
            planRef: resolvedPlanRef
          });
    ingestPlanningMetaFromData(data);
    await this.applyDashboardMutationInvalidation("ideas");

    const prefill = await prefillCursorChat(brainstormChatPrompt, { newChat: true });
    const appended = data.transitioned !== true;
    const message = prefill.opened
      ? appended
        ? prefill.route === "vscode-chat-command"
          ? "Brainstorm session appended in chat."
          : "Brainstorm session appended."
        : prefill.route === "vscode-chat-command"
          ? "Brainstorm prompt opened in chat."
          : "Brainstorm prompt opened."
      : prefill.openedDraft
        ? appended
          ? "Brainstorm session prompt opened in an editor and copied to clipboard."
          : "Brainstorm prompt opened in an editor and copied to clipboard."
        : prefill.copiedToClipboard
          ? appended
            ? "Brainstorm session prompt copied to clipboard. Paste it into chat."
            : "Brainstorm prompt copied to clipboard. Paste it into chat."
          : appended
            ? "Brainstorm session prepared."
            : "Brainstorm prompt prepared.";
    await this.view?.webview.postMessage({
      type: "wcIdeaMutationResult",
      operation: "brainstorm",
      ideaId: resolvedIdeaId,
      ok: true,
      message
    });
  }

  private async onTaskCommentsComingSoon(taskId: string, mode: "view" | "add"): Promise<void> {
    const actionLabel = mode === "add" ? "Add comment" : "View comments";
    const pick = await vscode.window.showInformationMessage(
      `${actionLabel} for ${taskId} is coming soon. Use the wishlist flow to track comment work, or open the task detail meanwhile.`,
      "Add Wishlist Item",
      "Open task detail"
    );
    if (pick === "Add Wishlist Item") {
      await this.openAddWishlistDrawer();
      return;
    }
    if (pick === "Open task detail") {
      await vscode.commands.executeCommand("workflowCannon.task.showDetail", taskId);
    }
  }

  private async postWcDrawerOpen(html: string, workflowId = "drawer"): Promise<void> {
    await this.view?.webview.postMessage({ type: "wcDrawerOpen", html });
    this.drawerSessionHost?.open(workflowId);
    this.dashboardCoordinator?.emitSnapshot();
  }

  private async postDrawerValidationToWebview(message: string): Promise<void> {
    this.drawerSessionHost?.setValidationError(message);
    this.dashboardCoordinator?.emitSnapshot();
  }

  /** Snapshot-first drawer progress (T100495+). */
  private setDrawerMutationProgress(label: string): void {
    this.drawerSessionHost?.setSubmitting(label);
    this.dashboardCoordinator?.emitSnapshot();
  }

  private initDashboardCoordinator(webview: vscode.Webview): void {
    if (!this.drawerSessionHost) {
      return;
    }
    const sideEffects = new SideEffectBus({
      notify: (message, severity) => {
        if (severity === "error") {
          void vscode.window.showErrorMessage(message);
        } else {
          void vscode.window.showInformationMessage(message);
        }
      },
      scheduleRefresh: (mode, reason) => {
        this.refreshController.request({ reason, mode });
      },
      notifyKitChanged: () => {
        this.notifyKitStateChanged();
      }
    });
    this.dashboardCoordinator = new DashboardCoordinator({
      drawerSession: this.drawerSessionHost,
      refreshController: this.refreshController,
      client: this.client,
      beginMutationHold: () => this.beginDashboardMutationRefreshHold(),
      endMutationHold: () => this.endDashboardMutationRefreshHold(),
      beginDrawerMutationHold: () => this.beginDrawerSubmitRefreshHold(),
      endDrawerMutationHold: () => this.endDrawerSubmitRefreshHold(),
      emitToWebview: (snapshot) => {
        void webview.postMessage({ type: "wcHostSnapshot", snapshot });
      },
      sideEffects,
      onDrawerSubmit: async (values) => ({
        refreshed: await this.handleDrawerSubmit(values)
      }),
      onDrawerCancel: async () => {
        await this.closeDashboardDrawer();
      },
      hasActiveDrawerSession: () => this.dashboardDrawerSession !== null,
      closeDrawer: () => this.closeDashboardDrawer(),
      resetDrawerSubmitPendingEffects: () => this.resetDrawerSubmitPendingEffects(),
      flushDrawerSubmitPendingEffects: (bus) => this.flushDrawerSubmitPendingEffects(bus),
      isRefreshBusy: () => this.dashboardRefreshBusy,
      isRefreshDeferred: () => this.refreshController.hasDeferredRefreshPending()
    });
    this.dashboardCoordinator.registerDrawerWorkflow("accept-proposed");
    this.dashboardCoordinator.emitSnapshot();
  }

  /** Exposed for follow-on coordinator migration tasks and unit integration. */
  getDashboardCoordinator(): DashboardCoordinator | undefined {
    return this.dashboardCoordinator;
  }

  /** Hold dashboard refresh while kit mutations run (drawer batch, roster start, etc.). */
  private beginDashboardMutationRefreshHold(): void {
    this.refreshController.notifyMutationStart();
  }

  private endDashboardMutationRefreshHold(): void {
    this.refreshController.notifyMutationEnd();
  }

  /** Hold dashboard refresh while a drawer mutating batch runs (accept-all, etc.). */
  private beginDrawerSubmitRefreshHold(): void {
    this.dashboardRefreshAfterInteraction = true;
  }

  private endDrawerSubmitRefreshHold(): void {
    this.dashboardRefreshAfterInteraction = false;
  }

  private isPushUpdateStale(updateSequence: number, activeView: vscode.WebviewView): boolean {
    return this.refreshController.isStale(updateSequence) || this.view !== activeView;
  }

  private summaryHasCanonicalWorkspacePhase(data: unknown): boolean {
    if (!data || typeof data !== "object") {
      return false;
    }
    const rec = data as Record<string, unknown>;
    const ws = rec.workspaceStatus as Record<string, unknown> | undefined;
    if (typeof ws?.currentKitPhase === "string" && ws.currentKitPhase.trim().length > 0) {
      return true;
    }
    const systemStatus = rec.systemStatus as Record<string, unknown> | undefined;
    const phase = systemStatus?.phase as Record<string, unknown> | undefined;
    const ck = phase?.currentKitPhase;
    return typeof ck === "string" && ck.trim().length > 0;
  }

  private async readTaskStatus(taskId: string): Promise<string | null> {
    const task = await this.readTaskEntity(taskId);
    if (!task) {
      return null;
    }
    const status = task.status;
    return typeof status === "string" && status.trim().length > 0 ? status.trim() : null;
  }

  private async readTaskEntity(taskId: string): Promise<Record<string, unknown> | null> {
    const r = await this.client.run("get-task", { taskId });
    if (!r.ok || !r.data || typeof r.data !== "object") {
      return null;
    }
    const task = (r.data as Record<string, unknown>).task;
    return task && typeof task === "object" ? (task as Record<string, unknown>) : null;
  }

  private dashboardDrawerMutationId(prefix: string, taskId: string): string {
    return `${prefix}-${taskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private dashboardIdeaPlanMutationId(ideaId: string): string {
    return `dashboard-idea-plan-${ideaId}`;
  }

  private dashboardIdeaBrainstormMutationId(ideaId: string, planRef: string): string {
    const ideaKey = ideaId.length > 0 ? ideaId : "plan";
    const planKey = planRef.replace(/[^a-zA-Z0-9._:-]+/g, "-");
    return `dashboard-idea-brainstorm-${ideaKey}-${planKey}`;
  }

  private formatStartBrainstormSessionError(out: KitRunResult): string {
    const code = String(out.code ?? "start-brainstorm-session-failed");
    const base = (out.message ?? code).slice(0, 900);
    if (code === "idea-plan-not-found") {
      return `${base} Refresh the dashboard or link a unified IdeaPlan document first.`;
    }
    if (code === "invalid-args") {
      return `${base} Verify planRef is shaped like plan-artifact:<planId>.`;
    }
    if (code === "planning-generation-mismatch") {
      return `${base} Refresh the dashboard and try again.`;
    }
    return base;
  }

  private formatStartIdeaPlanningError(out: KitRunResult): string {
    const code = String(out.code ?? "start-idea-planning-failed");
    const base = (out.message ?? code).slice(0, 900);
    if (code === "idea-not-found") {
      return `${base} Refresh the dashboard or create the idea again.`;
    }
    if (code === "invalid-args") {
      return `${base} Verify the idea id from list-ideas.`;
    }
    if (code === "planning-generation-mismatch") {
      return `${base} Refresh the dashboard and try again.`;
    }
    return base;
  }

  private isDuplicateCanonicalIdempotencyFailure(out: KitRunResult): boolean {
    if (out.ok) {
      return false;
    }
    if (String(out.code ?? "") !== "task-state-canonical-publish-failed") {
      return false;
    }
    const msg = String(out.message ?? "");
    if (msg.includes("duplicate-idempotency-key") || msg.includes("already used by event")) {
      return true;
    }
    const data = out.data as Record<string, unknown> | undefined;
    const admission = data?.admissionCode;
    return admission === "duplicate-idempotency-key";
  }

  /** First clear-task-phase publish may succeed while a parallel retry still sees duplicate-idempotency-key. */
  private async recoverClearTaskPhaseAfterDuplicateIdempotency(
    taskId: string
  ): Promise<KitRunResult | null> {
    const task = await this.readTaskEntity(taskId);
    if (!task) {
      return null;
    }
    const pk = task.phaseKey != null ? String(task.phaseKey).trim() : "";
    const phase = task.phase != null ? String(task.phase).trim() : "";
    if (pk.length > 0 || phase.length > 0) {
      return null;
    }
    return {
      ok: true,
      code: "task-phase-cleared",
      message: `Cleared phase fields on task '${taskId}' (recovered after duplicate idempotency)`,
      data: { task }
    };
  }

  /**
   * Run a planning-generation-gated mutation, automatically retrying once after a
   * `planning-generation-mismatch` by adopting the freshly reported generation.
   * Mitigates races where a background hydrate/apply bumps the generation between
   * sequential dashboard mutations (e.g., accept → assign-task-phase).
   */
  private async runMutationWithGenerationRetry(
    command: string,
    baseArgs: Record<string, unknown>
  ): Promise<KitRunResult> {
    const first = await this.client.run(command, { ...baseArgs, ...expectedPlanningGenerationArgs() });
    if (first.ok || first.code !== "planning-generation-mismatch") {
      return first;
    }
    if (!ingestPlanningGenerationFromMismatch(first.data)) {
      return first;
    }
    return this.client.run(command, { ...baseArgs, ...expectedPlanningGenerationArgs() });
  }

  /**
   * `proposed` → `ready` when needed; no-op when the task is already `ready` (stale queue row or repeat submit).
   */
  private async ensureTaskAcceptedFromProposed(
    taskId: string,
    phaseKey: string,
    policyMeta: { workflowId: string; action: "accept-single" | "accept-batch" }
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const status = await this.readTaskStatus(taskId);
    if (status === "ready") {
      return { ok: true };
    }
    if (status !== "proposed") {
      return {
        ok: false,
        message: `Task ${taskId} is ${status ?? "unknown"}; accept only applies from proposed.`
      };
    }
    const r = await this.runMutationWithGenerationRetry("run-transition", {
      taskId,
      action: "accept",
      policyApproval: dashboardPolicyApproval(
        { workflowId: "accept-proposed", action: policyMeta.action, command: "run-transition" },
        { taskId, phaseKey }
      )
    });
    if (!r.ok) {
      return {
        ok: false,
        message: (r.message ?? r.code ?? JSON.stringify(r)).slice(0, 900)
      };
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    return { ok: true };
  }

  private async onAcceptPlanArtifact(planId: string, planRef: string, version: number): Promise<void> {
    const postAcceptResult = async (ok: boolean, message?: string): Promise<void> => {
      await this.view?.webview.postMessage({
        type: "wcPlanArtifactMutationResult",
        operation: "accept",
        planId,
        ok,
        message
      });
    };
    this.beginDashboardMutationRefreshHold();
    try {
      await this.ingestPlanningGenFromDashboard();
      const approvedBy =
        process.env.GIT_AUTHOR_EMAIL || process.env.USER || process.env.USERNAME || "dashboard-operator";
      const r = await this.runMutationWithGenerationRetry("accept-plan-artifact", {
        planId,
        approvalRecord: {
          schemaVersion: 1,
          confirmed: true,
          approvedVersion: version,
          approvedAt: new Date().toISOString(),
          approvedBy,
          planRef
        },
        policyApproval: dashboardPolicyApproval(
          { workflowId: "plan-artifact", action: "accept", command: "accept-plan-artifact" },
          { humanRationale: "Accept reviewed PlanArtifact from Dashboard", phaseKey: null, taskId: null }
        )
      });
      if (!r.ok) {
        const message = `Plan accept failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`;
        await vscode.window.showErrorMessage(message);
        await postAcceptResult(false, message);
        return;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      await vscode.window.showInformationMessage(`Accepted plan ${planId}.`);
      await this.applyDashboardMutationInvalidation("plan-artifact");
      await postAcceptResult(true, "Accepted.");
    } finally {
      this.endDashboardMutationRefreshHold();
    }
  }

  private async onReviewPlanArtifact(planId: string, version: number): Promise<void> {
    const postReviewResult = async (ok: boolean, message?: string): Promise<void> => {
      await this.view?.webview.postMessage({
        type: "wcPlanArtifactMutationResult",
        operation: "review",
        planId,
        ok,
        message
      });
    };
    this.beginDashboardMutationRefreshHold();
    try {
      await this.ingestPlanningGenFromDashboard();
      const r = await this.runMutationWithGenerationRetry("review-plan-artifact", {
        planId,
        version,
        recordReview: true,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "plan-artifact", action: "review", command: "review-plan-artifact" },
          { humanRationale: "Record PlanArtifact review from Dashboard", phaseKey: null, taskId: null }
        )
      });
      if (!r.ok) {
        const message = `Plan review failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`;
        await vscode.window.showErrorMessage(message);
        await postReviewResult(false, message);
        return;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
      const passed = data.passed === true;
      const blockers = Array.isArray(data.blockers) ? data.blockers.length : Number(data.blockerCount ?? 0);
      const warnings = Array.isArray(data.warnings) ? data.warnings.length : Number(data.warningCount ?? 0);
      const reviewSummary =
        typeof data.reviewSummary === "string" && data.reviewSummary.trim()
          ? data.reviewSummary.trim()
          : undefined;
      const detail =
        passed && blockers === 0 && warnings === 0
          ? "no blockers or warnings"
          : `${blockers} blocker(s), ${warnings} warning(s)`;
      await vscode.window.showInformationMessage(
        passed
          ? `Reviewed plan ${planId}: passed (${detail})${reviewSummary ? ` — ${reviewSummary.slice(0, 120)}` : ""}`
          : `Reviewed plan ${planId}: findings need attention (${detail})`
      );
      await this.applyDashboardMutationInvalidation("plan-artifact");
      await postReviewResult(true, detail);
    } finally {
      this.endDashboardMutationRefreshHold();
    }
  }

  private async onFinalizePlanArtifact(planId: string, version: number): Promise<void> {
    const postFinalizeResult = async (payload: {
      ok: boolean;
      message?: string;
      phaseKey?: string;
    }): Promise<void> => {
      await this.view?.webview.postMessage({
        type: "wcPlanArtifactMutationResult",
        operation: "finalize",
        planId,
        ...payload
      });
    };

    this.beginDashboardMutationRefreshHold();
    try {
      await this.ingestPlanningGenFromDashboard();
      // Phase rosters are resolved at finalize time (auto-empty / workspace nextKitPhase).
      // Do not pin to the workspace *current* phase — that collides with active queue work.
      const clientMutationId = `dashboard-finalize-${planId}-v${version}-${Date.now()}`;
      const commonArgs = {
        planId,
        version,
        desiredStatus: "ready",
        clientMutationId
      };
      const preview = await this.runMutationWithGenerationRetry("finalize-plan-to-phase", {
        ...commonArgs,
        dryRun: true
      });
      if (!preview.ok) {
        const message = `Plan finalize preview failed: ${(preview.message ?? preview.code ?? JSON.stringify(preview)).slice(0, 520)}`;
        await vscode.window.showErrorMessage(message);
        await postFinalizeResult({ ok: false, message });
        return;
      }
      ingestPlanningMetaFromData(preview.data as Record<string, unknown> | undefined);
      const r = await this.runMutationWithGenerationRetry("finalize-plan-to-phase", {
        ...commonArgs,
        dryRun: false,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "plan-artifact", action: "finalize", command: "finalize-plan-to-phase" },
          { humanRationale: "Finalize accepted PlanArtifact from Dashboard", phaseKey: null, taskId: null }
        )
      });
      let data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
      if (!r.ok) {
        // Persist can succeed on disk then lose stdout (preempt / crash). Verify before scaring the operator.
        if (isLostKitCliOutput(r)) {
          const recovered = await this.recoverFinalizeAfterLostCliOutput(planId, version);
          if (recovered) {
            data = recovered;
          } else {
            const message = `Plan finalize failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`;
            await vscode.window.showErrorMessage(message);
            await postFinalizeResult({ ok: false, message });
            return;
          }
        } else {
          const message = `Plan finalize failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`;
          await vscode.window.showErrorMessage(message);
          await postFinalizeResult({ ok: false, message });
          return;
        }
      } else {
        ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      }
      const delivery =
        data.delivery && typeof data.delivery === "object"
          ? (data.delivery as Record<string, unknown>)
          : undefined;
      const phaseKey =
        (typeof data.phaseKey === "string" && data.phaseKey.trim()) ||
        (typeof delivery?.phaseKey === "string" && delivery.phaseKey.trim()) ||
        "";
      const count =
        typeof data.count === "number"
          ? data.count
          : typeof delivery?.taskCount === "number"
            ? delivery.taskCount
            : Number(data.count ?? delivery?.taskCount ?? 0);
      await vscode.window.showInformationMessage(
        `Finalized plan ${planId}${Number.isFinite(count) && count > 0 ? ` into ${count} task(s)` : ""}.`
      );
      await this.applyDashboardMutationInvalidation("plan-artifact");
      await postFinalizeResult({
        ok: true,
        message: Number.isFinite(count) && count > 0 ? `Finalized into ${count} task(s).` : "Finalized.",
        phaseKey: phaseKey || undefined
      });
      if (phaseKey.length > 0) {
        await this.view?.webview.postMessage({ type: "wcOpenQueueForPhase", phaseKey });
      }
    } finally {
      this.endDashboardMutationRefreshHold();
    }
  }

  /**
   * When finalize persist returns empty-stdout parse failure, check whether delivery already landed.
   */
  private async recoverFinalizeAfterLostCliOutput(
    planId: string,
    version: number
  ): Promise<Record<string, unknown> | null> {
    const probe = await this.client.run("get-plan-artifact", {
      planId,
      version,
      includeArtifact: true
    });
    if (!probe.ok || !probe.data || typeof probe.data !== "object") {
      return null;
    }
    const data = probe.data as Record<string, unknown>;
    const artifact =
      data.artifact && typeof data.artifact === "object"
        ? (data.artifact as Record<string, unknown>)
        : data;
    const delivery =
      artifact.delivery && typeof artifact.delivery === "object"
        ? (artifact.delivery as Record<string, unknown>)
        : undefined;
    const taskCount =
      typeof delivery?.taskCount === "number"
        ? delivery.taskCount
        : Array.isArray(delivery?.taskRefs)
          ? delivery.taskRefs.length
          : 0;
    const status = typeof artifact.status === "string" ? artifact.status.trim() : "";
    const tasksGenerated = data.tasksGenerated === true || taskCount > 0 || status === "finalized";
    if (!tasksGenerated) {
      return null;
    }
    return {
      phaseKey: typeof delivery?.phaseKey === "string" ? delivery.phaseKey : "",
      count: taskCount,
      delivery,
      status,
      recoveredFromLostCliOutput: true
    };
  }

  private async onCheckIdeaDelivery(planRef: string): Promise<void> {
    await this.ingestPlanningGenFromDashboard();
    const r = await this.runMutationWithGenerationRetry("check-delivery-status", {
      planRef,
      policyApproval: dashboardPolicyApproval(
        { workflowId: "ideas", action: "check-delivery", command: "check-delivery-status" },
        { humanRationale: "Check IdeaPlan delivery from Dashboard", phaseKey: null, taskId: null }
      )
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage(
        `Check delivery failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`
      );
      await this.view?.webview.postMessage({
        type: "wcIdeaMutationResult",
        operation: "check-delivery",
        ok: false,
        message: String(r.message ?? r.code ?? "check-delivery-status failed")
      });
      return;
    }
    ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
    const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
    const transitioned = data.transitioned === true;
    const deliveryStatus =
      data.deliveryStatus && typeof data.deliveryStatus === "object"
        ? (data.deliveryStatus as Record<string, unknown>)
        : {};
    const completed = Number(deliveryStatus.completed ?? 0);
    const total = Number(deliveryStatus.total ?? 0);
    const pending = Number(deliveryStatus.pending ?? 0);
    await vscode.window.showInformationMessage(
      transitioned
        ? `IdeaPlan delivered (${completed}/${total} tasks complete).`
        : `Delivery in progress: ${completed}/${total} complete, ${pending} pending.`
    );
    await this.applyDashboardMutationInvalidation("ideas");
    await this.view?.webview.postMessage({
      type: "wcIdeaMutationResult",
      operation: "check-delivery",
      ok: true,
      message: transitioned ? "delivered" : "pending"
    });
  }

  private async onViewPlanArtifact(planId: string, version: number): Promise<void> {
    const r = await this.client.run("get-plan-artifact", {
      planId,
      version,
      includeArtifact: false
    });
    if (!r.ok) {
      await vscode.window.showErrorMessage(
        `Plan view failed: ${(r.message ?? r.code ?? JSON.stringify(r)).slice(0, 520)}`
      );
      return;
    }
    const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
    const storagePath = typeof data.storagePath === "string" ? data.storagePath.trim() : "";
    if (!storagePath) {
      await vscode.window.showErrorMessage(`Plan ${planId} version ${version} did not return a storage path.`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(this.client.getWorkspaceRoot(), storagePath))
    );
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  /**
   * Accept-proposed drawer: kit mutations inside coordinator.runDrawerMutation; toasts via SideEffectBus after.
   * Manual QA: accept T1 then T2 on proposed queue — second submit must not hang while first toast is visible.
   */
  private async handleAcceptProposedDrawerSubmit(
    session: Extract<DashboardDrawerSession, { kind: "accept-proposed" }>,
    values: Record<string, string>
  ): Promise<boolean> {
    const coordinator = this.dashboardCoordinator;
    if (!coordinator?.isDrawerWorkflowRegistered("accept-proposed")) {
      return false;
    }
    const taskIds = session.taskIds;
    const validated = validateAcceptProposedSubmit(values);
    if (!validated.ok) {
      await this.postDrawerValidationToWebview(validated.error);
      return false;
    }
    const { phaseKey } = validated.values;
    const categoryLabel = session.categoryLabel;
    if (taskIds.length === 0) {
      return false;
    }
    const total = taskIds.length;
    const summaryBefore = this.lastDashboardSummaryData;
    const proposedSnaps = new Map<
      string,
      NonNullable<ReturnType<typeof lookupProposedTaskSnapshot>>
    >();
    for (const tid of taskIds) {
      if (summaryBefore) {
        const snap = lookupProposedTaskSnapshot(summaryBefore, tid, categoryLabel);
        if (snap) {
          proposedSnaps.set(tid, snap);
        }
      }
    }
    if (total === 1) {
      const taskId = taskIds[0]!;
      const acceptTraceId = `accept-proposed:${taskId}`;
      this.setDrawerMutationProgress(`Accepting ${taskId}…`);
      const acceptStep = await this.ensureTaskAcceptedFromProposed(taskId, phaseKey, {
        workflowId: "accept-proposed",
        action: "accept-single"
      });
      if (!acceptStep.ok) {
        await this.postDrawerValidationToWebview(acceptStep.message);
        return false;
      }
      this.setDrawerMutationProgress(`Assigning ${taskId} → phase ${phaseKey}…`);
      const r2 = await this.runMutationWithGenerationRetry("assign-task-phase", {
        taskId,
        phaseKey
      });
      if (!r2.ok) {
        this.closeDashboardDrawer();
        this.queueDrawerNotify(
          `Accepted ${taskId}, but setting the phase failed: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 520)}`,
          "error"
        );
        return true;
      }
      ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
      const assignedTask = (r2.data as { task?: Record<string, unknown> } | undefined)?.task;
      const proposedSnap = proposedSnaps.get(taskId);
      let patched = false;
      if (proposedSnap && assignedTask) {
        patched = await this.tryApplyQueueAcceptProposedTargetedPatch({
          taskId,
          task: assignedTask,
          fromPlacement: proposedSnap.placement,
          fromPhaseKey: proposedSnap.phaseKey,
          toPhaseKey: phaseKey,
          traceId: acceptTraceId
        });
      } else if (assignedTask) {
        patched = await this.tryApplyQueueTaskPhaseTargetedPatch({
          taskId,
          task: assignedTask,
          fromPhaseKey: resolveFromPhaseKeyForTask(summaryBefore, taskId, assignedTask),
          toPhaseKey: phaseKey,
          traceId: acceptTraceId
        });
      }
      this.queueDrawerNotifyAfterClose(`Accepted ${taskId} and assigned phase ${phaseKey}.`);
      return !patched;
    }
    const failures: string[] = [];
    let needsCoordinatorRefresh = false;
    this.setDrawerMutationProgress(`Starting batch accept (${String(total)} tasks)…`);
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i]!;
      const step = i + 1;
      this.setDrawerMutationProgress(`Accepting ${taskId} (${step} of ${total})…`);
      const acceptStep = await this.ensureTaskAcceptedFromProposed(taskId, phaseKey, {
        workflowId: "accept-proposed",
        action: "accept-batch"
      });
      if (!acceptStep.ok) {
        failures.push(`${taskId}: ${acceptStep.message.slice(0, 200)}`);
        continue;
      }
      this.setDrawerMutationProgress(`Assigning ${taskId} → phase ${phaseKey} (${step} of ${total})…`);
      const r2 = await this.runMutationWithGenerationRetry("assign-task-phase", {
        taskId,
        phaseKey
      });
      if (!r2.ok) {
        failures.push(`${taskId} assign: ${(r2.message ?? r2.code ?? JSON.stringify(r2)).slice(0, 180)}`);
      } else {
        ingestPlanningMetaFromData(r2.data as Record<string, unknown> | undefined);
        const assignedTask = (r2.data as { task?: Record<string, unknown> } | undefined)?.task;
        const proposedSnap = proposedSnaps.get(taskId);
        let patched = false;
        if (proposedSnap && assignedTask) {
          patched = await this.tryApplyQueueAcceptProposedTargetedPatch({
            taskId,
            task: assignedTask,
            fromPlacement: proposedSnap.placement,
            fromPhaseKey: proposedSnap.phaseKey,
            toPhaseKey: phaseKey,
            traceId: `accept-proposed:${taskId}:batch`
          });
        } else if (assignedTask) {
          patched = await this.tryApplyQueueTaskPhaseTargetedPatch({
            taskId,
            task: assignedTask,
            fromPhaseKey: resolveFromPhaseKeyForTask(summaryBefore, taskId, assignedTask),
            toPhaseKey: phaseKey,
            traceId: `accept-proposed:${taskId}:batch`
          });
        }
        if (!patched) {
          needsCoordinatorRefresh = true;
        }
      }
    }
    this.closeDashboardDrawer();
    if (failures.length > 0) {
      this.queueDrawerNotifyAfterClose(
        `Some batch operations failed (${String(failures.length)}/${String(taskIds.length)}): ${failures
          .slice(0, 3)
          .join(" · ")}`.slice(0, 900),
        "error"
      );
      return true;
    }
    this.queueDrawerNotifyAfterClose(
      `Accepted ${String(taskIds.length)} proposed ${categoryLabel.trim() || "task"}(s) into phase ${phaseKey}.`
    );
    return needsCoordinatorRefresh;
  }

  /**
   * @returns true when the coordinator should schedule a light dashboard refresh.
   * Do not call notifyKitStateChanged here — coordinator refresh replaces kit-state debounce.
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
      const args: Record<string, unknown> = {
        phaseKey,
        ...expectedPlanningGenerationArgs()
      };
      args.shortDescription = shortDescription.length > 0 ? shortDescription : null;
      const out = await this.client.run("upsert-phase-catalog-entry", args);
      if (!out.ok) {
        const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
        await this.postDrawerValidationToWebview(`upsert-phase-catalog-entry failed: ${detail}`);
        return false;
      }
      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
      await this.closeDashboardDrawer();
      this.queueDrawerNotify(`Phase catalog updated for ${phaseKey}`);
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
        policyApproval = dashboardPolicyApproval(
          { workflowId: "dismiss-phase-note", action: "critical", command: "dismiss-phase-note" },
          { humanRationale: policyRationale }
        );
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
      this.queueDrawerNotify(r.message ?? "Phase note dismissed");
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
      this.queueDrawerNotify(r.message ?? "Phase note updated");
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
      this.wishlistPage = 0;
      return true;
    }
    if (session.kind === "add-idea") {
      const validated = validateAddIdeaSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      try {
        await this.onCreateIdeaFromDashboard(
          validated.values.title,
          validated.values.note,
          session.clientMutationId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.postDrawerValidationToWebview(message.slice(0, 900));
        return false;
      }
      this.closeDashboardDrawer();
      this.queueDrawerNotify("Idea created");
      return true;
    }
    if (session.kind === "assign-task-phase") {
      const validated = validateAssignTaskPhaseSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const taskId = session.taskId;
      if (validated.values.moveToBacklog === "true") {
        const traceId = `assign-task-phase:${taskId}:backlog`;
        let stepAt = Date.now();
        logWc("dashboard", `drawerSubmit trace id=${traceId} step=begin moveToBacklog=true`);
        const fromPhaseKey = resolveFromPhaseKeyForTask(this.lastDashboardSummaryData, taskId);
        // Avoid extra set/clear-agent-activity CLI processes here — they raced clear-task-phase
        // and dashboard-summary against the same SQLite file (full-table persist per save).
        const mutationId = this.dashboardDrawerMutationId("dashboard-backlog", taskId);
        let out = await this.runMutationWithGenerationRetry("clear-task-phase", {
          taskId,
          clientMutationId: mutationId
        });
        if (!out.ok && this.isDuplicateCanonicalIdempotencyFailure(out)) {
          const msg = String(out.message ?? "");
          const idMatch = msg.match(/clientMutationId '([^']+)'/);
          const conflictingId = idMatch?.[1];
          if (conflictingId && conflictingId === mutationId) {
            out = await this.runMutationWithGenerationRetry("clear-task-phase", {
              taskId,
              clientMutationId: this.dashboardDrawerMutationId("dashboard-backlog-retry", taskId)
            });
          }
          if (!out.ok && this.isDuplicateCanonicalIdempotencyFailure(out)) {
            const recovered = await this.recoverClearTaskPhaseAfterDuplicateIdempotency(taskId);
            if (recovered) {
              out = recovered;
            }
          }
        }
        stepAt = logWcDrawerSubmitStep(
          traceId,
          "clear-task-phase",
          stepAt,
          `ok=${String(out.ok)} code=${String(out.code ?? "")}`
        );
        if (!out.ok) {
          const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
          await this.postDrawerValidationToWebview(`clear-task-phase failed: ${detail}`.slice(0, 900));
          return false;
        }
        ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
        const clearedTask = (out.data as { task?: Record<string, unknown> } | undefined)?.task;
        const patched = await this.tryApplyQueueTaskPhaseTargetedPatch({
          taskId,
          task: clearedTask,
          fromPhaseKey,
          toPhaseKey: null,
          traceId
        });
        this.closeDashboardDrawer();
        stepAt = logWcDrawerSubmitStep(traceId, "drawer-closed", stepAt);
        stepAt = logWcDrawerSubmitStep(
          traceId,
          patched ? "queue-patch-applied" : "refresh-deferred-to-coordinator",
          stepAt
        );
        this.queueDrawerNotify(`Moved ${taskId} to backlog (phase cleared)`);
        logWcDrawerSubmitStep(traceId, "handler-done", stepAt);
        return !patched;
      }
      const { phaseKey } = validated.values;
      const assignTraceId = `assign-task-phase:${taskId}:set`;
      let stepAt = Date.now();
      logWc("dashboard", `drawerSubmit trace id=${assignTraceId} step=begin phaseKey=${phaseKey}`);
      const fromPhaseKey = resolveFromPhaseKeyForTask(this.lastDashboardSummaryData, taskId);
      // Skip set/clear-agent-activity — two extra CLI spawns (~2s) with no queue UX benefit;
      // same rationale as the backlog (clear-task-phase) path.
      const args: Record<string, unknown> = {
        taskId,
        phaseKey
      };
      const out = await this.runMutationWithGenerationRetry("assign-task-phase", args);
      stepAt = logWcDrawerSubmitStep(
        assignTraceId,
        "assign-task-phase",
        stepAt,
        `ok=${String(out.ok)} code=${String(out.code ?? "")}`
      );
      if (!out.ok) {
        const detail = `${String(out.code ?? "")} ${String(out.message ?? "")}`.trim();
        await this.postDrawerValidationToWebview(`Could not set phase: ${detail}`.slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(out.data as Record<string, unknown> | undefined);
      const assignedTask = (out.data as { task?: Record<string, unknown> } | undefined)?.task;
      const patched = await this.tryApplyQueueTaskPhaseTargetedPatch({
        taskId,
        task: assignedTask,
        fromPhaseKey,
        toPhaseKey: phaseKey,
        traceId: assignTraceId
      });
      this.closeDashboardDrawer();
      stepAt = logWcDrawerSubmitStep(
        assignTraceId,
        patched ? "queue-patch-applied" : "refresh-deferred-to-coordinator",
        stepAt
      );
      this.queueDrawerNotify(`Phase set for ${taskId} → ${phaseKey}`);
      logWcDrawerSubmitStep(assignTraceId, "handler-done", stepAt);
      return !patched;
    }
    if (session.kind === "add-phase-note") {
      const phaseKey = this.inferPhaseKeyForKitPhaseNoteFromDashboard();
      if (!phaseKey) {
        await this.postDrawerValidationToWebview("Could not resolve the current phase. Refresh the dashboard and try again.");
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
      this.queueDrawerNotify(r.message ?? "Phase note added");
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
      this.queueDrawerNotify(r.message ?? "Converted phase note to task");
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
      this.queueDrawerNotify(r.message ?? "Persisted phase note proposals");
      return true;
    }
    if (session.kind === "accept-proposed") {
      return this.handleAcceptProposedDrawerSubmit(session, values);
    }
    if (session.kind === "register-team-assignment") {
      const validated = validateRegisterTeamAssignmentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const { executionTaskId, supervisorId, workerId, policyRationale } = validated.values;
      const r = await this.client.run("register-assignment", {
        executionTaskId,
        supervisorId,
        workerId,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "register-team-assignment", action: "register", command: "register-assignment" },
          { taskId: executionTaskId, humanRationale: policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? `Registered assignment for ${executionTaskId}`);
      return true;
    }
    if (session.kind === "submit-team-handoff") {
      const validated = validateSubmitTeamHandoffSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const handoff: Record<string, unknown> = {
        schemaVersion: 1,
        summary: validated.values.summary
      };
      const evidenceRefs = validated.values.evidenceRefs
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (evidenceRefs.length > 0) {
        handoff.evidenceRefs = evidenceRefs;
      }
      const r = await this.client.run("submit-assignment-handoff", {
        assignmentId: session.assignmentId,
        workerId: session.workerId,
        handoff,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "submit-team-handoff", action: "handoff", command: "submit-assignment-handoff" },
          { taskId: session.assignmentId, humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Handoff submitted");
      return true;
    }
    if (session.kind === "reconcile-team-assignment") {
      const validated = validateReconcileTeamAssignmentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("reconcile-assignment", {
        assignmentId: session.assignmentId,
        supervisorId: session.supervisorId,
        checkpoint: { schemaVersion: 1, mergedSummary: validated.values.mergedSummary },
        policyApproval: dashboardPolicyApproval(
          { workflowId: "reconcile-team-assignment", action: "reconcile", command: "reconcile-assignment" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Assignment reconciled");
      return true;
    }
    if (session.kind === "block-team-assignment") {
      const validated = validateBlockTeamAssignmentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("block-assignment", {
        assignmentId: session.assignmentId,
        supervisorId: session.supervisorId,
        reason: validated.values.reason,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "block-team-assignment", action: "block", command: "block-assignment" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Assignment blocked");
      return true;
    }
    if (session.kind === "cancel-team-assignment") {
      const validated = validateCancelTeamAssignmentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("cancel-assignment", {
        assignmentId: session.assignmentId,
        supervisorId: validated.values.supervisorId,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "cancel-team-assignment", action: "cancel", command: "cancel-assignment" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Assignment cancelled");
      return true;
    }
    if (session.kind === "cancel-plan-artifact") {
      const validated = validateCancelPlanArtifactSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      await this.ingestPlanningGenFromDashboard();
      const args: Record<string, unknown> = {
        planRef: session.planRef,
        planId: session.planId,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "plan-artifact", action: "cancel", command: "cancel-plan-artifact" },
          {
            humanRationale:
              validated.values.rationale.length > 0
                ? validated.values.rationale
                : "Cancel PlanArtifact from Dashboard"
          }
        )
      };
      if (session.ideaId) {
        args.ideaId = session.ideaId;
      }
      if (validated.values.rationale.length > 0) {
        args.rationale = validated.values.rationale;
      }
      const r = await this.runMutationWithGenerationRetry("cancel-plan-artifact", args);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? r.code ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Plan cancelled");
      await this.applyDashboardMutationInvalidation("plan-artifact");
      return true;
    }
    if (session.kind === "delete-plan-artifact") {
      const validated = validateDeletePlanArtifactSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      await this.ingestPlanningGenFromDashboard();
      const args: Record<string, unknown> = {
        planRef: session.planRef,
        planId: session.planId,
        confirmDelete: true,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "plan-artifact", action: "delete", command: "delete-plan-artifact" },
          { humanRationale: validated.values.policyRationale }
        )
      };
      if (session.ideaId) {
        args.ideaId = session.ideaId;
      }
      const r = await this.runMutationWithGenerationRetry("delete-plan-artifact", args);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? r.code ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Plan deleted");
      await this.applyDashboardMutationInvalidation("workspace-wide");
      return true;
    }
    if (session.kind === "register-subagent") {
      const validated = validateRegisterSubagentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const allowedCommands = validated.values.allowedCommands
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const r = await this.client.run("register-subagent", {
        subagentId: validated.values.subagentId,
        displayName: validated.values.displayName,
        description: validated.values.description,
        allowedCommands,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "register-subagent", action: "register", command: "register-subagent" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? `Registered subagent ${validated.values.subagentId}`);
      return true;
    }
    if (session.kind === "spawn-subagent") {
      const validated = validateSpawnSubagentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const payload: Record<string, unknown> = {
        subagentId: validated.values.subagentId,
        hostHint: validated.values.hostHint,
        promptSummary: validated.values.promptSummary,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "spawn-subagent", action: "spawn", command: "spawn-subagent" },
          {
            taskId: validated.values.executionTaskId || undefined,
            humanRationale: validated.values.policyRationale
          }
        ),
        ...expectedPlanningGenerationArgs()
      };
      if (validated.values.executionTaskId) {
        payload.executionTaskId = validated.values.executionTaskId;
      }
      const r = await this.client.run("spawn-subagent", payload);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Subagent session started");
      return true;
    }
    if (session.kind === "close-subagent-session") {
      const validated = validateCloseSubagentSessionSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("close-subagent-session", {
        sessionId: session.sessionId,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "close-subagent-session", action: "close", command: "close-subagent-session" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      await this.closeDashboardDrawer();
      await this.applyDashboardMutationInvalidation("task-queue");
      this.queueDrawerNotify(r.message ?? "Session closed");
      return false;
    }
    if (session.kind === "retire-subagent") {
      const validated = validateRetireSubagentSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("retire-subagent", {
        subagentId: validated.values.subagentId,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "retire-subagent", action: "retire", command: "retire-subagent" },
          { humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? `Retired subagent ${validated.values.subagentId}`);
      return true;
    }
    if (session.kind === "create-checkpoint") {
      const validated = validateCreateCheckpointSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const payload: Record<string, unknown> = {
        mode: session.mode,
        policyApproval: dashboardPolicyApproval(
          { workflowId: "create-checkpoint", action: "create", command: "create-checkpoint" },
          { taskId: validated.values.taskId || undefined, humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      };
      if (validated.values.taskId) {
        payload.taskId = validated.values.taskId;
      }
      if (validated.values.label) {
        payload.label = validated.values.label;
      }
      const r = await this.client.run("create-checkpoint", payload);
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Checkpoint created");
      return true;
    }
    if (session.kind === "rewind-checkpoint") {
      const validated = validateRewindCheckpointSubmit(values);
      if (!validated.ok) {
        await this.postDrawerValidationToWebview(validated.error);
        return false;
      }
      const r = await this.client.run("rewind-to-checkpoint", {
        checkpointId: session.checkpointId,
        force: validated.values.force === "yes",
        policyApproval: dashboardPolicyApproval(
          { workflowId: "rewind-to-checkpoint", action: "rewind", command: "rewind-to-checkpoint" },
          { taskId: session.taskId ?? undefined, humanRationale: validated.values.policyRationale }
        ),
        ...expectedPlanningGenerationArgs()
      });
      if (!r.ok) {
        await this.postDrawerValidationToWebview((r.message ?? JSON.stringify(r)).slice(0, 900));
        return false;
      }
      ingestPlanningMetaFromData(r.data as Record<string, unknown> | undefined);
      this.closeDashboardDrawer();
      this.queueDrawerNotify(r.message ?? "Rewound to checkpoint");
      return true;
    }
    if (session.kind === "view-checkpoint-compare") {
      this.closeDashboardDrawer();
      return false;
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
    const defaultPhaseKey = data ? lookupDashboardTaskPhaseKey(data, taskId) : undefined;
    logWc(
      "dashboard",
      `drawer open assign-task-phase taskId=${taskId}${defaultPhaseKey ? ` defaultPhase=${defaultPhaseKey}` : ""}`
    );
    const html = renderDrawerFormHtml(
      buildAssignTaskPhaseDrawerSpec(taskId, suggestions, defaultPhaseKey || undefined)
    );
    this.dashboardDrawerSession = { kind: "assign-task-phase", taskId };
    await this.postWcDrawerOpen(html);
  }

  private async onDismissPhaseNote(noteId: string, priority: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildDismissPhaseNoteDrawerSpec(noteId, priority));
    this.dashboardDrawerSession = { kind: "dismiss-note", noteId, priority };
    await this.postWcDrawerOpen(html);
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
    await this.postWcDrawerOpen(html);
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
    await this.postWcDrawerOpen(html);
  }

  private async openRegisterTeamAssignmentDrawer(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildRegisterTeamAssignmentDrawerSpec());
    this.dashboardDrawerSession = { kind: "register-team-assignment" };
    await this.postWcDrawerOpen(html);
  }

  private async openSubmitTeamHandoffDrawer(assignmentId: string, workerId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildSubmitTeamHandoffDrawerSpec({ assignmentId, workerId }));
    this.dashboardDrawerSession = { kind: "submit-team-handoff", assignmentId, workerId };
    await this.postWcDrawerOpen(html);
  }

  private async openReconcileTeamAssignmentDrawer(assignmentId: string, supervisorId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildReconcileTeamAssignmentDrawerSpec({ assignmentId, supervisorId }));
    this.dashboardDrawerSession = { kind: "reconcile-team-assignment", assignmentId, supervisorId };
    await this.postWcDrawerOpen(html);
  }

  private async openBlockTeamAssignmentDrawer(assignmentId: string, supervisorId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildBlockTeamAssignmentDrawerSpec({ assignmentId, supervisorId }));
    this.dashboardDrawerSession = { kind: "block-team-assignment", assignmentId, supervisorId };
    await this.postWcDrawerOpen(html);
  }

  private async openCancelTeamAssignmentDrawer(assignmentId: string, supervisorId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(
      buildCancelTeamAssignmentDrawerSpec({ assignmentId, supervisorId: supervisorId || "operator" })
    );
    this.dashboardDrawerSession = {
      kind: "cancel-team-assignment",
      assignmentId,
      supervisorId: supervisorId || "operator"
    };
    await this.postWcDrawerOpen(html);
  }

  private async openCancelPlanArtifactDrawer(p: {
    planId: string;
    planRef: string;
    ideaId?: string;
    title?: string;
  }): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildCancelPlanArtifactDrawerSpec(p));
    this.dashboardDrawerSession = {
      kind: "cancel-plan-artifact",
      planId: p.planId,
      planRef: p.planRef,
      ...(p.ideaId ? { ideaId: p.ideaId } : {}),
      ...(p.title ? { title: p.title } : {})
    };
    await this.postWcDrawerOpen(html, "cancel-plan-artifact");
  }

  private async openDeletePlanArtifactDrawer(p: {
    planId: string;
    planRef: string;
    ideaId?: string;
    title?: string;
  }): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildDeletePlanArtifactDrawerSpec(p));
    this.dashboardDrawerSession = {
      kind: "delete-plan-artifact",
      planId: p.planId,
      planRef: p.planRef,
      ...(p.ideaId ? { ideaId: p.ideaId } : {}),
      ...(p.title ? { title: p.title } : {})
    };
    await this.postWcDrawerOpen(html, "delete-plan-artifact");
  }

  private async openRegisterSubagentDrawer(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildRegisterSubagentDrawerSpec());
    this.dashboardDrawerSession = { kind: "register-subagent" };
    await this.postWcDrawerOpen(html);
  }

  private async openSpawnSubagentDrawer(subagentId?: string, executionTaskId?: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(
      buildSpawnSubagentDrawerSpec({
        subagentId: subagentId || undefined,
        executionTaskId: executionTaskId || undefined
      })
    );
    this.dashboardDrawerSession = {
      kind: "spawn-subagent",
      subagentId: subagentId || undefined,
      executionTaskId: executionTaskId || undefined
    };
    await this.postWcDrawerOpen(html);
  }

  private async openCloseSubagentSessionDrawer(sessionId: string, definitionId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildCloseSubagentSessionDrawerSpec({ sessionId, definitionId }));
    this.dashboardDrawerSession = { kind: "close-subagent-session", sessionId, definitionId };
    await this.postWcDrawerOpen(html);
  }

  private async openRetireSubagentDrawer(subagentId?: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildRetireSubagentDrawerSpec({ subagentId: subagentId || undefined }));
    this.dashboardDrawerSession = { kind: "retire-subagent", subagentId: subagentId || undefined };
    await this.postWcDrawerOpen(html);
  }

  private async openCreateCheckpointDrawer(mode: "head" | "stash", taskId?: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(
      buildCreateCheckpointDrawerSpec({ mode, taskId: taskId || undefined })
    );
    this.dashboardDrawerSession = { kind: "create-checkpoint", mode, taskId: taskId || undefined };
    await this.postWcDrawerOpen(html);
  }

  private async openRewindCheckpointDrawer(
    checkpointId: string,
    refKind: string,
    taskId?: string
  ): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(
      buildRewindCheckpointDrawerSpec({
        checkpointId,
        refKind,
        taskId: taskId || null
      })
    );
    this.dashboardDrawerSession = {
      kind: "rewind-checkpoint",
      checkpointId,
      refKind,
      taskId: taskId || undefined
    };
    await this.postWcDrawerOpen(html);
  }

  private async openCompareCheckpointDrawer(checkpointId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const r = await this.client.run("compare-checkpoint", { checkpointId });
    if (!r.ok) {
      await vscode.window.showErrorMessage((r.message ?? JSON.stringify(r)).slice(0, 900));
      return;
    }
    const data = (r.data ?? {}) as Record<string, unknown>;
    const lines = Array.isArray(data.nameStatusLines)
      ? data.nameStatusLines.filter((x): x is string => typeof x === "string")
      : [];
    const html = renderDrawerFormHtml(
      buildViewCheckpointCompareDrawerSpec({
        checkpointId,
        refKind: typeof data.refKind === "string" ? data.refKind : "head",
        compareFrom: typeof data.compareFrom === "string" ? data.compareFrom : "",
        compareTo: typeof data.compareTo === "string" ? data.compareTo : "",
        nameStatusLines: lines
      })
    );
    this.dashboardDrawerSession = { kind: "view-checkpoint-compare" };
    await this.postWcDrawerOpen(html);
  }

  private async onAddPhaseNote(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const phaseKey = this.inferPhaseKeyForKitPhaseNoteFromDashboard();
    if (!phaseKey) {
      await vscode.window.showErrorMessage(
        "Could not resolve the current phase. Refresh the dashboard and try again."
      );
      return;
    }
    const html = renderDrawerFormHtml(buildAddPhaseNoteDrawerSpec(phaseKey));
    this.dashboardDrawerSession = { kind: "add-phase-note" };
    await this.postWcDrawerOpen(html);
  }

  private async onConvertPhaseNote(noteId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildConvertPhaseNoteDrawerSpec(noteId));
    this.dashboardDrawerSession = { kind: "convert-phase-note", noteId };
    await this.postWcDrawerOpen(html);
  }

  private async onPersistPhaseNoteProposals(): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const html = renderDrawerFormHtml(buildPersistPhaseNoteProposalsDrawerSpec());
    this.dashboardDrawerSession = { kind: "persist-phase-note-proposals" };
    await this.postWcDrawerOpen(html);
  }

  /** Proposed-row Accept → drawer (phase) → run-transition accept → assign-task-phase. */
  private async onDashboardAcceptProposed(taskId: string): Promise<void> {
    if (this.dashboardDrawerSession) {
      return;
    }
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const defaultPhaseKey = data ? lookupProposedTaskPhaseKey(data, taskId) : undefined;
    const html = renderDrawerFormHtml(
      buildAcceptProposedDrawerSpec({
        taskIds: [taskId],
        categoryLabel: "",
        suggestions,
        defaultPhaseKey: defaultPhaseKey || undefined
      })
    );
    this.dashboardDrawerSession = { kind: "accept-proposed", taskIds: [taskId], categoryLabel: "" };
    this.drawerSessionHost?.open("accept-proposed");
    await this.postWcDrawerOpen(html);
  }

  private async onDashboardAcceptProposedBatch(
    taskIds: string[],
    categoryLabel: string,
    defaultPhaseKey?: string
  ): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    if (this.dashboardDrawerSession) {
      return;
    }
    const data = this.lastDashboardSummaryData;
    const suggestions = data ? collectPhaseKeySuggestions(data) : [];
    const html = renderDrawerFormHtml(
      buildAcceptProposedDrawerSpec({
        taskIds,
        categoryLabel,
        suggestions,
        defaultPhaseKey
      })
    );
    this.dashboardDrawerSession = { kind: "accept-proposed", taskIds, categoryLabel };
    this.drawerSessionHost?.open("accept-proposed");
    await this.postWcDrawerOpen(html);
  }

  private schedulePushUpdate(_delayMs: number): void {
    if (!this.view) {
      return;
    }
    this.refreshController.request({ reason: "schedule" });
  }

  private isDashboardRefreshDeferred(): boolean {
    return (
      this.refreshController.isSuppressed() ||
      this.dashboardCoordinator?.isMutationActive() === true ||
      this.dashboardInteractionLocks.size > 0
    );
  }

  private setDashboardRefreshBusy(busy: boolean): void {
    this.dashboardRefreshBusy = busy;
    this.dashboardCoordinator?.emitSnapshot();
  }

  private setDashboardUiInteraction(source: string, active: boolean): void {
    if (active) {
      this.dashboardInteractionLocks.add(source);
    } else {
      this.dashboardInteractionLocks.delete(source);
    }
    if (this.dashboardInteractionLocks.size === 0) {
      this.refreshController.onDeferredCleared();
    }
  }

  private async executeDashboardRefresh(
    mode: DashboardRefreshMode,
    updateSequence: number
  ): Promise<void> {
    const activeView = this.view;
    if (!activeView) {
      return;
    }
    if (this.shouldSkipDashboardKitRefresh()) {
      this.refreshController.markDeferredRefreshNeeded();
      return;
    }
    // Pre-hydrate refreshes must not run a parallel full paint — sole owner is startup controller.
    if (!this.dashboardRootHydrated) {
      await this.requestDashboardStartup("push-update-fallback");
      return;
    }
    const { webview } = activeView;
    const lightRefresh = mode === "light";
    const refreshOptions = this.pendingPushUpdateOptions;
    this.pendingPushUpdateOptions = undefined;
    const summaryProjection = refreshOptions?.projection ?? "overview";
    const summarySource =
      refreshOptions?.source ??
      (lightRefresh ? "kit-state refresh" : "overview refresh");
    const skipHeavyFetches = refreshOptions?.skipHeavyFetches === true;
    if (this.isDashboardRefreshDeferred()) {
      this.refreshController.markDeferredRefreshNeeded();
      this.dashboardCoordinator?.emitSnapshot();
      logWc("dashboard", "pushUpdate deferred (UI interaction lock active)");
      return;
    }
    if (lightRefresh) {
      await this.executeLightSectionRefresh(updateSequence);
      return;
    }
    this.setDashboardRefreshBusy(true);
    try {
    const requestedWishlistPage = this.wishlistPage;
    const startedAt = Date.now();
    logWc(
      "dashboard",
      `pushUpdate START light=${String(lightRefresh)} projection=${summaryProjection} skipHeavy=${String(skipHeavyFetches)} page=${String(requestedWishlistPage)} seq=${String(updateSequence)}`
    );
    let raw: DashboardSummaryCommandSuccess | Record<string, unknown>;
    try {
      raw = (await this.runDashboardSummary({
        projection: summaryProjection
      }, summarySource)) as DashboardSummaryCommandSuccess | Record<string, unknown>;
      if (isKitRefreshRunAborted(raw as Record<string, unknown>)) {
        logWc("dashboard", "pushUpdate aborted (refresh paused or preempted)");
        return;
      }
      if (isWishlistPagingArgRejection(raw as Record<string, unknown>)) {
        logWc("dashboard", "pushUpdate: dashboard-summary rejected wishlist paging; retrying without paging");
        this.wishlistPage = 0;
        raw = (await this.runDashboardSummary(
          { projection: summaryProjection },
          `${summarySource} retry`
        )) as DashboardSummaryCommandSuccess | Record<string, unknown>;
        if (isKitRefreshRunAborted(raw as Record<string, unknown>)) {
          logWc("dashboard", "pushUpdate aborted (refresh paused or preempted)");
          return;
        }
      }
    } catch (e) {
      raw = {
        ok: false,
        code: "extension-push-error",
        message: e instanceof Error ? e.message : String(e)
      };
    }
    if (this.isPushUpdateStale(updateSequence, activeView)) {
      logWc(
        "dashboard",
        `pushUpdate: stale dashboard-summary ignored page=${String(requestedWishlistPage)} seq=${String(updateSequence)}`
      );
      return;
    }
    let phaseJournal: DashboardPhaseJournalBundle | undefined;
    let embeddedCaePanelHtml: string | null = null;
    if (raw.ok === true && raw.data && typeof raw.data === "object") {
      const prior = this.lastDashboardSummaryData ?? {};
      const ingestProjection =
        summaryProjection === "full"
          ? "full"
          : summaryProjection === "overview"
            ? "overview"
            : summaryProjection;
      this.lastDashboardSummaryData = mergeDashboardProjectionIntoSummary(
        prior,
        ingestProjection,
        raw.data as Record<string, unknown>
      );
      this.lastQueueContentFingerprint = computeQueueContentFingerprint(
        this.lastDashboardSummaryData
      );
      ingestPlanningMetaFromData(raw.data as Record<string, unknown>);
      this.ingestDashboardSummaryIntoStore(
        raw.data as Record<string, unknown>,
        ingestProjection === "full" ? "overview" : ingestProjection
      );
      try {
        if (lightRefresh) {
          embeddedCaePanelHtml = this.lastEmbeddedCaePanelHtml;
          phaseJournal = undefined;
        } else if (skipHeavyFetches) {
          embeddedCaePanelHtml = null;
          phaseJournal = undefined;
        } else if (this.summaryHasCanonicalWorkspacePhase(raw.data)) {
          if (this.isPushUpdateStale(updateSequence, activeView)) {
            return;
          }
          const [lp, gpc, caeSummary] = (await Promise.all([
            this.client.run("list-phase-notes", {
              ...expectedPlanningGenerationArgs()
            }),
            this.client.run("get-phase-context", {
              ...expectedPlanningGenerationArgs()
            }),
            this.client.run("cae-authoring-summary", { schemaVersion: 1 })
          ])) as [
            PhaseJournalKitPayload & Record<string, unknown>,
            PhaseJournalKitPayload & Record<string, unknown>,
            Record<string, unknown>
          ];
          if (
            isKitRefreshRunAborted(lp as Record<string, unknown>) ||
            isKitRefreshRunAborted(gpc as Record<string, unknown>) ||
            isKitRefreshRunAborted(caeSummary as Record<string, unknown>) ||
            this.isPushUpdateStale(updateSequence, activeView)
          ) {
            logWc("dashboard", "pushUpdate aborted during phase journal fetch");
            return;
          }
          ingestPlanningMetaFromData(lp.data as Record<string, unknown> | undefined);
          ingestPlanningMetaFromData(gpc.data as Record<string, unknown> | undefined);
          embeddedCaePanelHtml = renderGuidanceAuthoringPanelInnerHtml(caeSummary, { host: "dashboard" });
          this.lastEmbeddedCaePanelHtml = embeddedCaePanelHtml;

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
        } else {
          if (this.isPushUpdateStale(updateSequence, activeView)) {
            return;
          }
          const caeSummary = await this.client.run("cae-authoring-summary", { schemaVersion: 1 });
          if (isKitRefreshRunAborted(caeSummary as Record<string, unknown>) || this.isPushUpdateStale(updateSequence, activeView)) {
            logWc("dashboard", "pushUpdate aborted during CAE fetch (no workspace phase)");
            return;
          }
          embeddedCaePanelHtml = renderGuidanceAuthoringPanelInnerHtml(caeSummary, { host: "dashboard" });
          this.lastEmbeddedCaePanelHtml = embeddedCaePanelHtml;
        }
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
    } else if (this.dashboardRootHydrated) {
      const message = String(raw.message ?? raw.code ?? "dashboard-summary failed");
      logWc("dashboard", `pushUpdate preserving last good dashboard after failure code=${String(raw.code ?? "")}`);
      for (const section of DASHBOARD_SECTION_REGISTRY) {
        this.staleDashboardSections.add(section.id);
        await this.postSectionPatch(section.id, "", "stale");
      }
      await webview.postMessage({
        type: "dashboardStartupError",
        message: `Dashboard refresh failed; keeping the last loaded dashboard. ${message}`
      });
      return;
    } else {
      this.lastDashboardSummaryData = null;
    }
    if (this.isPushUpdateStale(updateSequence, activeView)) {
      logWc("dashboard", `pushUpdate: stale phase context ignored page=${String(requestedWishlistPage)}`);
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
    const useDeferredSecondary = skipHeavyFetches && summaryProjection === "overview";
    try {
      const editorIntegration = await resolveEditorIntegrationState();
      rootInner = renderDashboardRootInnerHtml(
        this.dashboardRenderPayload(raw),
        wizardPanel,
        editorIntegration,
        phaseJournal,
        embeddedCaePanelHtml,
        this.dashboardRenderRootOptions(
          useDeferredSecondary
            ? {
                deferredSections: new Set<DashboardSectionId>([
                  "status",
                  "config",
                  "cae",
                  "phase-journal"
                ])
              }
            : undefined
        )
      );
      if (useDeferredSecondary) {
        this.hydratedDashboardSections.clear();
        this.hydratedDashboardSections.add("overview");
        for (const section of DASHBOARD_SECTION_REGISTRY) {
          if (section.tabId === "planning" && section.refreshPolicy === "eager") {
            this.hydratedDashboardSections.add(section.id);
          }
        }
      } else {
        this.hydratedDashboardSections = new Set(
          DASHBOARD_SECTION_REGISTRY.map((section) => section.id)
        );
      }
    } catch (e) {
      rootInner = '<pre class="bad">Host render error: ' + escapeHtml(String(e)) + "</pre>";
    }
    logWc(
      "dashboard",
      `pushUpdate DONE ok=${String(raw.ok)} code=${String(raw.code ?? "")} htmlBytes≈${String(rootInner.length)} elapsedMs=${String(Date.now() - startedAt)}`
    );
    if (this.isPushUpdateStale(updateSequence, activeView)) {
      logWc("dashboard", `pushUpdate: stale render ignored page=${String(requestedWishlistPage)}`);
      return;
    }
    try {
      if (!this.dashboardRootHydrated) {
        await this.postReplaceRootHtml(webview, rootInner, "push-update-first");
        logWc("dashboard", "pushUpdate applied first root patch over shell");
        this.markDashboardRootHydrated();
        if (useDeferredSecondary) {
          logWc("dashboard", "pushUpdate deferred secondary hydration: queue/status/full not launched");
        }
        return;
      }
      // Full-root refresh stays the compatibility path while section slices land (T100396+).
      await this.postReplaceRootHtml(webview, rootInner, "push-update");
      if (useDeferredSecondary) {
        logWc("dashboard", "pushUpdate deferred secondary hydration: queue/status/full not launched");
      }
    } catch (e) {
      logWc("dashboard", `pushUpdate render failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    } finally {
      this.setDashboardRefreshBusy(false);
    }
  }

  /** Debounced config catalog reload (workspace-kit config.json changes — not task-store churn). */
  scheduleConfigTabRefresh(): void {
    if (!this.view) {
      return;
    }
    if (this.configTabRefreshTimer) {
      clearTimeout(this.configTabRefreshTimer);
    }
    this.configTabRefreshTimer = setTimeout(() => {
      this.configTabRefreshTimer = undefined;
      void this.refreshDashboardConfigTab(this.view!.webview);
    }, 800);
  }

  private async refreshDashboardConfigTab(webview: vscode.Webview): Promise<void> {
    try {
      await webview.postMessage({ type: "poke" });
    } catch {
      /* webview may be disposed */
    }
  }

  private async handleConfigWebviewMessage(
    webview: vscode.Webview,
    msg: Record<string, unknown>
  ): Promise<boolean> {
    if (msg?.type === "load") {
      await pushConfigListToWebview(this.client, webview, Boolean(msg.includeAll));
      return true;
    }
    if (msg?.type === "explain" && typeof msg.key === "string") {
      await handleConfigExplainMessage(this.client, webview, msg.key);
      return true;
    }
    if (msg?.type === "validateKey" && typeof msg.key === "string" && typeof msg.value === "string") {
      const includeAll = Boolean(msg.includeAll);
      const editorKind = typeof msg.editorKind === "string" ? msg.editorKind.trim() : undefined;
      const seq = typeof msg.seq === "number" ? msg.seq : undefined;
      await handleConfigValidateKeyMessage(
        this.client,
        webview,
        msg.key,
        msg.value,
        includeAll,
        editorKind,
        seq
      );
      return true;
    }
    if (msg?.type === "validate") {
      const r = await this.client.config(["validate"]);
      await webview.postMessage({
        type: "validateResult",
        payload: { code: r.code, text: r.stdout + (r.stderr ? "\n" + r.stderr : "") }
      });
      return true;
    }
    if (msg?.type === "reloadWindow") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
      return true;
    }
    if (msg?.type === "set" && typeof msg.key === "string" && typeof msg.value === "string") {
      const includeAll = Boolean(msg.reloadIncludeAll);
      const scope = msg.scope === "user" ? "user" : "project";
      const editorKind = typeof msg.editorKind === "string" ? msg.editorKind.trim() : undefined;
      await handleConfigSetMessage(
        this.client,
        webview,
        msg.key.trim(),
        msg.value,
        scope,
        includeAll,
        editorKind
      );
      return true;
    }
    if (msg?.type === "unset" && typeof msg.key === "string") {
      const includeAll = Boolean(msg.reloadIncludeAll);
      const scope = msg.scope === "user" ? "user" : "project";
      await handleConfigUnsetMessage(this.client, webview, msg.key.trim(), scope, includeAll);
      return true;
    }
    return false;
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

    const embeddedCaeBootstrapSource = JSON.stringify(
      buildGuidanceAuthoringWebviewBootstrap("dash-cae-")
    );

    const bootstrap = buildDashboardWebviewBootstrapScript(embeddedCaeBootstrapSource);
    const mermaidScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "mermaid.min.js")
    );
    const startupProbe = `(function(){
  var vscode = window.__wfcVscode || (window.__wfcVscode = acquireVsCodeApi());
  var startupTimeoutCancelled = false;
  var startupTimeoutId = null;
  function cancelStartupTimeout() {
    startupTimeoutCancelled = true;
    if (startupTimeoutId) {
      clearTimeout(startupTimeoutId);
      startupTimeoutId = null;
    }
  }
  window.addEventListener('message', function(ev){
    var msg = ev.data || {};
    if (msg.type === 'dashboardStartupAck' || msg.type === 'wcReplaceRoot') {
      cancelStartupTimeout();
      return;
    }
    if (msg.type !== 'dashboardStartupError') return;
    var status = document.querySelector('[data-wc-startup-status]');
    if (status) {
      status.textContent = msg.message || 'Dashboard refresh failed.';
      status.removeAttribute('hidden');
    }
    var btn = document.querySelector('[data-wc-startup-refresh]');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  });
  try { vscode.postMessage({ type: 'dashboardWebviewBoot' }); } catch (e) {}
  startupTimeoutId = setTimeout(function(){
    startupTimeoutId = null;
    if (startupTimeoutCancelled) return;
    var root = document.getElementById('root');
    if (!root) return;
    var first = root.firstElementChild;
    var shell = !!(first && first.classList && first.classList.contains('wc-dashboard-shell-initial'));
    if (!shell) return;
    // Section patches can fill the shell without clearing shell-initial. Do not wipe
    // a dashboard that already has ready content — ask the host to re-send root HTML.
    var hasReadySection = !!root.querySelector('.wc-dash-section--ready, [data-wc-section-refreshing]');
    if (hasReadySection) {
      try {
        vscode.postMessage({
          type: 'dashboardStartupTimeout',
          rootClass: first.className || '',
          reason: 'shell-initial-with-ready-sections'
        });
      } catch (e) {}
      return;
    }
    root.innerHTML = '<section class="wc-card wc-dashboard-startup-timeout" role="status">' +
      '<h3>Dashboard is still loading</h3>' +
      '<p class="muted">Workflow Cannon started the webview, but the first data render did not replace the loading shell.</p>' +
      '<p class="muted" data-wc-startup-status hidden></p>' +
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-startup-refresh>Refresh</button>' +
      '</section>';
    var btn = root.querySelector('[data-wc-startup-refresh]');
    if (btn) {
      btn.addEventListener('click', function(){
        btn.disabled = true;
        btn.textContent = 'Refreshing...';
        try { vscode.postMessage({ type: 'dashboardStartupRefresh' }); } catch (e) {}
      });
    }
    try { vscode.postMessage({ type: 'dashboardStartupTimeout', rootClass: first.className || '' }); } catch (e) {}
  }, 8000);
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
    /* Workflow Cannon design tokens - dashboard */
    :root {
      --wc-accent: var(--vscode-button-background, #FF5F1F);
      --wc-accent-hover: var(--vscode-button-hoverBackground, #FF8A4C);
      --wc-fg: var(--vscode-foreground, #F0F0F0);
      --wc-muted: color-mix(in srgb, var(--vscode-foreground, #F0F0F0) 65%, transparent);
      --wc-border: var(--vscode-widget-border, rgba(127,127,127,.35));
      --wc-surface: var(--vscode-editor-background, #1A1A1A);
      --wc-bg: var(--vscode-sideBar-background, #0F0F0F);
      --wc-green: var(--vscode-testing-iconPassed, #4ec9b0);
      --wc-amber: var(--vscode-editorWarning-foreground, #cca700);
      --wc-red: var(--vscode-charts-red, #f44336);
      --wc-blue: var(--vscode-textLink-foreground, #4fc1ff);
      --wc-green-tint: color-mix(in srgb, var(--wc-green) 7%, transparent);
      --wc-amber-tint: color-mix(in srgb, var(--wc-amber) 7%, transparent);
      --wc-red-tint: color-mix(in srgb, var(--wc-red) 7%, transparent);
      --wc-blue-tint: color-mix(in srgb, var(--wc-blue) 7%, transparent);
      --wc-green-border: color-mix(in srgb, var(--wc-green) 20%, transparent);
      --wc-amber-border: color-mix(in srgb, var(--wc-amber) 20%, transparent);
      --wc-red-border: color-mix(in srgb, var(--wc-red) 20%, transparent);
      --wc-blue-border: color-mix(in srgb, var(--wc-blue) 20%, transparent);
    }
    @keyframes wc-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    html, body {
      margin: 0 !important;
      height: 100vh !important;
      overflow: hidden !important;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0 !important;
      font-size: 12px;
      display: flex;
      flex-direction: column;
    }
    #root {
      flex: 1 !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      overflow: hidden !important;
    }
    #root > *:first-child { margin-top: 0; }
    #root p { margin: 0 0 6px 0; }
    #root p:last-child { margin-bottom: 0; }
    .muted { opacity: 0.75; }
    .focus-md b { font-weight: 600; }
    pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; }
    button { cursor: pointer; }
    .dash-row-list { display: flex; flex-direction: column; gap: 3px; margin: 6px 0 8px 0; }
    .dash-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); position: relative; transition: background 0.12s; }
    .dash-row:hover { background: var(--vscode-list-hoverBackground, var(--vscode-textCodeBlock-background)); }
    /* Colored left status bars per section context */
    .status-section[data-wc-filter="ready"] .dash-row { border-left: 3px solid var(--vscode-testing-iconPassed, #4ec9b0); padding-left: 9px; }
    .status-section[data-wc-filter="proposed"] .dash-row { border-left: 3px solid var(--vscode-textLink-foreground, #4fc1ff); padding-left: 9px; }
    .status-section[data-wc-filter="blocked"] .dash-row { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); padding-left: 9px; }
    .status-section[data-wc-filter="human-gates"] .dash-row { border-left: 3px solid var(--vscode-charts-red, #f44336); padding-left: 9px; }
    .status-section[data-wc-filter="terminal"] .dash-row { border-left: 3px solid var(--vscode-foreground); padding-left: 9px; }
    .status-section[data-wc-filter="terminal"] .dash-row .dash-row-label { opacity: 0.55; }
    .status-section[data-wc-filter="research"] .dash-row { border-left: 3px solid var(--vscode-charts-purple, #b388ff); padding-left: 9px; }
    .dash-row-label { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.35; }
    .dash-row-actions { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; align-items: flex-start; transition: opacity 0.15s; }
    .dash-row .dash-row-actions { opacity: 0; }
    .dash-row:hover .dash-row-actions { opacity: 1; }
    .dash-row-actions.wc-task-actions {
      --wc-task-action-btn-w: 104px;
      display: grid;
      grid-template-columns: repeat(2, var(--wc-task-action-btn-w));
      gap: 4px;
      align-content: flex-start;
      width: calc(var(--wc-task-action-btn-w) * 2 + 4px);
      max-width: 100%;
    }
    .dash-row-actions.wc-task-actions.dash-row-actions-grid {
      grid-template-columns: repeat(2, var(--wc-task-action-btn-w));
      width: calc(var(--wc-task-action-btn-w) * 2 + 4px);
      justify-items: stretch;
      align-content: start;
    }
    .dash-row-actions.wc-task-actions > .wc-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--wc-task-action-btn-w);
      min-width: var(--wc-task-action-btn-w);
      max-width: var(--wc-task-action-btn-w);
      box-sizing: border-box;
      text-align: center;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
    }
    .wc-ideas-row {
      flex-wrap: wrap;
    }
    .wc-ideas-row .dash-row-label p {
      margin: 2px 0 0;
    }
    .wc-ideas-row .dash-row-actions {
      opacity: 1;
    }
    .wc-ideas-edit-form {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      flex-basis: 100%;
    }
    .wc-ideas-edit-form[hidden] {
      display: none;
    }
    .wc-ideas-toast {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      padding: 4px 6px;
      margin: 6px 0 8px;
      border-radius: 4px;
      background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.10));
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
    }
    .wc-ideas-toast[hidden] {
      display: none;
    }
    .wc-ideas-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .wc-ideas-head p {
      margin: 0;
    }
    .wc-ideas-create-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .wc-ideas-row-status[data-wc-error="1"] {
      color: var(--vscode-errorForeground, #f44747);
      opacity: 1;
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
      font-size: 10px;
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
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
    }
    .dash-task-row-summary {
      display: inline;
      font-size: 11px;
      line-height: 1.3;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
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
      text-transform: none;
      letter-spacing: normal;
    }
    .dash-phase-roster-th {
      font-variant: normal;
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-phase,
    .dash-phase-catalog-table td.dash-phase-roster-col-phase {
      width: 1%;
      white-space: nowrap;
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-status,
    .dash-phase-catalog-table td.dash-phase-roster-col-status {
      width: 1%;
      white-space: nowrap;
      vertical-align: middle;
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-deliverables,
    .dash-phase-catalog-table td.dash-phase-roster-col-deliverables {
      width: 100%;
    }
    .dash-phase-catalog-table th.dash-phase-roster-col-actions,
    .dash-phase-catalog-table td.dash-phase-roster-col-actions {
      width: 1%;
      white-space: nowrap;
      text-align: right;
      vertical-align: middle;
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
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      min-width: 0;
    }
    .dash-phase-deliverables-body {
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
      margin: 0;
    }
    .dash-phase-roster-start-spacer {
      visibility: hidden;
      pointer-events: none;
    }
    .dash-phase-roster-actions {
      display: inline-flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }
    .dash-phase-roster-phase-link {
      appearance: none;
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      font: inherit;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-align: left;
    }
    .dash-phase-roster-phase-link:hover code,
    .dash-phase-roster-phase-link:focus-visible code {
      text-decoration: underline;
    }
    .dash-phase-roster-phase-link code {
      color: inherit;
      background: transparent;
      padding: 0;
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      opacity: 0.9;
    }
    .dash-phase-saving[hidden] {
      display: none !important;
    }
    @keyframes wc-spin {
      to { transform: rotate(360deg); }
    }
    .wc-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-top-color: var(--vscode-button-background, #0078d4);
      border-radius: 50%;
      animation: wc-spin 0.75s linear infinite;
      flex-shrink: 0;
    }
    .wc-spinner-inline {
      width: 12px;
      height: 12px;
      border-width: 2px;
    }
    .wc-btn-loading {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .wc-drawer-panel--busy .wc-drawer-fields,
    .wc-drawer-panel--busy .wc-drawer-footer,
    .wc-drawer-panel--busy .wc-drawer-header {
      pointer-events: none;
      opacity: 0.45;
    }
    .wc-drawer-loading {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
      backdrop-filter: blur(1px);
    }
    .wc-drawer-loading[hidden] { display: none !important; }
    .wc-drawer-loading-label {
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      line-height: 1.35;
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
    .dash-status-mcp .dash-mcp-status--embedded {
      margin-top: 0;
    }
    .wc-mcp-pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      vertical-align: middle;
    }
    .wc-mcp-pill--available,
    .wc-mcp-pill--mcp-first {
      background: color-mix(in srgb, var(--vscode-testing-iconPassed) 18%, transparent);
    }
    .wc-mcp-pill--wrong,
    .wc-mcp-pill--unavailable {
      background: color-mix(in srgb, var(--vscode-testing-iconFailed) 15%, transparent);
    }
    .wc-mcp-pill--not-configured,
    .wc-mcp-pill--cli-fallback {
      background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 12%, transparent);
    }
    .wc-mcp-guidance {
      margin: 8px 0 0 18px;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
    }
    .wc-mcp-setup-details summary {
      cursor: pointer;
      font-size: 11px;
      margin-top: 8px;
    }
    .wc-mcp-setup-snippet {
      margin: 8px 0 0;
      padding: 8px;
      font-size: 10px;
      overflow-x: auto;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,.12));
    }
    .wc-header-sticky {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .wc-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 6px 12px;
      border-top: 2px solid var(--wc-accent);
      border-bottom: 1px solid var(--wc-border);
      border-radius: 0 0 6px 6px;
      background: var(--wc-surface);
      transition: background 0.5s ease;
    }
    .wc-banner[data-agent-status-kind="active"],
    .wc-banner[data-agent-status-kind="running"],
    .wc-banner[data-agent-status-kind="in_progress"] {
      background: linear-gradient(135deg, var(--wc-green-tint) 0%, var(--wc-surface) 60%);
    }
    .wc-banner[data-agent-status-kind="waiting"],
    .wc-banner[data-agent-status-kind="awaiting_input"],
    .wc-banner[data-agent-status-kind="in_review"] {
      background: linear-gradient(135deg, var(--wc-amber-tint) 0%, var(--wc-surface) 60%);
    }
    .wc-banner[data-agent-status-kind="blocked"],
    .wc-banner[data-agent-status-kind="error"] {
      background: linear-gradient(135deg, var(--wc-red-tint) 0%, var(--wc-surface) 60%);
    }
    .wc-banner[data-agent-status-kind="done"],
    .wc-banner[data-agent-status-kind="complete"],
    .wc-banner[data-agent-status-kind="released"] {
      background: linear-gradient(135deg, var(--wc-blue-tint) 0%, var(--wc-surface) 60%);
    }
    .wc-banner[data-agent-status-kind="idle"],
    .wc-banner[data-agent-status-kind="awaiting_instruction"] {
      background: var(--wc-surface);
    }
    .wc-banner-mark { flex-shrink: 0; width: 28px; height: 28px; opacity: 0.95; }
    .wc-banner-identity {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .wc-banner-name {
      font-size: 13px;
      font-weight: 800;
      color: var(--wc-fg);
      line-height: 1;
    }
    .wc-banner-tagline {
      font-size: 10px;
      font-weight: 500;
      color: var(--wc-muted);
      letter-spacing: 0.04em;
      line-height: 1;
    }
    .wc-banner-divider {
      width: 1px;
      height: 32px;
      background: var(--wc-border);
      flex-shrink: 0;
    }
    .wc-banner-status {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .wc-banner-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wc-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wc-status-dot--active,
    .wc-status-dot--running {
      background: var(--vscode-testing-iconPassed, #4ec9b0);
      box-shadow: 0 0 5px var(--vscode-testing-iconPassed, #4ec9b0);
      animation: wc-pulse 1.6s ease-in-out infinite;
    }
    .wc-status-dot--waiting { background: var(--vscode-editorWarning-foreground, #cca700); box-shadow: 0 0 5px var(--vscode-editorWarning-foreground, #cca700); }
    .wc-status-dot--blocked { background: var(--vscode-charts-red, #f44336); box-shadow: 0 0 5px var(--vscode-charts-red, #f44336); }
    .wc-status-dot--idle { background: var(--vscode-descriptionForeground); }
    .wc-status-dot--done { background: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-banner-status-label {
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }
    .wc-banner-status-label--active,
    .wc-banner-status-label--running { color: var(--wc-green); }
    .wc-banner-status-label--waiting { color: var(--wc-amber); }
    .wc-banner-status-label--blocked { color: var(--wc-red); }
    .wc-banner-status-label--idle { color: var(--wc-muted); }
    .wc-banner-status-label--done { color: var(--wc-blue); }
    .wc-banner-task {
      font-size: 11px;
      color: var(--wc-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }
    .wc-banner-agent-profile {
      display: block;
      font-size: 10px;
      color: var(--wc-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
      margin-top: 2px;
    }
    .dash-agent-status-banner,
    .wc-agent-board,
    .dash-agent-activity-section {
      width: 100% !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
    }
    .dash-agent-status-banner {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 8px;
      padding: 10px 10px 8px;
      margin: 0 0 10px 0;
      background: var(--vscode-textCodeBlock-background);
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .dash-agent-status-banner p { margin: 0; line-height: 1.35; }
    .dash-agent-status-label { overflow-wrap: anywhere; }
    .wc-agent-board-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .wc-agent-board-title { font-size: 11px; }
    .wc-agent-board-meta { font-size: 10px; color: var(--vscode-descriptionForeground); margin-left: auto; }
    .dash-agent-row-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .dash-agent-row { padding: 4px 5px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); transition: background 0.12s; }
    .dash-agent-row:hover { background: var(--vscode-list-hoverBackground, var(--vscode-textCodeBlock-background)); }
    .dash-agent-row:not(details), .dash-agent-row-summary { display: grid; grid-template-columns: auto minmax(92px, 1.2fr) minmax(92px, 1fr) minmax(70px, auto); gap: 6px; align-items: center; }
    .dash-agent-row-summary { cursor: pointer; list-style: none; }
    .dash-agent-row-summary::-webkit-details-marker { display: none; }
    .dash-agent-row[open] .dash-agent-row-summary { padding-bottom: 4px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25)); }
    .dash-agent-row-details { padding: 5px 0 1px 16px; }
    .dash-agent-row-expanded { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 4px 8px; margin: 0; font-size: 11px; }
    .dash-agent-row-expanded div { min-width: 0; }
    .dash-agent-row-expanded dt { color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.25; }
    .dash-agent-row-expanded dd { margin: 0; overflow-wrap: anywhere; line-height: 1.25; }
    .dash-agent-row--subagent { margin-left: 14px; border-left: 2px solid var(--vscode-textLink-foreground); }
    .dash-agent-row-icon { font-size: 10px; }
    .dash-agent-row-main { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
    .dash-agent-row-main b, .dash-agent-row-detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dash-agent-row-detail { min-width: 0; font-size: 11px; }
    .dash-agent-row-meta { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; min-width: 0; font-size: 10px; }
    .dash-agent-row-chip { display: inline-flex; align-items: center; padding: 1px 5px; border-radius: 6px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); background: var(--vscode-sideBar-background); font-size: 10px; line-height: 1.3; }
    .dash-agent-row-chip-sub { color: var(--vscode-textLink-foreground); }
    .wc-agent-section-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0 5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wc-agent-section-label span { margin-left: auto; font-size: 10px; color: var(--vscode-descriptionForeground); }
    .wc-agent-card {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 8px;
      border: 1px solid var(--wc-border);
      background: var(--wc-surface);
      transition: border-color 0.3s, background 0.3s;
    }
    .wc-agent-tree-row {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      gap: 6px;
      padding: 6px 8px !important;
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15));
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2));
      border-radius: 4px;
      margin-top: 4px;
    }
    .wc-agent-card[data-status="active"],
    .wc-agent-card[data-status="running"],
    .wc-agent-card[data-status="in_progress"] {
      border-color: var(--wc-green-border);
      background: linear-gradient(160deg, var(--wc-green-tint) 0%, var(--wc-surface) 50%);
    }
    .wc-agent-card[data-status="waiting"],
    .wc-agent-card[data-status="awaiting_input"],
    .wc-agent-card[data-status="in_review"] {
      border-color: var(--wc-amber-border);
      background: linear-gradient(160deg, var(--wc-amber-tint) 0%, var(--wc-surface) 50%);
    }
    .wc-agent-card[data-status="blocked"],
    .wc-agent-card[data-status="error"] {
      border-color: var(--wc-red-border);
      background: linear-gradient(160deg, var(--wc-red-tint) 0%, var(--wc-surface) 50%);
    }
    .wc-agent-card[data-status="done"],
    .wc-agent-card[data-status="complete"],
    .wc-agent-card[data-status="released"] {
      border-color: var(--wc-blue-border);
      background: linear-gradient(160deg, var(--wc-blue-tint) 0%, var(--wc-surface) 50%);
    }
    .wc-agent-card-bar {
      height: 2px;
      background: linear-gradient(90deg, var(--wc-bar-color, var(--wc-muted)) 0%, transparent 100%);
    }
    .wc-agent-card[data-status="active"] .wc-agent-card-bar,
    .wc-agent-card[data-status="running"] .wc-agent-card-bar,
    .wc-agent-card[data-status="in_progress"] .wc-agent-card-bar { --wc-bar-color: var(--wc-green); }
    .wc-agent-card[data-status="waiting"] .wc-agent-card-bar,
    .wc-agent-card[data-status="awaiting_input"] .wc-agent-card-bar,
    .wc-agent-card[data-status="in_review"] .wc-agent-card-bar { --wc-bar-color: var(--wc-amber); }
    .wc-agent-card[data-status="blocked"] .wc-agent-card-bar,
    .wc-agent-card[data-status="error"] .wc-agent-card-bar { --wc-bar-color: var(--wc-red); }
    .wc-agent-card[data-status="done"] .wc-agent-card-bar,
    .wc-agent-card[data-status="complete"] .wc-agent-card-bar,
    .wc-agent-card[data-status="released"] .wc-agent-card-bar { --wc-bar-color: var(--wc-blue); }
    .wc-agent-card-header {
      padding: 8px 10px;
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      gap: 6px;
      cursor: pointer;
    }
    .wc-agent-card-header--no-expand { cursor: default; }
    .wc-agent-card-row1 {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .wc-agent-card-name {
      font-size: 11px;
      font-weight: 700;
      color: var(--wc-fg);
      flex: 1 !important;
      min-width: 0 !important;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wc-agent-card-status-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .wc-agent-card[data-status="active"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="running"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="in_progress"] .wc-agent-card-status-chip { background: var(--wc-green-tint); color: var(--wc-green); }
    .wc-agent-card[data-status="waiting"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="awaiting_input"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="in_review"] .wc-agent-card-status-chip { background: var(--wc-amber-tint); color: var(--wc-amber); }
    .wc-agent-card[data-status="blocked"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="error"] .wc-agent-card-status-chip { background: var(--wc-red-tint); color: var(--wc-red); }
    .wc-agent-card[data-status="done"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="complete"] .wc-agent-card-status-chip,
    .wc-agent-card[data-status="released"] .wc-agent-card-status-chip { background: var(--wc-blue-tint); color: var(--wc-blue); }
    .wc-agent-card[data-status="idle"] .wc-agent-card-status-chip { background: var(--vscode-textCodeBlock-background); color: var(--vscode-descriptionForeground); }
    .wc-agent-card-role {
      font-size: 8.5px;
      font-weight: 500;
      color: var(--wc-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .wc-agent-card-profile {
      font-size: 10px;
      line-height: 1.35;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }
    .wc-agent-card-profile-label {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
    }
    .wc-agent-card-chevron {
      font-size: 10px;
      color: var(--wc-muted);
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .wc-agent-card--expanded .wc-agent-card-chevron { transform: rotate(90deg); }
    .wc-agent-card:not(.wc-agent-card--expanded) .wc-agent-tree { display: none; }
    .wc-agent-card-now {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15));
      border-radius: 4px;
      padding: 5px 8px;
      border-left: 2px solid var(--wc-now-color, var(--wc-muted));
      width: 100% !important;
      box-sizing: border-box !important;
      white-space: normal !important;
      word-break: break-word !important;
    }
    .wc-agent-card[data-status="active"] .wc-agent-card-now,
    .wc-agent-card[data-status="running"] .wc-agent-card-now,
    .wc-agent-card[data-status="in_progress"] .wc-agent-card-now { --wc-now-color: var(--wc-green); }
    .wc-agent-card[data-status="waiting"] .wc-agent-card-now,
    .wc-agent-card[data-status="awaiting_input"] .wc-agent-card-now,
    .wc-agent-card[data-status="in_review"] .wc-agent-card-now { --wc-now-color: var(--wc-amber); }
    .wc-agent-card[data-status="blocked"] .wc-agent-card-now,
    .wc-agent-card[data-status="error"] .wc-agent-card-now { --wc-now-color: var(--wc-red); }
    .wc-agent-card-now-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--wc-muted);
      margin-bottom: 2px;
    }
    .wc-agent-card-now-text {
      font-size: 11px;
      font-weight: 500;
      color: var(--wc-fg);
      line-height: 1.35;
    }
    .wc-agent-card-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .wc-agent-card-task {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      margin-top: 2px;
    }
    .wc-agent-card-task-chip {
      font-size: 10px;
      font-weight: 600;
      color: var(--wc-accent);
      background: color-mix(in srgb, var(--wc-accent) 10%, transparent);
      padding: 1px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wc-agent-card-task-title {
      font-size: 10px;
      color: var(--wc-muted);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wc-agent-card-timing {
      font-size: 10px;
      color: var(--wc-muted);
      white-space: nowrap;
    }
    .wc-agent-card-sub-count {
      font-size: 10px;
      color: var(--wc-muted);
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 5px;
      border-radius: 999px;
      border: 1px solid var(--wc-border);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wc-agent-tree {
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
      padding: 4px 10px 8px 16px;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .wc-agent-tree[hidden] { display: none !important; }
    .wc-agent-tree-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--wc-muted);
      margin-bottom: 4px;
      padding-left: 8px;
    }
    .wc-agent-sub-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      position: relative;
    }
    .wc-agent-sub-row::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--wc-border);
    }
    .wc-agent-sub-row:last-child::before { bottom: 50%; }
    .wc-agent-sub-row::after {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 8px;
      height: 1px;
      background: var(--wc-border);
    }
    .wc-agent-sub-inner {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--wc-border);
      border-radius: 6px;
      padding: 4px 8px;
      min-width: 0;
      transition: border-color 0.3s;
    }
    .wc-agent-sub-inner[data-status="active"],
    .wc-agent-sub-inner[data-status="running"],
    .wc-agent-sub-inner[data-status="in_progress"] { border-color: var(--wc-green-border); }
    .wc-agent-sub-inner[data-status="waiting"],
    .wc-agent-sub-inner[data-status="awaiting_input"],
    .wc-agent-sub-inner[data-status="in_review"] { border-color: var(--wc-amber-border); }
    .wc-agent-sub-inner[data-status="blocked"],
    .wc-agent-sub-inner[data-status="error"] { border-color: var(--wc-red-border); }
    .wc-agent-sub-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--wc-fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .wc-agent-sub-chip {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 999px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wc-agent-sub-chip[data-status="active"],
    .wc-agent-sub-chip[data-status="running"],
    .wc-agent-sub-chip[data-status="in_progress"] { background: var(--wc-green-tint); color: var(--wc-green); }
    .wc-agent-sub-chip[data-status="waiting"],
    .wc-agent-sub-chip[data-status="awaiting_input"],
    .wc-agent-sub-chip[data-status="in_review"] { background: var(--wc-amber-tint); color: var(--wc-amber); }
    .wc-agent-sub-chip[data-status="blocked"],
    .wc-agent-sub-chip[data-status="error"] { background: var(--wc-red-tint); color: var(--wc-red); }
    .wc-agent-sub-chip[data-status="idle"] { background: var(--vscode-textCodeBlock-background); color: var(--vscode-descriptionForeground); }
    .wc-agent-sub-meta {
      font-size: 10px;
      color: var(--wc-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wc-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
    .wc-dot--active,
    .wc-dot--running,
    .wc-dot--in_progress {
      background: var(--wc-green);
      box-shadow: 0 0 5px var(--wc-green);
      animation: wc-pulse 1.6s ease-in-out infinite;
    }
    .wc-dot--waiting,
    .wc-dot--awaiting_input,
    .wc-dot--in_review { background: var(--wc-amber); box-shadow: 0 0 4px var(--wc-amber); }
    .wc-dot--blocked,
    .wc-dot--error { background: var(--wc-red); box-shadow: 0 0 4px var(--wc-red); }
    .wc-dot--idle,
    .wc-dot--awaiting_instruction { background: var(--wc-muted); }
    .wc-dot--done,
    .wc-dot--complete,
    .wc-dot--released { background: var(--wc-blue); }
    .wc-agent-empty {
      background: var(--wc-surface);
      border: 1px solid var(--wc-border);
      border-radius: 6px;
      padding: 16px;
      text-align: center;
      margin-bottom: 8px;
    }
    .wc-agent-empty-icon {
      font-size: 15px;
      opacity: 0.40;
      margin-bottom: 6px;
      display: block;
    }
    .wc-agent-empty-msg { font-size: 11px; color: var(--wc-muted); }
    .wc-agent-empty-sub {
      font-size: 10px;
      color: var(--wc-muted);
      margin-top: 2px;
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
    .wc-plan-artifacts-section > p:first-child { margin: 0 0 10px 0; }
    .wc-plan-state-bucket { margin: 10px 0 0 0; }
    .wc-plan-state-bucket > summary {
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      font-weight: 600;
    }
    .wc-plan-state-bucket-body {
      margin: 8px 0 0 12px;
      padding-left: 16px;
      border-left: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
    }
    .wc-plan-title-group { margin: 0 0 10px 0; }
    .wc-plan-title-group > summary {
      cursor: pointer;
      user-select: none;
      margin: 0 0 6px 0;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
    }
    .wc-plan-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      margin-top: 4px;
    }
    .wc-plan-card-rollup-summary {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      list-style: none;
      cursor: pointer;
      user-select: none;
    }
    .wc-plan-card-rollup-summary::-webkit-details-marker { display: none; }
    .wc-plan-card-rollup-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .wc-plan-card-rollup-title { overflow-wrap: anywhere; }
    .wc-plan-card-rollup-subtitle {
      display: block;
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .wc-plan-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-left: 3px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      scroll-margin: 16px;
      transition: outline-color .2s ease;
    }
    .wc-plan-card.wc-plan-status-draft { border-left-color: var(--vscode-descriptionForeground, #888); }
    .wc-plan-card.wc-plan-status-warn { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-plan-card.wc-plan-status-info { border-left-color: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-plan-card.wc-plan-status-accent { border-left-color: var(--vscode-terminal-ansiCyan, #29b8db); }
    .wc-plan-card.wc-plan-status-done { border-left-color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-plan-card.wc-plan-status-muted { border-left-color: var(--vscode-widget-border, rgba(127,127,127,.35)); opacity: .82; }
    .wc-plan-card-highlight { outline: 2px solid var(--vscode-focusBorder, #4fc1ff); outline-offset: 2px; }
    .wc-queue-task-highlight {
      outline: 2px solid var(--vscode-focusBorder, #4fc1ff);
      outline-offset: 1px;
      background: color-mix(in srgb, var(--vscode-focusBorder, #4fc1ff) 12%, var(--vscode-textCodeBlock-background));
    }
    .wc-plan-lifecycle-chip { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); }
    .wc-plan-card-facts { margin: 0; font-size: 11px; }
    .wc-plan-card-facts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 12px;
      margin: 0 0 4px 0;
    }
    .wc-plan-card-facts-row:last-child { margin-bottom: 0; }
    .wc-plan-card-fact { display: grid; grid-template-columns: max-content 1fr; gap: 6px; align-items: baseline; min-width: 0; }
    .wc-plan-card-fact dt { margin: 0; color: var(--vscode-descriptionForeground, var(--vscode-foreground)); font-weight: 600; white-space: nowrap; }
    .wc-plan-card-fact dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .wc-plan-card-idea-chip {
      display: inline;
      margin-left: 4px;
      padding: 0;
      border: none;
      background: none;
      color: var(--vscode-textLink-foreground, #4fc1ff);
      font-size: 11px;
      cursor: pointer;
      text-decoration: underline;
    }
    .wc-plan-card-stats { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
    .wc-plan-card-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 5px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      background: var(--vscode-editor-background);
      font-size: 10px;
    }
    .wc-plan-card-chip-danger { color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
    .wc-plan-card-chip-warn { color: var(--vscode-editorWarning-foreground, #cca700); border-color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-plan-card-chip-pass { color: var(--vscode-testing-iconPassed, #4ec9b0); border-color: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-plan-card-chip-muted { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); }
    .wc-plan-card-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px; }
    .wc-plan-card-actions .wc-btn {
      transition: background-color 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
    }
    .wc-plan-card-actions .wc-btn:hover:not(:disabled) {
      filter: brightness(1.12);
      box-shadow: inset 0 0 0 1px var(--vscode-focusBorder, rgba(127, 127, 127, 0.45));
    }
    .wc-plan-card-actions .wc-btn:active:not(:disabled) {
      filter: brightness(0.96);
    }
    .wc-plan-card-wbs,
    .wc-plan-card-risks,
    .wc-plan-card-open-questions,
    .wc-plan-card-review-findings,
    .wc-plan-card-phase-recommendations,
    .wc-plan-card-goals,
    .wc-plan-card-non-goals,
    .wc-plan-card-assumptions,
    .wc-plan-card-user-stories,
    .wc-plan-card-value-rationale,
    .wc-plan-card-architecture-overview,
    .wc-plan-card-architecture-decisions,
    .wc-plan-card-architecture-diagrams,
    .wc-plan-card-technical-impact,
    .wc-plan-card-testing-strategy,
    .wc-plan-card-implementation-guidance,
    .wc-plan-card-what-not-to-do,
    .wc-plan-card-ui-ux,
    .wc-plan-card-approval,
    .wc-plan-card-execution-linkages,
    .wc-plan-card-details { margin-top: 2px; }
    .wc-plan-card-wbs summary,
    .wc-plan-card-risks summary,
    .wc-plan-card-open-questions summary,
    .wc-plan-card-review-findings summary,
    .wc-plan-card-phase-recommendations summary,
    .wc-plan-card-goals summary,
    .wc-plan-card-non-goals summary,
    .wc-plan-card-assumptions summary,
    .wc-plan-card-user-stories summary,
    .wc-plan-card-value-rationale summary,
    .wc-plan-card-architecture-overview summary,
    .wc-plan-card-architecture-decisions summary,
    .wc-plan-card-architecture-diagrams summary,
    .wc-plan-card-technical-impact summary,
    .wc-plan-card-testing-strategy summary,
    .wc-plan-card-implementation-guidance summary,
    .wc-plan-card-what-not-to-do summary,
    .wc-plan-card-ui-ux summary,
    .wc-plan-card-approval summary,
    .wc-plan-card-execution-linkages summary,
    .wc-plan-card-details summary { cursor: pointer; user-select: none; font-size: 11px; font-weight: 600; color: var(--vscode-foreground); }
    .wc-plan-wbs-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
      table-layout: auto;
    }
    .wc-plan-wbs-table th,
    .wc-plan-wbs-table td,
    .wc-plan-risk-table th,
    .wc-plan-risk-table td,
    .wc-plan-open-questions-table th,
    .wc-plan-open-questions-table td,
    .wc-plan-review-findings-table th,
    .wc-plan-review-findings-table td,
    .wc-plan-user-stories-table th,
    .wc-plan-user-stories-table td,
    .wc-plan-execution-linkages-table th,
    .wc-plan-execution-linkages-table td {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: auto;
    }
    .wc-plan-wbs-table th,
    .wc-plan-risk-table th,
    .wc-plan-open-questions-table th,
    .wc-plan-review-findings-table th,
    .wc-plan-user-stories-table th,
    .wc-plan-execution-linkages-table th {
      background: var(--vscode-editor-background);
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      font-weight: 600;
    }
    .wc-plan-wbs-table td:nth-child(1),
    .wc-plan-risk-table td:nth-child(1),
    .wc-plan-open-questions-table td:nth-child(1),
    .wc-plan-review-findings-table td:nth-child(1),
    .wc-plan-user-stories-table td:nth-child(1),
    .wc-plan-execution-linkages-table td:nth-child(1) { min-width: 6rem; }
    .wc-plan-wbs-table td:nth-child(2),
    .wc-plan-wbs-table td:nth-child(6),
    .wc-plan-wbs-table td:nth-child(7),
    .wc-plan-wbs-table td:nth-child(8),
    .wc-plan-wbs-table td:nth-child(9),
    .wc-plan-risk-table td:nth-child(2),
    .wc-plan-open-questions-table td:nth-child(2),
    .wc-plan-review-findings-table td:nth-child(2),
    .wc-plan-user-stories-table td:nth-child(3),
    .wc-plan-user-stories-table td:nth-child(4) { min-width: 10rem; }
    .wc-plan-wbs-table td:nth-child(10),
    .wc-plan-wbs-table td:nth-child(11),
    .wc-plan-execution-linkages-table td:nth-child(2),
    .wc-plan-execution-linkages-table td:nth-child(3) { min-width: 5rem; }
    .wc-plan-wbs-empty { margin: 6px 0 0 0; font-size: 11px; }
    .wc-plan-risk-severity { font-weight: 600; }
    .wc-plan-risk-severity-high { color: var(--vscode-errorForeground); }
    .wc-plan-risk-severity-medium { color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-plan-risk-severity-low { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); }
    .wc-plan-open-question-priority { font-weight: 600; }
    .wc-plan-open-question-critical { color: var(--vscode-errorForeground); }
    .wc-plan-review-finding-severity { font-weight: 600; }
    .wc-plan-review-finding-blocker { color: var(--vscode-errorForeground); }
    .wc-plan-review-finding-warning { color: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-plan-text-rollup {
      margin: 6px 0 0 0;
      padding-left: 18px;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .wc-plan-text-rollup li { margin: 0 0 4px 0; }
    .wc-brainstorming-ideas-section { margin-top: 10px; }
    .wc-brainstorming-ideas-list { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
    .wc-brainstorming-idea-row {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 6px;
      padding: 8px 10px;
      background: var(--vscode-editor-background);
    }
    .wc-brainstorming-idea-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: flex-start; justify-content: space-between; }
    .wc-brainstorming-idea-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
    .wc-brainstorming-idea-title { margin: 0; font-size: 12px; }
    .wc-brainstorming-idea-id { margin-left: 6px; font-size: 11px; }
    .wc-brainstorm-score-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .wc-brainstorm-score-pill {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 10px;
      background: var(--vscode-badge-background, rgba(127,127,127,.2));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      border: 1px solid transparent;
    }
    /* Inherit pill foreground — descriptionForeground is page chrome and tanks contrast on badges. */
    .wc-brainstorm-score-label { color: inherit; opacity: 0.9; font-weight: 500; }
    .wc-brainstorm-score-value { color: inherit; font-weight: 700; }
    .wc-brainstorm-score-red {
      background: color-mix(in srgb, var(--wc-red, #f44747) 18%, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--wc-red, #f44747) 45%, transparent);
    }
    .wc-brainstorm-score-amber {
      background: color-mix(in srgb, var(--wc-amber, #cca700) 18%, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--wc-amber, #cca700) 45%, transparent);
    }
    .wc-brainstorm-score-green {
      background: color-mix(in srgb, var(--wc-green, #4ec9b0) 18%, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--wc-green, #4ec9b0) 45%, transparent);
    }
    .wc-brainstorm-readiness-pill {
      background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 22%, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 45%, transparent);
    }
    .wc-brainstorm-readiness-pill.wc-brainstorm-readiness-ready {
      background: color-mix(in srgb, var(--vscode-testing-iconPassed, #4ec9b0) 28%, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      border-color: color-mix(in srgb, var(--vscode-testing-iconPassed, #4ec9b0) 45%, transparent);
    }
    .wc-brainstorm-session-history { margin-top: 8px; font-size: 11px; }
    .wc-brainstorm-session-history-body { margin-top: 6px; overflow-x: auto; }
    .wc-brainstorm-session-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .wc-brainstorm-session-table th,
    .wc-brainstorm-session-table td { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 4px 6px; text-align: left; }
    .wc-plan-value-rationale-text { margin: 6px 0 0 0; font-size: 11px; overflow-wrap: anywhere; }
    .wc-plan-architecture-overview-text { margin: 6px 0 0 0; font-size: 11px; overflow-wrap: anywhere; }
    .wc-plan-wbs-table-extended { display: block; overflow-x: auto; max-width: 100%; }
    .wc-plan-diagram-list { margin-top: 6px; display: flex; flex-direction: column; gap: 8px; }
    .wc-plan-diagram-block { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 4px; padding: 6px 8px; }
    .wc-plan-diagram-title { margin: 0 0 4px 0; font-size: 11px; font-weight: 600; }
    .wc-plan-diagram-caption { margin: 0 0 4px 0; font-size: 11px; }
    .wc-plan-mermaid-source {
      margin: 0;
      padding: 6px 8px;
      font-size: 10px;
      line-height: 1.35;
      overflow-x: auto;
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      border-radius: 4px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .wc-plan-linked-task-btn {
      border: none;
      background: transparent;
      color: var(--vscode-textLink-foreground, var(--vscode-foreground));
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      padding: 0;
      text-decoration: underline;
    }
    .wc-plan-linked-task-btn:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-foreground)); }
    .wc-plan-execution-linkages-table td .wc-plan-linked-task-btn { font-weight: 600; }
    .wc-plan-mermaid-render {
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: 4px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      overflow-x: auto;
    }
    .wc-plan-mermaid-render svg { max-width: 100%; height: auto; display: block; }
    .wc-plan-mermaid-loading { margin: 0; font-size: 11px; }
    .wc-plan-mermaid-source-toggle { margin-top: 4px; font-size: 11px; }
    .wc-plan-card-detail-grid { margin: 6px 0 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 2px 8px; font-size: 11px; }
    .wc-plan-card-detail-grid dt { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); font-weight: 600; }
    .wc-plan-card-detail-grid dd { margin: 0; overflow-wrap: anywhere; }
    .wc-plan-state-bucket { margin-top: 10px; }
    .wc-plan-state-bucket > summary {
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .wc-plan-state-bucket-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .wc-plan-title-group { margin-left: 4px; }
    .wc-plan-title-group > summary {
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 4px;
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
    .dash-team-exec-toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0 10px 0; }
    .dash-team-assignment-row { align-items: flex-start; }
    .dash-team-assignment-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .dash-team-assignment-meta { font-size: 11px; line-height: 1.3; }
    .dash-subagent-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      margin-top: 10px;
      font-size: 11px;
    }
    .dash-subagent-table th,
    .dash-subagent-table td {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      padding: 5px 7px;
      text-align: left;
      vertical-align: top;
    }
    .dash-subagent-table th {
      font-weight: 600;
      background: var(--vscode-textCodeBlock-background);
    }
    .dash-subagent-cmd-pill {
      display: inline-block;
      background: var(--vscode-badge-background, rgba(127, 127, 127, 0.2));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      padding: 1px 4px;
      border-radius: 3px;
      margin: 1px 2px;
      font-size: 10px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .wc-card,
    .dash-card {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 8px;
      padding: 10px 12px;
      margin: 0 0 10px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .wc-card > * { margin-top: 0; }
    .wc-card > *:last-child,
    .dash-card > *:last-child { margin-bottom: 0; }
    .wc-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
    }
    .wc-card-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--wc-fg);
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      line-height: 1.3;
    }
    .wc-card-title-icon {
      font-size: 10px;
      opacity: 0.55;
      flex-shrink: 0;
    }
    .wc-card-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .wc-card-body {
      font-size: 11.5px;
      color: var(--wc-fg);
      line-height: 1.5;
    }
    .wc-card-body p { margin: 0 0 6px; }
    .wc-card-body p:last-child { margin-bottom: 0; }
    .wc-card-footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--wc-border);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wc-card-meta {
      font-size: 10px;
      color: var(--wc-muted);
      flex: 1;
    }
    .wc-card-accent {
      border-left: 3px solid var(--wc-accent);
      background: linear-gradient(135deg, color-mix(in srgb, var(--wc-accent) 6%, transparent) 0%, var(--wc-surface) 60%);
    }
    .wc-card details { margin: 0; }
    .wc-card-summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      padding: 0;
    }
    .wc-card-summary::-webkit-details-marker { display: none; }
    .wc-card-chevron {
      font-size: 10px;
      color: var(--wc-muted);
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    details[open] .wc-card-chevron { transform: rotate(90deg); }
    .wc-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wc-chip-ready { background: var(--wc-green-tint); color: var(--wc-green); }
    .wc-chip-blocked { background: var(--wc-red-tint); color: var(--wc-red); }
    .wc-chip-waiting { background: var(--wc-amber-tint); color: var(--wc-amber); }
    .wc-chip-active { background: color-mix(in srgb, var(--wc-accent) 12%, transparent); color: var(--wc-accent); }
    .wc-chip-default {
      background: var(--vscode-textCodeBlock-background);
      color: var(--wc-muted);
      border: 1px solid var(--wc-border);
    }
    .wc-dash-cae-host.dash-cae-embedded.wc-dashboard-embedded-guidance {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
      border-radius: 8px;
      padding: 10px 12px 12px;
      margin: 0;
      max-height: min(78vh, 920px);
      overflow: auto;
      background: var(--vscode-editor-background);
      font-size: 13px;
      line-height: 1.42;
      color: var(--vscode-foreground);
    }
    .wc-dash-cae-host.wc-dashboard-embedded-guidance .gp-shell { max-width: none; margin: 0; padding: 8px 0 12px 0; }
    .wc-dash-cae-host.wc-dashboard-embedded-guidance .gp-tabs { overflow-x: auto; flex-wrap: nowrap; }
    .wc-dash-cae-host.wc-dashboard-embedded-guidance .gp-head,
    .wc-dash-cae-host.wc-dashboard-embedded-guidance .gp-band { flex-wrap: wrap; }
    details.status-section { margin-bottom: 8px; }
    details.status-section > summary {
      cursor: pointer; user-select: none; font-weight: 600;
      display: flex; align-items: center; gap: 6px;
    }
    .wc-section-chevron {
      font-size: 10px; color: var(--vscode-descriptionForeground);
      transition: transform 0.2s; flex-shrink: 0; display: inline-block;
    }
    details[open] > summary .wc-section-chevron { transform: rotate(90deg); }
    .wc-section-count {
      margin-left: auto; font-size: 10px; font-weight: 600;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      border-radius: 999px; padding: 1px 7px; line-height: 1;
    }
    details.status-section > .status-section-body { padding-left: 0; }
    .dash-card > details.status-section:last-child { margin-bottom: 0; }
    .dash-count-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin: 4px 0 10px 0; }
    .dash-count-cell { display: flex; flex-direction: row; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
    .dash-count-label { font-size: 11px; line-height: 1.25; flex: 1; min-width: 0; }
    .dash-count-num { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; line-height: 1.25; }
    pre.resume-cli { font-size: 11px; }
    /* ── Tab system (agent status banner lives in .wc-dashboard-tab-shell above this bar) ── */
    .wc-dashboard-tab-shell {
      flex: 1 !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      height: 100% !important;
    }
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
      .dash-agent-row:not(details), .dash-agent-row-summary { grid-template-columns: auto minmax(0, 1fr); }
      .dash-agent-row-detail, .dash-agent-row-meta { grid-column: 2; justify-content: flex-start; }
      .dash-agent-row-details { padding-left: 14px; }
    }
    .wc-tab-bar {
      display: flex;
      align-items: center;
      background: var(--wc-surface);
      border: 1px solid var(--wc-border);
      border-radius: 6px;
      padding: 3px;
      gap: 2px;
      margin: 8px 10px;
      overflow-x: auto;
      -ms-overflow-style: none;
      scrollbar-width: none;
      user-select: none;
    }
    .wc-tab-bar::-webkit-scrollbar { display: none; }
    .wc-tab-btn {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 5px 6px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--wc-muted);
      font-size: 11px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .wc-tab-btn:hover {
      color: var(--wc-fg);
      background: var(--vscode-textCodeBlock-background);
    }
    .wc-tab-btn.wc-tab-active {
      background: var(--wc-accent);
      color: var(--vscode-button-foreground, #ffffff);
      font-weight: 600;
    }
    .wc-tab-btn.wc-tab-active:hover {
      background: var(--wc-accent-hover);
    }
    .wc-tab-icon {
      font-size: 10px;
      flex-shrink: 0;
    }
    .wc-tab-panel {
      display: block;
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 0 8px 8px;
    }
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
    .wc-status-kv-label { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); flex-shrink: 0; }
    .wc-status-kv-val { text-align: right; word-break: break-all; }
    .dash-footer {
      flex-shrink: 0;
      margin-top: 10px;
      padding: 10px 8px 8px 8px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
      background: var(--vscode-sideBar-background);
    }
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
      border-radius: 8px;
      padding: 10px 10px 9px;
      margin: 4px 0 10px 0;
      background: var(--vscode-editor-background);
      position: relative;
      overflow: hidden;
    }
    .wc-rec-next::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--vscode-button-background) 0%, transparent 100%);
    }
    .wc-rec-header {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 5px;
    }
    .wc-rec-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--vscode-button-background);
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
    .wc-rec-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .wc-rec-title-row .wc-rec-title {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
    }
    .wc-rec-title-actions {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }
    .wc-rec-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
    }
    .wc-rec-subtitle {
      font-size: 11px;
      margin: 4px 0 0 0;
      line-height: 1.4;
      white-space: normal;
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
      font-size: 10px;
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
    .wc-rec-footer-actions {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }
    .wc-rec-tag-closeout {
      background: var(--vscode-editorWarning-background, var(--vscode-inputValidation-warningBackground));
      color: var(--vscode-editorWarning-foreground, var(--vscode-inputValidation-warningForeground));
    }
    .wc-rec-tag-status {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .wc-rec-next-wishlist {
      border-color: var(--vscode-textLink-foreground);
    }
    .wc-rec-next-closeout {
      border-color: var(--vscode-editorWarning-border, var(--vscode-inputValidation-warningBorder));
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
      font-size: 10px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .wc-phase-tag-delivered {
      background: var(--vscode-badge-secondaryBackground, #3c3c3c);
      color: var(--vscode-badge-secondaryForeground, #e8e8e8);
      border-color: var(--vscode-widget-border, #5a5a5a);
    }
    .wc-phase-tag-current {
      background: color-mix(in srgb, var(--wc-green) 18%, var(--vscode-textCodeBlock-background));
      color: var(--wc-green);
      border-color: var(--wc-green-border);
    }
    .wc-phase-tag-next {
      background: color-mix(in srgb, var(--wc-amber) 18%, var(--vscode-textCodeBlock-background));
      color: var(--wc-amber);
      border-color: var(--wc-amber-border);
    }
    .wc-phase-tag-future {
      background: color-mix(in srgb, var(--wc-blue) 18%, var(--vscode-textCodeBlock-background));
      color: var(--wc-blue);
      border-color: var(--wc-blue-border);
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
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
      margin: 0 0 10px 0;
    }
    .wc-stat-pill {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 8px 4px 6px;
      border-radius: 8px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-foreground);
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      min-width: 0;
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
    .wc-pill-done .wc-stat-num { color: var(--vscode-foreground); opacity: 0.55; }
    .wc-pill-human {
      border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 55%, transparent);
      background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 12%, var(--vscode-textCodeBlock-background));
    }
    .wc-stat-num-human {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }
    .wc-stat-sparkline {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 16px;
      margin: 1px 0;
    }
    .wc-stat-sparkline-bar {
      display: block;
      width: 3px;
      border-radius: 1px;
      flex-shrink: 0;
    }
    .wc-stat-sparkline-bar {
      opacity: 0.45;
      transition: opacity 0.2s;
    }
    .wc-stat-sparkline-bar:last-child {
      opacity: 1;
    }
    .wc-spark-ready   { background: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-spark-proposed { background: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-spark-blocked  { background: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-spark-human    { background: var(--vscode-charts-red, #f44336); }
    .wc-spark-done     { background: var(--vscode-foreground); opacity: 0.45; }
    /* ── Contextual help (fixed popover outside #root — no blink on refresh) ── */
    .wc-context-help-popover {
      position: fixed;
      z-index: 25000;
      min-width: 200px;
      max-width: min(300px, calc(100vw - 24px));
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      font-size: 11px;
      font-weight: 400;
      line-height: 1.45;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
      text-align: left;
      white-space: normal;
      pointer-events: none;
    }
    .wc-context-help-popover[hidden] {
      display: none !important;
    }
    .wc-context-help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 4px;
      vertical-align: middle;
      cursor: help;
      outline: none;
    }
    .wc-context-help-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 700;
      font-style: italic;
      line-height: 1;
      color: var(--vscode-button-foreground, #fff);
      background: var(--vscode-textLink-foreground, #3794ff);
      user-select: none;
    }
    .dash-phase-catalog-hint .wc-context-help-icon {
      font-style: normal;
      font-size: 11px;
      width: 15px;
      height: 15px;
      background: var(--vscode-descriptionForeground, rgba(127,127,127,.85));
    }
    .wc-cae-readiness-title .wc-context-help {
      margin-left: 4px;
    }
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
      font-size: 11px;
      font-weight: 500;
      border-radius: 12px;
      cursor: pointer;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      background: transparent;
      color: var(--vscode-descriptionForeground);
      transition: color 0.1s;
    }
    button.wc-filter-chip:hover { color: var(--vscode-foreground); border-color: var(--vscode-foreground); }
    button.wc-filter-chip-ready { color: var(--vscode-testing-iconPassed, #4ec9b0); border-color: var(--vscode-testing-iconPassed, #4ec9b0); }
    button.wc-filter-chip-proposed { color: var(--vscode-textLink-foreground, #4fc1ff); border-color: var(--vscode-textLink-foreground, #4fc1ff); }
    button.wc-filter-chip-blocked { color: var(--vscode-editorWarning-foreground, #cca700); border-color: var(--vscode-editorWarning-foreground, #cca700); }
    button.wc-filter-chip-human-gates { color: var(--vscode-charts-red, #f44336); border-color: var(--vscode-charts-red, #f44336); }
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
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
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
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .wc-cae-readiness-title b {
      font-weight: 600;
      line-height: 1.35;
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
    .wc-phase-progress-footer {
      display: flex;
      justify-content: center;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .wc-phase-progress-footer .dash-phase-mark-complete-btn {
      min-width: 11rem;
    }
    #root.wc-mark-phase-busy .wc-phase-progress-footer {
      opacity: 0.75;
      pointer-events: none;
    }
    #root.wc-mark-phase-busy .dash-phase-mark-complete-btn::after {
      content: ' …';
    }
    .wc-phase-progress-track {
      display: flex;
      width: 100%;
      height: 5px;
      border-radius: 3px;
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
    .wc-phase-seg-ready { background: var(--vscode-testing-iconPassed, #4ec9b0); }
    .wc-phase-seg-proposed { background: var(--vscode-textLink-foreground, #4fc1ff); }
    .wc-phase-seg-blocked { background: var(--vscode-editorWarning-foreground, #cca700); }
    .wc-phase-seg-research { background: var(--vscode-charts-purple, #8b5cf6); }
    .wc-phase-progress-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-bottom: 8px;
      font-size: 11px;
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
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      flex-shrink: 0;
    }
    .wc-cae-score-badge span { font-size: 11px; font-weight: 500; margin-left: 1px; }
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
      font-size: 10px;
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
    .wc-cae-check-label {
      flex: 1;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      line-height: 1.35;
    }
    .dash-phase-roster-status-inner {
      display: inline-flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 4px;
    }
    .wc-cae-check-meta { flex-shrink: 0; }
    .wc-cae-decisions { margin-top: 8px; }
    .wc-cae-decisions > p { margin: 0 0 4px 0; }
    /* ── Dashboard lazy-loading shell (T100395) ── */
    .wc-dashboard-shell-initial .wc-dash-section { margin: 8px 0; }
    .wc-dash-section-inner {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
      background: var(--vscode-editor-background, rgba(127,127,127,.08));
    }
    .wc-dash-section-label { margin: 0 0 4px 0; }
    .wc-dash-section-status { margin: 0 0 8px 0; font-size: 11px; }
    .wc-dash-section-skeleton {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .wc-dash-section-skeleton > span {
      display: block;
      height: 10px;
      border-radius: 4px;
      background: linear-gradient(
        90deg,
        var(--vscode-textBlockQuote-background, rgba(127,127,127,.15)) 0%,
        var(--vscode-list-hoverBackground, rgba(127,127,127,.22)) 50%,
        var(--vscode-textBlockQuote-background, rgba(127,127,127,.15)) 100%
      );
      background-size: 200% 100%;
      animation: wc-dash-skeleton-shimmer 1.4s ease-in-out infinite;
    }
    .wc-dash-section-skeleton > span:nth-child(1) { width: 92%; }
    .wc-dash-section-skeleton > span:nth-child(2) { width: 78%; }
    .wc-dash-section-skeleton > span:nth-child(3) { width: 64%; }
    .wc-dash-section--ready .wc-dash-section-skeleton,
    .wc-dash-section--stale .wc-dash-section-status,
    .wc-dash-section--error .wc-dash-section-skeleton { display: none; }
    .wc-dash-section--stale .wc-dash-section-inner {
      border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 45%, transparent);
    }
    .wc-dash-section--error .wc-dash-section-inner {
      border-color: color-mix(in srgb, var(--vscode-editorError-foreground, #f14c4c) 45%, transparent);
    }
    @keyframes wc-dash-skeleton-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
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
    button.wc-stat-pill { cursor: pointer; }
    button.wc-stat-pill:hover { background: var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.1)); }
    button.wc-pill-ready:hover { border-color: var(--vscode-testing-iconPassed, #4ec9b0); }
    button.wc-pill-proposed:hover { border-color: var(--vscode-textLink-foreground, #4fc1ff); }
    button.wc-pill-blocked:hover { border-color: var(--vscode-errorForeground, #f44747); }
    button.wc-pill-done:hover { border-color: var(--vscode-foreground); }
    button.wc-pill-human:hover { border-color: var(--vscode-editorWarning-foreground, #cca700); }
    /* ── Empty section muting ── */
    details.status-section.wc-section-empty {
      opacity: 1;
    }
    details.status-section.wc-section-empty > summary { opacity: 0.6; }
    details.status-section.wc-section-empty > .status-section-body { display: none; }
    details.status-section.wc-section-empty > summary::after {
      content: "0"; font-size: 10px; font-weight: 600;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));
      border-radius: 999px; padding: 1px 7px; margin-left: auto;
      line-height: 1;
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
    details.status-section[data-wc-filter="human-gates"] > summary {
      border-left: 3px solid var(--vscode-inputValidation-warningBorder, #cca700);
      padding-left: 6px;
      margin-left: -2px;
    }
    .dash-human-gate-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .dash-human-gate-meta { font-size: 11px; line-height: 1.3; }
    .dash-phase-journal-silence-warn {
      border-left: 3px solid var(--vscode-inputValidation-warningBorder, #cca700);
      padding-left: 6px;
    }
    .wc-filter-chip-human-gates.wc-filter-active { outline: 1px solid var(--vscode-inputValidation-warningBorder, #cca700); }
    details.status-section[data-wc-filter="research"] > summary {
      border-left: 3px solid var(--vscode-charts-purple, #b388ff);
      padding-left: 6px;
      margin-left: -2px;
    }
    details.status-section[data-wc-filter="terminal"] > summary {
      border-left: 3px solid var(--vscode-foreground);
      padding-left: 6px;
      margin-left: -2px;
    }
    /* ── Tab badge ── */
    .wc-tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 14px;
      height: 14px;
      padding: 0 3px;
      margin-left: 4px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      flex-shrink: 0;
    }
    .wc-tab-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wc-tab-badge-ready {
      background: var(--wc-green-border);
      color: var(--wc-green);
    }
    .wc-tab-badge-blocked {
      background: var(--wc-red-border);
      color: var(--wc-red);
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
    .wc-drawer-desc { margin: 0 0 10px 0; line-height: 1.35; }
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
    /* ── CAE tab embed: gp-* / drawer rules shared with GuidancePanel (T100312) ── */
    ${GUIDANCE_PANEL_WEBVIEW_CSS}
    ${CONFIG_WEBVIEW_STYLES}
    /* Re-assert dashboard shell (R7.1) after Guidance html/body rules — non-CAE tabs unchanged */
    html, body {
      margin: 0 !important;
      height: 100vh !important;
      overflow: hidden !important;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0 !important;
      font-size: 12px;
      line-height: 1.35;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div id="root">${rootInnerHtml}</div>
  <div id="wc-context-help-popover" class="wc-context-help-popover" role="tooltip" hidden></div>
  <div id="wc-drawer-host" class="wc-drawer-host wc-drawer-host--hidden" aria-hidden="true"></div>
  <footer class="dash-footer">
    <button type="button" id="btn" class="wc-btn wc-btn-lg wc-btn-primary dash-refresh-btn" title="Refresh the dashboard now. The panel also updates when you return to it or when planning data changes.">Refresh</button>
  </footer>
  <script>${startupProbe}</script>
  <script>${bootstrap}</script>
  <script>${buildConfigWebviewBootstrapScript({ autoLoad: false })}</script>
  <script src="${mermaidScriptUri}"></script>
</body>
</html>`;
  }
}
