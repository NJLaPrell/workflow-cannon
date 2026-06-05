/**
 * Pure dashboard HTML generation — unit-tested; applied in the webview via postMessage { html } from the host.
 *
 * **Dashboard prompt surface (Phase 91+):** new Dashboard-originated data entry for kit mutations should use the
 * in-webview drawer (`#wc-drawer-host`, `wcDrawerOpen` / `drawerSubmit` / `drawerCancel` in `DashboardViewProvider`)
 * instead of `vscode.window.showInputBox` / `showQuickPick` so operators stay in the sidebar. See
 * `dashboard-input-drawer.ts` for the typed form spec + render helpers.
 */

import {
  buildNarrowPhaseRosterRows,
  buildPhaseRosterRowsWhenNoCurrent,
  detectPhaseCloseoutOrderingRisk,
  type PhaseCatalogListRow,
  type PhaseCloseoutOrderingRisk
} from "../phase-roster-display.js";
import {
  renderPhaseBucketSummaryLabelHtml,
  renderPhaseScheduleTagHtml,
  resolvePhaseScheduleTag,
  type PhaseScheduleFocus
} from "../phase-schedule-tag.js";
import { renderStatusTabInnerHtml } from "../status/render-status-tab.js";
import { renderConfigPanelShellHtml } from "../config/config-panel-shell.js";
import { compareQueuePhaseFilterValues } from "../phase-select-options.js";
import type {
  DashboardAgentActivityRow,
  DashboardAgentActivitySummary,
  DashboardAgentStatusKind
} from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import type { DashboardSectionId } from "./dashboard-section-registry.js";
import { lookupDashboardSection } from "./dashboard-section-registry.js";
import { renderDashboardReadModeBadgeHtml, renderDashboardSectionPlaceholder } from "./render-dashboard-shell.js";
import type { DashboardReadModeBadge } from "./dashboard-read-mode-badge.js";

export type RenderDashboardRootOptions = {
  /** Sections that stay as loading placeholders until tab activation (T100398). */
  deferredSections?: ReadonlySet<DashboardSectionId>;
  /** Active dashboard read path badge (T100599). */
  readModeBadge?: DashboardReadModeBadge | null;
};

export type WcDashboardStatusKind = "active" | "waiting" | "blocked" | "idle" | "done";
export type DashboardTabId = "overview" | "planning" | "task-engine" | "status" | "config" | "cae";

const WC_DASHBOARD_STATUS_LABELS: Record<WcDashboardStatusKind, string> = {
  active: "Running",
  waiting: "Awaiting input",
  blocked: "Blocked",
  idle: "Idle",
  done: "Done"
};

export function mapDashboardStatusToWcStatus(raw: unknown): WcDashboardStatusKind {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  switch (value) {
    case "active":
    case "running":
    case "in_progress":
    case "working":
    case "working_task":
    case "delegating_task":
    case "planning":
    case "reviewing_item":
    case "reviewing_pr":
    case "validating":
    case "releasing":
      return "active";
    case "awaiting_input":
    case "waiting":
    case "ready":
    case "ready_task":
    case "proposed":
    case "submitted":
    case "awaiting_policy_approval":
    case "awaiting_human_gate":
    case "needs_policy":
    case "needs_human":
    case "human_gate":
      return "waiting";
    case "blocked":
    case "failed":
      return "blocked";
    case "done":
    case "complete":
    case "completed":
    case "reconciled":
    case "released":
    case "cancelled":
    case "canceled":
      return "done";
    case "awaiting_instruction":
    case "idle":
    case "unavailable":
    case "unknown":
    default:
      return "idle";
  }
}

export function wcDashboardStatusLabel(status: WcDashboardStatusKind): string {
  return WC_DASHBOARD_STATUS_LABELS[status] ?? WC_DASHBOARD_STATUS_LABELS.idle;
}

export function resolveWcDashboardStatus(raw: unknown): { kind: WcDashboardStatusKind; label: string } {
  const kind = mapDashboardStatusToWcStatus(raw);
  return { kind, label: wcDashboardStatusLabel(kind) };
}

/** Inputs for {@link detectPhaseCloseoutOrderingRisk} on dashboard phase cards. */
export type PhaseOrderingInputs = {
  phases: ReadonlyArray<PhaseCatalogListRow>;
  deliveredPhaseKeys: ReadonlySet<string> | readonly string[];
  legacyDeliveredMaxOrdinal?: number | null;
  activeQueuePhaseKeys?: ReadonlySet<string> | readonly string[];
};

function resolvePhaseCloseoutOrderingRisk(
  ws: Record<string, unknown> | null | undefined,
  orderingInputs: PhaseOrderingInputs | undefined
): PhaseCloseoutOrderingRisk | null {
  if (!ws || !orderingInputs) {
    return null;
  }
  return detectPhaseCloseoutOrderingRisk({
    currentKitPhase:
      ws.currentKitPhase != null ? String(ws.currentKitPhase) : null,
    phases: orderingInputs.phases,
    deliveredPhaseKeys: orderingInputs.deliveredPhaseKeys,
    legacyDeliveredMaxOrdinal: orderingInputs.legacyDeliveredMaxOrdinal,
    activeQueuePhaseKeys: orderingInputs.activeQueuePhaseKeys
  });
}

function renderPhaseOrderingRiskHtml(risk: PhaseCloseoutOrderingRisk | null): string {
  if (!risk) {
    return "";
  }
  return (
    '<p class="wc-phase-ordering-risk" role="alert">' + escapeHtml(risk.message) + "</p>"
  );
}

function wrapDashboardSection(
  id: DashboardSectionId,
  innerHtml: string,
  deferred: boolean
): string {
  if (deferred) {
    return renderDashboardSectionPlaceholder(id, "loading");
  }
  return (
    `<div data-wc-section="${id}" class="wc-dash-section wc-dash-section--ready" aria-busy="false">` +
    innerHtml +
    "</div>"
  );
}

function readPhaseKeysWithActiveQueueWork(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.phaseKeysWithActiveQueueWork)) {
    return (data.phaseKeysWithActiveQueueWork as unknown[]).filter(
      (k): k is string => typeof k === "string" && k.trim().length > 0
    );
  }
  return [];
}

function phaseScheduleFocusFromWorkspace(
  ws: Record<string, unknown> | null | undefined,
  releasedPhaseKeys?: readonly string[],
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: readonly string[]
): PhaseScheduleFocus {
  const released =
    releasedPhaseKeys && releasedPhaseKeys.length > 0 ? new Set(releasedPhaseKeys) : undefined;
  const active =
    activeQueuePhaseKeys && activeQueuePhaseKeys.length > 0
      ? new Set(activeQueuePhaseKeys.map((k) => k.trim()))
      : undefined;
  return {
    currentKitPhase: ws?.currentKitPhase != null ? String(ws.currentKitPhase) : null,
    nextKitPhase: ws?.nextKitPhase != null ? String(ws.nextKitPhase) : null,
    releasedPhaseKeys: released,
    legacyDeliveredMaxOrdinal,
    activeQueuePhaseKeys: active
  };
}

function readDeliveredPhaseKeys(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.deliveredPhaseKeys)) {
    return (data.deliveredPhaseKeys as unknown[]).filter((k): k is string => typeof k === "string");
  }
  return [];
}

function readRolledOutPhaseKeys(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.rolledOutPhaseKeys)) {
    return (data.rolledOutPhaseKeys as unknown[]).filter((k): k is string => typeof k === "string");
  }
  return [];
}

/** Roster narrowing: closeout-delivered plus workspace rollovers (even without closeout evidence). */
function mergePhaseKeysForRosterDelivery(
  deliveredPhaseKeys: readonly string[],
  rolledOutPhaseKeys: readonly string[]
): string[] {
  const set = new Set<string>();
  for (const raw of deliveredPhaseKeys) {
    const key = String(raw).trim();
    if (key.length > 0) {
      set.add(key);
    }
  }
  for (const raw of rolledOutPhaseKeys) {
    const key = String(raw).trim();
    if (key.length > 0) {
      set.add(key);
    }
  }
  return [...set];
}

function readLegacyDeliveredMaxOrdinal(data: Record<string, unknown>): number | null {
  const raw = data.legacyDeliveredMaxOrdinal;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return null;
}

function readPhaseReleaseDates(data: Record<string, unknown>): Record<string, string> {
  const raw = data.phaseReleaseDates;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key).trim();
    const v = typeof value === "string" ? value.trim() : "";
    if (k.length > 0 && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

function parsePhaseCatalogRows(phaseSlice: Record<string, unknown> | undefined): PhaseCatalogListRow[] {
  const cat = phaseSlice?.phaseCatalog as { phases?: unknown } | undefined;
  const phasesRaw = Array.isArray(cat?.phases) ? (cat!.phases as unknown[]) : [];
  const phases: PhaseCatalogListRow[] = [];
  for (const raw of phasesRaw) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const pk = typeof row.phaseKey === "string" ? row.phaseKey : "";
    if (!pk) {
      continue;
    }
    const sdRaw = row.shortDescription != null ? String(row.shortDescription).trim() : "";
    phases.push({
      phaseKey: pk,
      shortDescription: sdRaw.length > 0 ? sdRaw : null,
      inCatalog: row.inCatalog === true
    });
  }
  return phases;
}

function buildPhaseCatalogLookup(
  phaseSlice: Record<string, unknown> | undefined
): Map<string, PhaseCatalogListRow> {
  const map = new Map<string, PhaseCatalogListRow>();
  for (const row of parsePhaseCatalogRows(phaseSlice)) {
    map.set(row.phaseKey, row);
  }
  return map;
}

/** Read-only deliverables on queue phase bucket headers (edit stays on Phase Roster). */
function renderPhaseBucketDeliverablesSuffixHtml(
  phaseKey: string,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const entry = catalog.get(phaseKey);
  const sd = entry?.shortDescription != null ? String(entry.shortDescription).trim() : "";
  if (sd.length === 0) {
    return "";
  }
  return (
    ' <span class="phase-bucket-summary-deliverables muted">' +
    escapeHtml(sd) +
    "</span>"
  );
}

function phaseBucketSummaryHtml(
  b: { label?: unknown; phaseKey?: unknown; count?: unknown },
  focus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const rawKey = b.phaseKey;
  const phaseKey =
    rawKey !== null && rawKey !== undefined && String(rawKey).trim().length > 0
      ? String(rawKey).trim()
      : null;
  const count = typeof b.count === "number" ? b.count : 0;
  const deliverablesSuffix =
    phaseKey !== null ? renderPhaseBucketDeliverablesSuffixHtml(phaseKey, catalog) : "";
  if (phaseKey !== null) {
    return renderPhaseBucketSummaryLabelHtml({
      phaseKey,
      count,
      focus,
      deliverablesSuffixHtml: deliverablesSuffix
    });
  }
  return renderPhaseBucketSummaryLabelHtml({ phaseKey: null, count, focus });
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute-safe escaping for double-quoted HTML attributes. */
export function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderWcLogoMarkSvg(): string {
  return (
    '<svg class="wc-banner-mark" viewBox="0 0 96 96" fill="none" aria-hidden="true">' +
    '<circle cx="44" cy="73" r="15" stroke="#FF5F1F" stroke-width="6"/>' +
    '<circle cx="44" cy="73" r="4" fill="#FF5F1F"/>' +
    '<line x1="44" y1="58" x2="44" y2="88" stroke="#FF5F1F" stroke-width="2.5"/>' +
    '<line x1="29" y1="73" x2="59" y2="73" stroke="#FF5F1F" stroke-width="2.5"/>' +
    '<g transform="rotate(-14, 32, 52)">' +
    '<rect x="14" y="36" width="22" height="30" rx="5" fill="#FF5F1F"/>' +
    '<rect x="32" y="42" width="46" height="17" rx="4" fill="#FF5F1F"/>' +
    '<rect x="72" y="40" width="8" height="21" rx="4" fill="#CC3D00"/>' +
    "</g></svg>"
  );
}

function cleanDashboardText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function buildDashboardBannerTaskTextFromActivityRow(row: DashboardAgentActivityRow): string {
  const taskId = cleanDashboardText(row.work.taskId);
  const title = cleanDashboardText(row.work.title);
  const detail = cleanDashboardText(row.work.currentStep) || cleanDashboardText(row.work.command);
  const phaseKey = cleanDashboardText(row.work.phaseKey);
  const parts: string[] = [];
  if (taskId.length > 0 && title.length > 0) {
    parts.push(taskId + " · " + title);
  } else if (taskId.length > 0 || title.length > 0) {
    parts.push(taskId || title);
  }
  if (detail.length > 0) {
    parts.push(detail);
  }
  if (phaseKey.length > 0) {
    parts.push("Phase " + phaseKey);
  }
  return parts.join(" · ");
}

function buildDashboardBannerTaskTextFromStatus(status: {
  label?: unknown;
  detail?: unknown;
  taskId?: unknown;
  phaseKey?: unknown;
  command?: unknown;
}): string {
  const taskId = cleanDashboardText(status.taskId);
  const label = cleanDashboardText(status.label);
  const detail = cleanDashboardText(status.detail);
  const command = cleanDashboardText(status.command);
  const phaseKey = cleanDashboardText(status.phaseKey);
  const parts: string[] = [];
  if (taskId.length > 0 && label.length > 0) {
    parts.push(taskId + " · " + label);
  } else if (taskId.length > 0 || label.length > 0) {
    parts.push(taskId || label);
  }
  if (detail.length > 0 && detail !== label) {
    parts.push(detail);
  } else if (command.length > 0) {
    parts.push(command);
  }
  if (phaseKey.length > 0) {
    parts.push("Phase " + phaseKey);
  }
  return parts.join(" · ");
}

function resolveDashboardBannerState(d: Record<string, unknown> | null | undefined): {
  statusKind: WcDashboardStatusKind;
  statusLabel: string;
  taskText: string;
} {
  const summary = (d?.agentActivitySummary as DashboardAgentActivitySummary | null | undefined) ?? null;
  const main = summary?.main && summary.main.freshness.state !== "expired" ? summary.main : null;
  if (main) {
    const status = resolveWcDashboardStatus(main.status);
    return {
      statusKind: status.kind,
      statusLabel: status.label,
      taskText: buildDashboardBannerTaskTextFromActivityRow(main) || cleanDashboardText(main.statusLabel) || "Agent activity is live"
    };
  }
  const fallback = summary?.inferredFallback ?? null;
  if (fallback) {
    const status = resolveWcDashboardStatus(fallback.kind);
    return {
      statusKind: status.kind,
      statusLabel: status.label,
      taskText: buildDashboardBannerTaskTextFromStatus(fallback) || "Inferred from workspace state"
    };
  }
  const agentStatus =
    d?.agentStatus && typeof d.agentStatus === "object"
      ? (d.agentStatus as {
          kind?: unknown;
          label?: unknown;
          detail?: unknown;
          taskId?: unknown;
          phaseKey?: unknown;
          command?: unknown;
        })
      : null;
  if (agentStatus) {
    const status = resolveWcDashboardStatus(agentStatus.kind);
    return {
      statusKind: status.kind,
      statusLabel: status.label,
      taskText: buildDashboardBannerTaskTextFromStatus(agentStatus) || "Workspace agent status"
    };
  }
  const workspaceStatus =
    d?.workspaceStatus && typeof d.workspaceStatus === "object"
      ? (d.workspaceStatus as Record<string, unknown>)
      : null;
  const activeFocus = cleanDashboardText(workspaceStatus?.activeFocus);
  return {
    statusKind: "idle",
    statusLabel: wcDashboardStatusLabel("idle"),
    taskText: activeFocus || "No current task"
  };
}

export function renderWcDashboardBannerHtml(data?: Record<string, unknown> | null): string {
  const state = resolveDashboardBannerState(data);
  return (
    '<header class="wc-banner" data-agent-status-kind="' +
    escapeHtmlAttr(state.statusKind) +
    '">' +
    renderWcLogoMarkSvg() +
    '<div class="wc-banner-identity">' +
    '<span class="wc-banner-name">Workflow Cannon</span>' +
    '<span class="wc-banner-tagline">workspace-kit</span>' +
    "</div>" +
    '<div class="wc-banner-divider" aria-hidden="true"></div>' +
    '<div class="wc-banner-status">' +
    '<div class="wc-banner-status-row">' +
    '<span class="wc-status-dot wc-status-dot--' +
    escapeHtmlAttr(state.statusKind) +
    '" aria-hidden="true"></span>' +
    '<span class="wc-banner-status-label wc-banner-status-label--' +
    escapeHtmlAttr(state.statusKind) +
    '">' +
    escapeHtml(state.statusLabel) +
    "</span>" +
    "</div>" +
    '<span class="wc-banner-task" title="' +
    escapeHtmlAttr(state.taskText) +
    '">' +
    escapeHtml(state.taskText) +
    "</span>" +
    "</div>" +
    "</header>"
  );
}

export function renderDashboardTabBarHtml(args?: {
  activeTab?: DashboardTabId;
  readyCount?: number;
  blockedCount?: number;
  readModeBadge?: DashboardReadModeBadge | null;
}): string {
  const activeTab = args?.activeTab ?? "overview";
  const readyCount = Math.max(0, Math.floor(args?.readyCount ?? 0));
  const blockedCount = Math.max(0, Math.floor(args?.blockedCount ?? 0));
  const queueBadge =
    readyCount > 0
      ? '<span class="wc-tab-badge wc-tab-badge-ready">' + escapeHtml(String(readyCount)) + "</span>"
      : blockedCount > 0
        ? '<span class="wc-tab-badge wc-tab-badge-blocked">' + escapeHtml(String(blockedCount)) + "</span>"
        : "";
  const tabs: Array<{ id: DashboardTabId; icon: string; label: string; badge?: string }> = [
    { id: "overview", icon: "◎", label: "Overview" },
    { id: "planning", icon: "⬡", label: "Planning" },
    { id: "task-engine", icon: "▤", label: "Queue", badge: queueBadge },
    { id: "status", icon: "◈", label: "Status" },
    { id: "config", icon: "⚙", label: "Config" },
    { id: "cae", icon: "⚑", label: "CAE" }
  ];
  return (
    '<div class="wc-tab-bar" role="tablist">' +
    tabs
      .map((tab) => {
        const active = tab.id === activeTab;
        return (
          '<button type="button" class="wc-tab-btn' +
          (active ? " wc-tab-active" : "") +
          '" role="tab" data-wc-tab="' +
          escapeHtmlAttr(tab.id) +
          '">' +
          '<span class="wc-tab-icon">' +
          escapeHtml(tab.icon) +
          "</span>" +
          escapeHtml(tab.label) +
          (tab.badge ?? "") +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Ready / proposed / blocked row control — posts `assignTaskPhase` (assign-task-phase). */
function renderPhaseAssignButton(taskId: string): string {
  const idAttr = escapeHtml(taskId);
  const aria = escapeHtmlAttr(`Set phase for task ${taskId}`);
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-info" data-wc-action="assign-phase" data-task-id="' +
    idAttr +
    '" aria-label="' +
    aria +
    '" title="Move this task to the selected phase">Set Phase</button>'
  );
}

function renderTaskDetailButton(taskId: string): string {
  const idAttr = escapeHtml(taskId);
  const aria = escapeHtmlAttr(`View task details for ${taskId}`);
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
    idAttr +
    '" aria-label="' +
    aria +
    '" title="Open task detail">View Task</button>'
  );
}

function renderTaskCommentsButton(taskId: string, mode: "view" | "add"): string {
  const idAttr = escapeHtml(taskId);
  const label = mode === "add" ? "Add Comment" : "View Comments";
  const action = mode === "add" ? "task-comment-add" : "task-comments-view";
  const intentClass = mode === "add" ? "wc-btn-info" : "wc-btn-secondary";
  const aria = escapeHtmlAttr(`${label} for task ${taskId}`);
  return (
    '<button type="button" class="wc-btn wc-btn-sm ' +
    intentClass +
    '" data-wc-action="' +
    action +
    '" data-task-id="' +
    idAttr +
    '" aria-label="' +
    aria +
    '" title="Task comments are coming soon">' +
    label +
    '</button>'
  );
}

function renderQueueTaskActionButtons(taskId: string): string {
  if (taskId.trim().length === 0) {
    return "";
  }
  return (
    '<span class="dash-row-actions wc-task-actions">' +
    renderTaskDetailButton(taskId) +
    renderPhaseAssignButton(taskId) +
    renderTaskCommentsButton(taskId, "view") +
    renderTaskCommentsButton(taskId, "add") +
    "</span>"
  );
}

/** Proposed rows: six actions in one 3×2 grid (Set Phase … Decline). */
function renderProposedQueueTaskActionButtons(
  taskId: string,
  acceptDecline: { acceptAction: string; declineAction: string },
): string {
  if (taskId.trim().length === 0) {
    return "";
  }
  const idAttr = escapeHtml(taskId);
  return (
    '<span class="dash-row-actions wc-task-actions dash-row-actions-grid">' +
    renderTaskDetailButton(taskId) +
    renderPhaseAssignButton(taskId) +
    renderTaskCommentsButton(taskId, "view") +
    renderTaskCommentsButton(taskId, "add") +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-success" data-wc-action="' +
    escapeHtml(acceptDecline.acceptAction) +
    '" data-task-id="' +
    idAttr +
    '" title="Accept this proposed task">Accept</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-wc-action="' +
    escapeHtml(acceptDecline.declineAction) +
    '" data-task-id="' +
    idAttr +
    '" title="Decline this proposed task">Decline</button>' +
    "</span>"
  );
}

/** Stable id for preserving `<details open>` when the host replaces `#root` innerHTML (`DashboardViewProvider` wcReplaceRoot). */
function wcTrackAttr(trackId: string): string {
  const safe = trackId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return ' data-wc-track="' + escapeHtml(safe) + '" data-wc-ui-state-key="' + escapeHtml(safe) + '"';
}

function wcUiStateAttr(stateKey: string): string {
  const safe = stateKey.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return ' data-wc-ui-state-key="' + escapeHtml(safe) + '"';
}

function queuePhaseBucketTrackId(prefix: string, phaseKey: string): string {
  const key = phaseKey.trim().length > 0 ? phaseKey.trim() : "no-phase";
  return prefix + "-phase-" + key;
}

/** Prefix embedded CAE panel ids so embedding and standalone renders can coexist without duplicate ids. */
function namespaceEmbeddedCaePanelHtml(html: string, prefix = "dash-cae-"): string {
  const idMap = new Map<string, string>();
  const withIds = html.replace(/id="([^"]+)"/g, (_match, id: string) => {
    const from = String(id);
    const to = `${prefix}${from}`;
    idMap.set(from, to);
    return `id="${to}"`;
  });
  let out = withIds;
  for (const [from, to] of idMap) {
    out = out.replace(new RegExp(`for="${from}"`, "g"), `for="${to}"`);
    out = out.replace(new RegExp(`aria-controls="${from}"`, "g"), `aria-controls="${to}"`);
    out = out.replace(new RegExp(`aria-labelledby="${from}"`, "g"), `aria-labelledby="${to}"`);
    out = out.replace(new RegExp(`href="#${from}"`, "g"), `href="#${to}"`);
  }
  return out;
}

/** Escape first, then turn paired `**segments**` into `<b>…</b>` (safe for webview HTML). */
export function renderMarkdownBoldAfterEscape(escapedPlain: string): string {
  return escapedPlain.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

export function renderActiveFocusHtml(raw: string): string {
  return renderMarkdownBoldAfterEscape(escapeHtml(raw));
}

/** Stable phase key from a dashboard task/list row. */
export function dashboardRowPhaseKey(row: unknown): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  const r = row as { phaseKey?: unknown; phase?: unknown };
  const pk = r.phaseKey != null ? String(r.phaseKey).trim() : "";
  if (pk.length > 0) {
    return pk;
  }
  const phase = r.phase != null ? String(r.phase).trim() : "";
  const m = phase.match(/(?:^|\s)phase\s+(\d+)/i);
  return m ? m[1] : "";
}

/** Scan one dashboard-summary rollup for a task id → phase key. */
function scanTaskPhaseInDashboardSummary(summary: unknown, tid: string): string {
  if (!summary || typeof summary !== "object") {
    return "";
  }
  const s = summary as { top?: unknown; phaseBuckets?: unknown };
  if (Array.isArray(s.top)) {
    for (const row of s.top) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const id = String((row as { id?: unknown }).id ?? "")
        .trim()
        .toUpperCase();
      if (id === tid) {
        return dashboardRowPhaseKey(row);
      }
    }
  }
  const buckets = s.phaseBuckets;
  if (!Array.isArray(buckets)) {
    return "";
  }
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const bucket = raw as { phaseKey?: unknown; top?: unknown; taskIds?: unknown };
    const bucketPk = bucket.phaseKey != null ? String(bucket.phaseKey).trim() : "";
    const ids = Array.isArray(bucket.taskIds) ? bucket.taskIds : [];
    if (ids.some((id) => String(id).trim().toUpperCase() === tid)) {
      return bucketPk;
    }
    if (Array.isArray(bucket.top)) {
      for (const row of bucket.top) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const id = String((row as { id?: unknown }).id ?? "")
          .trim()
          .toUpperCase();
        if (id === tid) {
          return dashboardRowPhaseKey(row) || bucketPk;
        }
      }
    }
  }
  return "";
}

/** Phase key for a task row from dashboard-summary rollups (ready, proposed, blocked, …). */
export function lookupDashboardTaskPhaseKey(data: Record<string, unknown>, taskId: string): string {
  const tid = taskId.trim().toUpperCase();
  if (!tid.length) {
    return "";
  }
  const summaries = [
    data.readyExecutionSummary,
    data.readyImprovementsSummary,
    data.proposedExecutionSummary,
    data.proposedImprovementsSummary,
    data.blockedSummary,
    data.completedSummary,
    data.cancelledSummary,
    data.transcriptChurnResearchSummary
  ];
  for (const summary of summaries) {
    const pk = scanTaskPhaseInDashboardSummary(summary, tid);
    if (pk.length > 0) {
      return pk;
    }
  }
  const readyTop = data.readyQueueTop;
  if (Array.isArray(readyTop)) {
    for (const row of readyTop) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const id = String((row as { id?: unknown }).id ?? "")
        .trim()
        .toUpperCase();
      if (id === tid) {
        return dashboardRowPhaseKey(row);
      }
    }
  }
  return "";
}

/** Phase key for a proposed task row from dashboard-summary rollups. */
export function lookupProposedTaskPhaseKey(data: Record<string, unknown>, taskId: string): string {
  const tid = taskId.trim().toUpperCase();
  if (!tid.length) {
    return "";
  }
  return (
    scanTaskPhaseInDashboardSummary(data.proposedExecutionSummary, tid) ||
    scanTaskPhaseInDashboardSummary(data.proposedImprovementsSummary, tid) ||
    ""
  );
}

/** First ready-queue row in the workspace current phase. */
export function pickNextTaskInCurrentPhase(readyTop: unknown[], currentPhaseKey: string): unknown | null {
  const cur = currentPhaseKey.trim();
  if (cur.length === 0) {
    return null;
  }
  for (const row of readyTop) {
    if (dashboardRowPhaseKey(row) === cur) {
      return row;
    }
  }
  return null;
}

export function suggestedNextMatchesPhase(suggestedNext: unknown, currentPhaseKey: string): boolean {
  const cur = currentPhaseKey.trim();
  if (cur.length === 0 || !suggestedNext || typeof suggestedNext !== "object") {
    return false;
  }
  return dashboardRowPhaseKey(suggestedNext) === cur;
}

export type UpNextCardRenderArgs = {
  ws: Record<string, unknown> | null;
  phaseSnapshot: PhaseSnapshot | null;
  suggestedNext: unknown;
  readyTop: unknown[];
  readyCount: number;
  firstWishlistOpen: unknown;
  humanGatesCount: number;
  /** Optional rows to surface in-progress / blocked / gated work in the current phase. */
  phaseWorkCandidates?: unknown[];
};

/**
 * Phase-aware Up next: current-phase task, closeout, pick-phase, then legacy fallbacks.
 */
export function renderUpNextCardHtml(args: UpNextCardRenderArgs): string {
  const curPhase = workspaceCurrentPhaseKey(args.ws);

  if (curPhase.length === 0) {
    const nextPhase =
      args.ws?.nextKitPhase != null ? String(args.ws.nextKitPhase).trim() : "";
    return renderRecommendedNextPickPhaseCard(nextPhase);
  }

  const phaseTask =
    pickNextTaskInCurrentPhase(args.readyTop, curPhase) ??
    (suggestedNextMatchesPhase(args.suggestedNext, curPhase) ? args.suggestedNext : null);
  if (phaseTask) {
    return renderRecommendedNextCard(phaseTask);
  }

  const snap = args.phaseSnapshot;
  const snapForPhase =
    snap && (snap.phaseKey === curPhase || snap.phaseKey == null || snap.phaseKey === "")
      ? snap
      : snap?.phaseKey === curPhase
        ? snap
        : null;

  if (snapForPhase && !phaseDeliveryQueueDrainedForUpNext(snapForPhase)) {
    const candidate = pickFirstRowInCurrentPhase(args.phaseWorkCandidates ?? [], curPhase);
    if (candidate) {
      return renderRecommendedNextCard(candidate);
    }
    return renderRecommendedNextPhaseWorkCard(curPhase, snapForPhase);
  }

  if (snapForPhase) {
    const closeout = renderRecommendedNextCloseoutCard({
      curPhase,
      nextKitPhase:
        args.ws?.nextKitPhase != null ? String(args.ws.nextKitPhase).trim() : "",
      snapshot: snapForPhase,
      humanGatesCount: args.humanGatesCount
    });
    if (closeout.length > 0) {
      return closeout;
    }
  }

  if (args.readyCount > 0 && args.suggestedNext && typeof args.suggestedNext === "object") {
    return renderRecommendedNextCard(args.suggestedNext);
  }
  if (args.readyCount === 0 && args.firstWishlistOpen) {
    return renderRecommendedNextWishlistCard(args.firstWishlistOpen);
  }
  return "";
}

function pickFirstRowInCurrentPhase(rows: unknown[], currentPhaseKey: string): unknown | null {
  const cur = currentPhaseKey.trim();
  for (const row of rows) {
    if (dashboardRowPhaseKey(row) === cur) {
      return row;
    }
  }
  return null;
}

/** True when no runnable ready work remains in the current phase queue snapshot. */
function phaseDeliveryQueueDrainedForUpNext(snapshot: PhaseSnapshot): boolean {
  if (snapshot.closeoutPassed) {
    return true;
  }
  if (snapshot.queue.ready > 0) {
    return false;
  }
  return snapshot.remainingCount === 0 && snapshot.queue.inProgress === 0;
}

function renderUpNextTitleRow(title: string, actionsHtml: string): string {
  const actionsBlock =
    actionsHtml.length > 0
      ? '<span class="wc-rec-title-actions">' + actionsHtml + "</span>"
      : "";
  return (
    '<div class="wc-rec-title-row">' +
    '<p class="wc-rec-title">' +
    escapeHtml(title) +
    "</p>" +
    actionsBlock +
    "</div>"
  );
}

function renderRecommendedNextPickPhaseCard(nextKitPhase: string): string {
  const next = nextKitPhase.trim();
  if (next.length > 0) {
    const pk = escapeHtmlAttr(next);
    const title = "Start Phase " + next;
    const startBtn =
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="phase-roster-start" data-wc-phase-key="' +
      pk +
      '" title="Set Phase ' +
      pk +
      ' as the active workspace phase">' +
      escapeHtml(title) +
      " &rarr;</button>";
    return (
      '<div class="wc-rec-next wc-rec-next-pick-phase">' +
      '<div class="wc-rec-header">' +
      '<span class="wc-rec-label">&#9733; Up Next</span>' +
      "</div>" +
      renderUpNextTitleRow(title, startBtn) +
      "</div>"
    );
  }
  return (
    '<div class="wc-rec-next wc-rec-next-pick-phase">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up Next</span>' +
    "</div>" +
    '<p class="wc-rec-title">Choose a phase and start delivery</p>' +
    '<p class="muted wc-rec-subtitle">Use Start on a phase in the roster below when you are ready to deliver.</p>' +
    "</div>"
  );
}

function renderRecommendedNextPhaseWorkCard(curPhase: string, snapshot: PhaseSnapshot): string {
  const parts: string[] = [];
  if (snapshot.queue.inProgress > 0) {
    parts.push(String(snapshot.queue.inProgress) + " in progress");
  }
  if (snapshot.remainingCount > 0) {
    parts.push(String(snapshot.remainingCount) + " remaining");
  }
  if (snapshot.queue.blocked > 0) {
    parts.push(String(snapshot.queue.blocked) + " blocked");
  }
  const detail =
    parts.length > 0
      ? parts.join(" · ") + " — open the Queue tab filtered to this phase."
      : "Open the Queue tab to continue delivery work in this phase.";
  const pk = escapeHtmlAttr(curPhase);
  const queueBtn =
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="open-queue-for-phase" data-wc-phase-key="' +
    pk +
    '" title="Open Queue tab for this phase">Queue &rarr;</button>';
  return (
    '<div class="wc-rec-next wc-rec-next-phase-work">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up Next</span>' +
    "</div>" +
    renderUpNextTitleRow("Continue Phase " + curPhase + " delivery work", queueBtn) +
    '<p class="muted wc-rec-subtitle">' +
    escapeHtml(detail) +
    "</p>" +
    "</div>"
  );
}

function renderRecommendedNextCloseoutCard(args: {
  curPhase: string;
  nextKitPhase: string;
  snapshot: PhaseSnapshot;
  humanGatesCount: number;
}): string {
  if (args.snapshot.released) {
    return (
      '<div class="wc-rec-next wc-rec-next-closeout wc-rec-next-phase-released">' +
      '<div class="wc-rec-header">' +
      '<span class="wc-rec-label">&#9733; Up Next</span>' +
      "</div>" +
      '<p class="wc-rec-title wc-rec-phase-released">Phase released! &#127881;</p>' +
      "</div>"
    );
  }

  const checks = buildPhaseProgressChecks({
    snapshot: args.snapshot,
    humanGateCount: args.humanGatesCount
  });
  const failing = checks.find((c) => !c.ok);
  const cur = args.curPhase.trim();
  const next = args.nextKitPhase.trim();
  const phasePhrase = "Phase " + cur;

  let title = "Complete and release this phase";
  let detail = "Finish the checks below, then use Complete & Release when you are ready.";
  if (failing) {
    title = failing.label;
    detail = failing.failHelp;
  }

  const releaseBtn = renderPhaseCompleteReleaseButton({
    phaseKey: cur,
    phasePhrase,
    taskIds: [],
    workspaceCurrent: cur,
    workspaceNext: next,
    scope: "current",
    closeoutReady: args.snapshot.closeoutPassed && args.snapshot.releaseReadyPercent >= 100,
    disabled:
      !args.snapshot.closeoutPassed ||
      args.snapshot.releaseReadyPercent < 100 ||
      args.humanGatesCount > 0 ||
      args.snapshot.deliveryEvidenceViolationCount > 0
  });

  const actionsHtml = releaseBtn;

  return (
    '<div class="wc-rec-next wc-rec-next-closeout">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up Next</span>' +
    "</div>" +
    renderUpNextTitleRow(title, actionsHtml) +
    '<p class="muted wc-rec-subtitle">' +
    escapeHtml(detail) +
    "</p>" +
    "</div>"
  );
}

/** ★ "Recommended Next" card — kit `suggestedNext` (phase-aware ready ordering). */
function renderRecommendedNextCard(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const row = item as {
    id?: unknown;
    title?: unknown;
  };
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!title && !id) {
    return "";
  }
  const displayTitle = title || id;
  const idAttr = id ? escapeHtmlAttr(id) : "";
  const viewBtn =
    id.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
        idAttr +
        '" title="Open task detail">View &rarr;</button>'
      : "";
  return (
    '<div class="wc-rec-next">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up Next</span>' +
    "</div>" +
    renderUpNextTitleRow(displayTitle, viewBtn) +
    "</div>"
  );
}

/**
 * When the execution ready queue is empty, surface the first open wishlist row so
 * "what to do next" is not a dead end.
 */
function renderRecommendedNextWishlistCard(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const row = item as { id?: unknown; title?: unknown; taskId?: unknown };
  const wishlistId = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (wishlistId.length === 0 && title.length === 0) {
    return "";
  }
  const displayTitle = title.length > 0 ? title : wishlistId;
  const idAttr = escapeHtmlAttr(wishlistId);
  const processBtn =
    wishlistId.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="wishlist-chat" data-wishlist-id="' +
        idAttr +
        '" title="Open wishlist intake in chat">Process &rarr;</button>'
      : "";
  return (
    '<div class="wc-rec-next wc-rec-next-wishlist">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up Next</span>' +
    "</div>" +
    renderUpNextTitleRow(displayTitle, processBtn) +
    "</div>"
  );
}

const PHASE_READINESS_HELP =
  "Shows whether you are ready to start work in this phase. Every check below must pass to reach 100%. Once delivery has started, this score stays at 100%. To track how much of the phase is finished, see Phase Progress.";

/** Reusable contextual help — blue “i”; text lives in data-wc-help-text for the fixed popover. */
function renderContextHelpIcon(helpText: string, ariaLabel = "About this section"): string {
  return (
    '<span class="wc-context-help" tabindex="0" role="button" data-wc-help-text="' +
    escapeHtmlAttr(helpText) +
    '" aria-label="' +
    escapeHtmlAttr(ariaLabel) +
    '">' +
    '<span class="wc-context-help-icon" aria-hidden="true">i</span>' +
    "</span>"
  );
}

/** 5-pill stat row: Ready / Proposed / Blocked / Done / Human — single line on Overview. */
function renderStatPills(
  readyTotal: number,
  proposedTotal: number,
  blockedTotal: number,
  doneTotal: number,
  humanTotal: number
): string {
  const pills: Array<{ label: string; n: number; cls: string; numCls?: string }> = [
    { label: "Ready", n: readyTotal, cls: "wc-pill-ready" },
    { label: "Proposed", n: proposedTotal, cls: "wc-pill-proposed" },
    { label: "Blocked", n: blockedTotal, cls: "wc-pill-blocked" },
    { label: "Done", n: doneTotal, cls: "wc-pill-done" },
    { label: "Human", n: humanTotal, cls: "wc-pill-human", numCls: "wc-stat-num-human" }
  ];
  const filterMap: Record<string, string> = {
    "wc-pill-ready": "ready",
    "wc-pill-proposed": "proposed",
    "wc-pill-blocked": "blocked",
    "wc-pill-done": "all",
    "wc-pill-human": "human-gates"
  };
  return (
    '<div class="wc-stat-pills">' +
    pills
      .map((p) => {
        const filter = filterMap[p.cls] ?? "all";
        return (
          '<button type="button" class="wc-stat-pill ' +
          p.cls +
          '" data-wc-pill-nav="task-engine" data-wc-pill-filter="' +
          escapeHtmlAttr(filter) +
          '" title="Open Queue tab — ' +
          escapeHtmlAttr(p.label) +
          '">' +
          '<span class="wc-stat-num' +
          (p.numCls ? " " + p.numCls : "") +
          '">' +
          escapeHtml(String(p.n)) +
          "</span>" +
          '<span class="wc-stat-lbl">' +
          escapeHtml(p.label) +
          "</span>" +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Filter chip bar for the Queue tab. */
function parsePhaseOrdinal(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

function deriveQueuePhaseFilterOptions(args: {
  workspaceStatus: Record<string, unknown> | null;
  phaseBuckets: unknown[];
  phaseReleaseDates?: Readonly<Record<string, string>>;
}): Array<{ value: string; label: string }> {
  const available = new Set<string>();

  for (const raw of args.phaseBuckets) {
    if (!Array.isArray(raw)) {
      continue;
    }
    for (const bucket of raw) {
      if (!bucket || typeof bucket !== "object") {
        continue;
      }
      const b = bucket as { phaseKey?: unknown };
      const pkRaw = b.phaseKey;
      const pk = pkRaw === null || pkRaw === undefined ? "__no_phase__" : String(pkRaw).trim() || "__no_phase__";
      available.add(pk);
    }
  }

  const labels = new Map<string, string>();
  const setLabel = (value: string, label: string) => {
    if (!available.has(value)) {
      return;
    }
    labels.set(value, label);
  };

  setLabel("__no_phase__", "No Phase");

  const currentOrd = parsePhaseOrdinal(args.workspaceStatus?.currentKitPhase);
  const nextOrd = parsePhaseOrdinal(args.workspaceStatus?.nextKitPhase);

  if (currentOrd !== null) {
    const previous = currentOrd - 1;
    if (previous > 0) {
      setLabel(String(previous), `Previous (${String(previous)})`);
    }
    setLabel(String(currentOrd), `Current (${String(currentOrd)})`);
  }
  if (nextOrd !== null) {
    setLabel(String(nextOrd), `Next (${String(nextOrd)})`);
  }

  for (const k of available) {
    if (labels.has(k)) {
      continue;
    }
    if (k === "__no_phase__") {
      continue;
    }
    labels.set(k, /^\d+$/.test(k) ? `Phase ${k}` : `Phase ${k}`);
  }

  const releaseDates = args.phaseReleaseDates ?? {};
  const phaseValues = [...labels.keys()].sort((a, b) =>
    compareQueuePhaseFilterValues(a, b, releaseDates)
  );

  return [{ value: "all", label: "All phases" }, ...phaseValues.map((value) => ({ value, label: labels.get(value)! }))];
}

function renderFilterChipBar(
  phaseOptions: Array<{ value: string; label: string }>,
  humanGatesCount = 0
): string {
  const select =
    phaseOptions.length > 1
      ? '<label class="wc-phase-filter-wrap">Phase <select class="wc-phase-filter-select" data-wc-phase-filter aria-label="Filter tasks by phase">' +
        phaseOptions
          .map(
            (o) =>
              '<option value="' + escapeHtmlAttr(o.value) + '">' + escapeHtml(o.label) + "</option>"
          )
          .join("") +
        "</select></label>"
      : "";
  const humanGateChipLabel =
    humanGatesCount > 0 ? "Human review (" + String(humanGatesCount) + ")" : "Human review";
  return (
    '<div class="wc-filter-chips" role="toolbar" aria-label="Filter task sections">' +
    '<button type="button" class="wc-filter-chip wc-filter-active" data-wc-filter-btn="all">All</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-ready" data-wc-filter-btn="ready">Ready</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-proposed" data-wc-filter-btn="proposed">Proposed</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-human-gates" data-wc-filter-btn="human-gates">' +
    humanGateChipLabel +
    "</button>" +
    '<button type="button" class="wc-filter-chip wc-filter-chip-blocked" data-wc-filter-btn="blocked">Blocked</button>' +
    select +
    "</div>"
  );
}

function phaseBucketFilterAttr(phaseKey: unknown): string {
  if (phaseKey === null || phaseKey === undefined || String(phaseKey).trim() === "") {
    return ' data-wc-phase-bucket="__no_phase__"';
  }
  return ' data-wc-phase-bucket="' + escapeHtmlAttr(String(phaseKey).trim()) + '"';
}

type PhaseSnapshotQueue = {
  ready: number;
  proposed: number;
  blocked: number;
  inProgress: number;
  research: number;
};

type PhaseSnapshotSegments = {
  completed: number;
  cancelled: number;
  inProgress: number;
  ready: number;
  proposed: number;
  blocked: number;
  research: number;
};

type PhaseSnapshot = {
  phaseKey: string | null;
  closeoutPassed: boolean;
  released: boolean;
  remainingCount: number;
  terminalCount: number;
  checkedTaskCount: number;
  queue: PhaseSnapshotQueue;
  segments: PhaseSnapshotSegments;
  progressPercent: number;
  releaseReadyPercent: number;
  deliveryEvidenceViolationCount: number;
};

const EMPTY_PHASE_QUEUE: PhaseSnapshotQueue = {
  ready: 0,
  proposed: 0,
  blocked: 0,
  inProgress: 0,
  research: 0
};

const EMPTY_PHASE_SEGMENTS: PhaseSnapshotSegments = {
  completed: 0,
  cancelled: 0,
  inProgress: 0,
  ready: 0,
  proposed: 0,
  blocked: 0,
  research: 0
};

function readNonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizePhaseSnapshot(raw: unknown, ws: Record<string, unknown> | null): PhaseSnapshot | null {
  const curPhase = ws?.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  if (!raw || typeof raw !== "object") {
    if (curPhase.length === 0) {
      return null;
    }
    return {
      phaseKey: curPhase,
      closeoutPassed: false,
      released: false,
      remainingCount: 0,
      terminalCount: 0,
      checkedTaskCount: 0,
      queue: { ...EMPTY_PHASE_QUEUE },
      segments: { ...EMPTY_PHASE_SEGMENTS },
      progressPercent: 0,
      releaseReadyPercent: 0,
      deliveryEvidenceViolationCount: 0
    };
  }
  const r = raw as Record<string, unknown>;
  const phaseKey =
    r.phaseKey != null && String(r.phaseKey).trim().length > 0
      ? String(r.phaseKey).trim()
      : curPhase.length > 0
        ? curPhase
        : null;
  const queueRaw = r.queue as Record<string, unknown> | undefined;
  const queue: PhaseSnapshotQueue = {
    ready: readNonNegInt(queueRaw?.ready),
    proposed: readNonNegInt(queueRaw?.proposed),
    blocked: readNonNegInt(queueRaw?.blocked),
    inProgress: readNonNegInt(queueRaw?.inProgress),
    research: readNonNegInt(queueRaw?.research)
  };
  const segRaw = r.segments as Record<string, unknown> | undefined;
  const segments: PhaseSnapshotSegments = {
    completed: readNonNegInt(segRaw?.completed),
    cancelled: readNonNegInt(segRaw?.cancelled),
    inProgress: readNonNegInt(segRaw?.inProgress),
    ready: readNonNegInt(segRaw?.ready),
    proposed: readNonNegInt(segRaw?.proposed),
    blocked: readNonNegInt(segRaw?.blocked),
    research: readNonNegInt(segRaw?.research)
  };
  const checkedTaskCount = readNonNegInt(r.checkedTaskCount);
  const terminalCount = readNonNegInt(r.terminalCount);
  const progressPercent =
    typeof r.progressPercent === "number" && Number.isFinite(r.progressPercent)
      ? Math.min(100, Math.max(0, Math.round(r.progressPercent)))
      : checkedTaskCount > 0
        ? Math.round((terminalCount / checkedTaskCount) * 100)
        : 0;
  const closeoutPassed = r.closeoutPassed === true;
  const releaseReadyPercent =
    typeof r.releaseReadyPercent === "number" && Number.isFinite(r.releaseReadyPercent)
      ? Math.min(100, Math.max(0, Math.round(r.releaseReadyPercent)))
      : closeoutPassed
        ? 100
        : Math.min(99, progressPercent);
  const deliveryEvidenceViolationCount =
    typeof r.deliveryEvidenceViolationCount === "number" && Number.isFinite(r.deliveryEvidenceViolationCount)
      ? Math.max(0, Math.floor(r.deliveryEvidenceViolationCount))
      : 0;
  return {
    phaseKey,
    closeoutPassed,
    released: r.released === true,
    remainingCount: readNonNegInt(r.remainingCount),
    terminalCount,
    checkedTaskCount,
    queue,
    segments,
    progressPercent,
    releaseReadyPercent,
    deliveryEvidenceViolationCount
  };
}

function phaseSegmentTotal(segments: PhaseSnapshotSegments): number {
  return (
    segments.completed +
    segments.cancelled +
    segments.inProgress +
    segments.ready +
    segments.proposed +
    segments.blocked +
    segments.research
  );
}

/** Delivery has started — readiness score locks at 100% for the rest of the phase. */
function phaseWorkHasBegun(snapshot: PhaseSnapshot): boolean {
  const s = snapshot.segments;
  return (
    s.completed > 0 ||
    s.inProgress > 0 ||
    s.cancelled > 0 ||
    snapshot.terminalCount > 0 ||
    snapshot.closeoutPassed ||
    snapshot.released
  );
}

type PhaseReadinessCheck = {
  label: string;
  ok: boolean;
  statusMeta?: string;
  /** Shown via help icon when the check fails — operator actions only (R17.2). */
  failHelp: string;
};

function buildPhaseReadinessChecks(args: {
  curPhase: string;
  blockers: string[];
  pending: string[];
  snapshot: PhaseSnapshot | null;
  workBegun: boolean;
}): PhaseReadinessCheck[] {
  const { curPhase, blockers, pending, snapshot, workBegun } = args;
  const queue = snapshot?.queue ?? EMPTY_PHASE_QUEUE;
  const segments = snapshot?.segments ?? EMPTY_PHASE_SEGMENTS;
  const runnable = queue.ready + queue.inProgress;
  const phaseBlocked = queue.blocked;
  const phaseProposed = queue.proposed;
  const assignedCount = Math.max(
    phaseSegmentTotal(segments),
    snapshot?.checkedTaskCount ?? 0,
    queue.ready + queue.inProgress + queue.proposed + queue.blocked + queue.research
  );
  const hasAssignedTasks = assignedCount > 0;

  const readyWorkOk = workBegun || hasAssignedTasks;
  let readyWorkMeta: string | undefined;
  if (workBegun && runnable === 0) {
    readyWorkMeta =
      segments.completed > 0
        ? String(segments.completed) + " done · work in progress"
        : "work in progress";
  } else if (runnable > 0) {
    readyWorkMeta = String(queue.ready) + " ready · " + String(queue.inProgress) + " in progress";
  } else if (phaseProposed > 0) {
    readyWorkMeta = String(phaseProposed) + " waiting to be accepted";
  } else if (hasAssignedTasks) {
    readyWorkMeta = String(assignedCount) + " assigned";
  } else {
    readyWorkMeta = "no tasks assigned";
  }

  const checks: PhaseReadinessCheck[] = [
    {
      label: "Current phase is set",
      ok: workBegun || curPhase.length > 0,
      statusMeta: curPhase.length > 0 ? "Phase " + curPhase : "not set yet",
      failHelp:
        "Open the Config tab and set your current phase. You need this before work in the phase can begin."
    },
    {
      label: "Tasks assigned to this phase",
      ok: readyWorkOk,
      statusMeta: readyWorkMeta,
      failHelp:
        "Assign at least one task to this phase on the Queue tab before starting delivery."
    },
    {
      label: "No blocked tasks",
      ok: workBegun || phaseBlocked === 0,
      statusMeta: phaseBlocked === 0 ? "none" : String(phaseBlocked) + " blocked",
      failHelp:
        "Open the Queue tab, tap Blocked, and resolve any blocked tasks in this phase before you begin."
    },
    {
      label: "No open decisions",
      ok: workBegun || pending.length === 0,
      statusMeta: pending.length === 0 ? "none" : String(pending.length) + " open",
      failHelp:
        "Open the Config tab and resolve any open decisions before starting this phase."
    },
    {
      label: "No workspace blockers",
      ok: workBegun || blockers.length === 0,
      statusMeta: blockers.length === 0 ? "none" : String(blockers.length) + " open",
      failHelp:
        "Open the Config tab and clear any blockers before starting this phase."
    }
  ];
  return checks;
}

function computePhaseReadinessScore(checks: PhaseReadinessCheck[], workBegun: boolean): number {
  if (workBegun) {
    return 100;
  }
  if (checks.length === 0) {
    return 0;
  }
  const passed = checks.filter((c) => c.ok).length;
  return Math.round((passed / checks.length) * 100);
}

function renderPhaseCheckRow(check: PhaseReadinessCheck): string {
  const { label, ok, statusMeta, failHelp } = check;
  const help =
    !ok && failHelp.trim().length > 0
      ? " " + renderContextHelpIcon(failHelp, "What to do")
      : "";
  return (
    '<div class="wc-cae-check">' +
    '<span class="wc-cae-check-icon ' +
    (ok ? "wc-cae-check-ok" : "wc-cae-check-warn") +
    '">' +
    (ok ? "&#10003;" : "!") +
    "</span>" +
    '<span class="wc-cae-check-label">' +
    escapeHtml(label) +
    help +
    "</span>" +
    (statusMeta
      ? '<span class="muted wc-cae-check-meta"> · ' + escapeHtml(statusMeta) + "</span>"
      : "") +
    "</div>"
  );
}

function renderPhaseReleaseAction(args: {
  phaseKey: string;
  phasePhrase: string;
  workspaceCurrent: string;
  workspaceNext: string;
  snapshot: PhaseSnapshot;
  /** Badge % on Phase Readiness (work-readiness score). */
  readinessScore: number;
  orderingRisk?: PhaseCloseoutOrderingRisk | null;
}): string {
  const delivered = args.snapshot.closeoutPassed && args.snapshot.released;
  if (delivered) {
    return (
      '<span class="wc-phase-readiness-delivered" title="This phase is complete and released">' +
      renderPhaseScheduleTagHtml("delivered") +
      "</span>"
    );
  }
  const releaseReadyPercent = args.snapshot.releaseReadyPercent;
  const readinessScore = Math.min(100, Math.max(0, Math.round(args.readinessScore)));
  const orderingBlocked = args.orderingRisk != null;
  const closeoutReady =
    !orderingBlocked && args.snapshot.closeoutPassed && releaseReadyPercent >= 100;
  return (
    renderPhaseOrderingRiskHtml(args.orderingRisk ?? null) +
    renderPhaseCompleteReleaseButton({
      phaseKey: args.phaseKey,
      phasePhrase: args.phasePhrase,
      taskIds: [],
      workspaceCurrent: args.workspaceCurrent,
      workspaceNext: args.workspaceNext,
      scope: "current",
      closeoutReady,
      disabled: readinessScore < 100 || orderingBlocked,
      laterDeliveredPhases: args.orderingRisk?.laterDeliveredPhaseKeys,
      orderingBlocked
    })
  );
}

function phaseDeliveryBarPercent(segments: PhaseSnapshotSegments): number {
  const total = phaseSegmentTotal(segments);
  if (total === 0) {
    return 0;
  }
  const done = segments.completed + segments.cancelled;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/** Badge % on Phase Progress — all checklist gates including release (not delivery bar alone). */
function phaseProgressOverallPercent(
  snapshot: PhaseSnapshot,
  humanGateCount: number,
  orderingRisk?: PhaseCloseoutOrderingRisk | null,
  phaseReleased?: boolean
): number {
  const checks = buildPhaseProgressChecks({
    snapshot,
    humanGateCount,
    orderingRisk,
    phaseReleased
  });
  if (checks.length === 0) {
    return 0;
  }
  const passed = checks.filter((c) => c.ok).length;
  return Math.min(100, Math.max(0, Math.round((passed / checks.length) * 100)));
}

function renderPhaseProgressBar(segments: PhaseSnapshotSegments): string {
  const total = phaseSegmentTotal(segments);
  if (total === 0) {
    return (
      '<div class="wc-phase-progress-track wc-phase-progress-track-empty" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<span class="muted">No phase delivery tasks</span></div>'
    );
  }
  const parts: Array<{ key: keyof PhaseSnapshotSegments; className: string }> = [
    { key: "completed", className: "wc-phase-seg-completed" },
    { key: "cancelled", className: "wc-phase-seg-cancelled" },
    { key: "inProgress", className: "wc-phase-seg-in-progress" },
    { key: "ready", className: "wc-phase-seg-ready" },
    { key: "proposed", className: "wc-phase-seg-proposed" },
    { key: "blocked", className: "wc-phase-seg-blocked" },
    { key: "research", className: "wc-phase-seg-research" }
  ];
  let barInner = "";
  for (const part of parts) {
    const n = segments[part.key];
    if (n <= 0) {
      continue;
    }
    const pct = (n / total) * 100;
    barInner +=
      '<span class="wc-phase-progress-seg ' +
      part.className +
      '" style="width:' +
      escapeHtmlAttr(String(pct.toFixed(2))) +
      '%" title="' +
      escapeHtmlAttr(String(n)) +
      '"></span>';
  }
  const now = phaseDeliveryBarPercent(segments);
  return (
    '<div class="wc-phase-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    escapeHtmlAttr(String(now)) +
    '">' +
    barInner +
    "</div>"
  );
}

function renderPhaseProgressLegend(segments: PhaseSnapshotSegments): string {
  const items: Array<{ label: string; n: number; className: string }> = [
    { label: "Done", n: segments.completed + segments.cancelled, className: "wc-phase-seg-completed" },
    { label: "In progress", n: segments.inProgress, className: "wc-phase-seg-in-progress" },
    { label: "Ready", n: segments.ready, className: "wc-phase-seg-ready" },
    { label: "Proposed", n: segments.proposed, className: "wc-phase-seg-proposed" },
    { label: "Blocked", n: segments.blocked, className: "wc-phase-seg-blocked" },
    { label: "Research", n: segments.research, className: "wc-phase-seg-research" }
  ];
  const visible = items.filter((i) => i.n > 0);
  if (visible.length === 0) {
    return "";
  }
  return (
    '<div class="wc-phase-progress-legend">' +
    visible
      .map(
        (i) =>
          '<span class="wc-phase-progress-legend-item"><span class="wc-phase-progress-legend-swatch ' +
          i.className +
          '" aria-hidden="true"></span>' +
          escapeHtml(i.label) +
          " " +
          escapeHtml(String(i.n)) +
          "</span>"
      )
      .join("") +
    "</div>"
  );
}

function workspaceCurrentPhaseKey(ws: Record<string, unknown> | null | undefined): string {
  return ws?.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
}

type PhaseProgressCheck = PhaseReadinessCheck;

/** True when workspace may clear current phase via Mark Phase Complete. */
function phaseMarkCompleteReady(snapshot: PhaseSnapshot, humanGateCount: number): boolean {
  const evidenceOk =
    snapshot.checkedTaskCount === 0 || snapshot.deliveryEvidenceViolationCount === 0;
  return (
    snapshot.closeoutPassed &&
    snapshot.remainingCount === 0 &&
    humanGateCount === 0 &&
    evidenceOk
  );
}

function renderPhaseMarkCompleteButton(phaseKey: string, ready: boolean): string {
  const pk = escapeHtmlAttr(phaseKey.trim());
  const disabled = !ready;
  const title = ready
    ? "Clear the active phase after delivery is complete"
    : "Finish delivery tasks, clear human review items, and record evidence before marking this phase complete.";
  const disabledAttr = disabled ? ' disabled aria-disabled="true"' : "";
  return (
    '<div class="wc-phase-progress-footer">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-mark-complete-btn' +
    (disabled ? " wc-btn-disabled" : "") +
    '" data-wc-action="phase-mark-complete"' +
    disabledAttr +
    ' data-wc-phase-key="' +
    pk +
    '" title="' +
    escapeHtmlAttr(title) +
    '">Mark Phase Complete</button>' +
    "</div>"
  );
}

function buildPhaseProgressChecks(args: {
  snapshot: PhaseSnapshot;
  humanGateCount: number;
  orderingRisk?: PhaseCloseoutOrderingRisk | null;
  phaseReleased?: boolean;
}): PhaseProgressCheck[] {
  const { snapshot, humanGateCount, orderingRisk, phaseReleased } = args;
  const segments = snapshot.segments;
  const started = phaseWorkHasBegun(snapshot);
  const checked = snapshot.checkedTaskCount;
  const evidenceOk = snapshot.deliveryEvidenceViolationCount === 0;
  const releaseReady = snapshot.releaseReadyPercent >= 100;
  const orderingOk = orderingRisk == null;
  const released = phaseReleased ?? snapshot.released;

  return [
    {
      label: "Phase ordering vs roster",
      ok: orderingOk,
      statusMeta: orderingOk
        ? "aligned"
        : orderingRisk!.laterDeliveredPhaseKeys.length > 0
          ? orderingRisk!.laterDeliveredPhaseKeys.map((k) => "P" + k).join(", ")
          : "legacy ahead",
      failHelp:
        "Later phases are already marked delivered while this phase is still current. Follow .ai/runbooks/phase-closeout-ordering-recovery.md before Complete & Release."
    },
    {
      label: "Delivery work started",
      ok: started,
      statusMeta: started ? "underway" : "not started",
      failHelp: "Pick up ready tasks on the Queue tab to begin delivery for this phase."
    },
    {
      label: "All delivery tasks finished",
      ok: snapshot.closeoutPassed,
      statusMeta: snapshot.closeoutPassed
        ? "done"
        : snapshot.remainingCount > 0
          ? String(snapshot.remainingCount) + " remaining"
          : checked === 0
            ? "no delivery tasks"
            : "in progress",
      failHelp:
        "Finish or handle every delivery task in this phase. Check the Queue tab for remaining work."
    },
    {
      label: "Delivery evidence recorded",
      ok: checked === 0 || evidenceOk,
      statusMeta:
        checked === 0
          ? "n/a"
          : evidenceOk
            ? "clear"
            : String(snapshot.deliveryEvidenceViolationCount) + " gaps",
      failHelp:
        "Add delivery evidence on finished tasks before release. Open a task row and complete its delivery evidence fields."
    },
    {
      label: "Human review clear",
      ok: humanGateCount === 0,
      statusMeta: humanGateCount === 0 ? "none" : String(humanGateCount) + " waiting",
      failHelp:
        "Resolve items waiting for human review on the Queue tab (Human filter) before you release this phase."
    },
    {
      label: "Phase released",
      ok: released,
      statusMeta: released ? "delivered" : "still current",
      failHelp: "Use Complete & Release when every check above passes."
    },
    {
      label: "Ready to release",
      ok: releaseReady,
      statusMeta: releaseReady ? "100%" : String(snapshot.releaseReadyPercent) + "%",
      failHelp:
        "Finish remaining delivery tasks and evidence before you release this phase."
    }
  ];
}

function deliveredPhaseKeysInclude(
  delivered: ReadonlySet<string> | readonly string[] | undefined,
  phaseKey: string
): boolean {
  const target = phaseKey.trim();
  if (target.length === 0 || !delivered) {
    return false;
  }
  const values = Array.isArray(delivered) ? delivered : Array.from(delivered.values());
  return values.some((value: string) => String(value).trim() === target);
}

function renderPhaseRosterEditButton(phaseKey: string): string {
  const pk = escapeHtmlAttr(phaseKey.trim());
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary dash-phase-edit-anchor" data-wc-action="phase-deliverables-edit" data-wc-phase-key="' +
    pk +
    '" aria-label="Edit deliverables for phase ' +
    pk +
    '" title="Edit deliverables">Edit</button>'
  );
}

function renderPhaseRosterPhaseLink(phaseKey: string): string {
  const pk = phaseKey.trim();
  const pkAttr = escapeHtmlAttr(pk);
  return (
    '<button type="button" class="dash-phase-roster-phase-link" data-wc-action="open-queue-for-phase" data-wc-phase-key="' +
    pkAttr +
    '" title="Open Queue filtered to Phase ' +
    pkAttr +
    '"><code>' +
    escapeHtml(pk) +
    "</code></button>"
  );
}

function renderPhaseRosterStartSlot(phaseKey: string, isCurrent: boolean): string {
  if (isCurrent) {
    return (
      '<span class="wc-btn wc-btn-sm wc-btn-primary dash-phase-roster-start-spacer" aria-hidden="true"></span>'
    );
  }
  const pk = escapeHtmlAttr(phaseKey.trim());
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-roster-start" data-wc-action="phase-roster-start" data-wc-phase-key="' +
    pk +
    '" title="Set Phase ' +
    escapeHtmlAttr(phaseKey.trim()) +
    ' as the active workspace phase">Start</button>'
  );
}

function renderPhaseRosterActionsCell(
  phaseKey: string,
  opts: { isCurrent: boolean; isDelivered: boolean }
): string {
  if (opts.isDelivered) {
    return '<span class="dash-phase-roster-actions dash-phase-roster-actions--delivered" aria-hidden="true"></span>';
  }
  return (
    '<span class="dash-phase-roster-actions">' +
    renderPhaseRosterEditButton(phaseKey) +
    renderPhaseRosterStartSlot(phaseKey, opts.isCurrent) +
    "</span>"
  );
}

const PHASE_ROSTER_TABLE_HEAD =
  "<tr>" +
  '<th class="dash-phase-roster-col-phase dash-phase-roster-th" scope="col">Phase</th>' +
  '<th class="dash-phase-roster-col-status dash-phase-roster-th" scope="col">Status</th>' +
  '<th class="dash-phase-roster-col-deliverables dash-phase-roster-th" scope="col">Deliverables</th>' +
  '<th class="dash-phase-roster-col-actions dash-phase-roster-th" scope="col">Actions</th>' +
  "</tr>";

/** Phase readiness — can we work this phase now? (scoped to current phase). */
function renderPhaseReadinessCard(
  ws: Record<string, unknown> | null,
  snapshot: PhaseSnapshot | null,
  orderingInputs?: PhaseOrderingInputs
): string {
  const curPhase = workspaceCurrentPhaseKey(ws);
  if (curPhase.length === 0) {
    return "";
  }
  const orderingRisk = resolvePhaseCloseoutOrderingRisk(ws, orderingInputs);
  const nextPhase =
    ws?.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const blockers: string[] = Array.isArray(ws?.blockers)
    ? (ws!.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  const pending: string[] = Array.isArray(ws?.pendingDecisions)
    ? (ws!.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];

  const workBegun = snapshot ? phaseWorkHasBegun(snapshot) : false;

  const checks = buildPhaseReadinessChecks({
    curPhase,
    blockers,
    pending,
    snapshot,
    workBegun
  });
  const score = computePhaseReadinessScore(checks, workBegun);
  const scoreColor =
    score >= 100 ? "wc-cae-score-ok" : score >= 60 ? "wc-cae-score-warn" : "wc-cae-score-bad";

  const phaseSection =
    curPhase.length > 0
      ? '<p><b>Current Phase</b> ' +
        escapeHtml(curPhase) +
        (nextPhase.length > 0 && nextPhase !== curPhase
          ? ' &rarr; <span class="muted">' + escapeHtml(nextPhase) + "</span>"
          : "") +
        "</p>"
      : '<p class="muted">No current phase is set. Open the Config tab to choose one.</p>';

  const checksSection =
    '<div class="wc-cae-checks">' + checks.map((c) => renderPhaseCheckRow(c)).join("") + "</div>";

  const workBegunNote = workBegun
    ? '<p class="muted wc-phase-readiness-locked">Work in this phase has already started. Readiness stays at 100%.</p>'
    : "";

  const pendingBlock =
    pending.length > 0
      ? '<div class="wc-cae-decisions">' +
        '<p><b>Pending Decisions</b></p>' +
        pending
          .slice(0, 3)
          .map(
            (d) =>
              '<div class="wc-cae-decision">' +
              escapeHtml(d.length > 90 ? d.slice(0, 89) + "…" : d) +
              "</div>"
          )
          .join("") +
        (pending.length > 3
          ? '<p class="muted">+' + String(pending.length - 3) + " more pending decisions</p>"
          : "") +
        "</div>"
      : "";

  const readinessTitle =
    curPhase.length > 0
      ? "<b>Phase Readiness · Phase " + escapeHtml(curPhase) + "</b>" + renderContextHelpIcon(PHASE_READINESS_HELP)
      : "<b>Phase Readiness</b>" + renderContextHelpIcon(PHASE_READINESS_HELP);
  const sectionAriaLabel =
    curPhase.length > 0 ? "Phase readiness · Phase " + curPhase : "Phase readiness";
  const releaseBtn =
    snapshot && curPhase.length > 0
      ? renderPhaseReleaseAction({
          phaseKey: curPhase,
          phasePhrase: "Phase " + curPhase,
          workspaceCurrent: curPhase,
          workspaceNext: nextPhase,
          snapshot,
          readinessScore: score,
          orderingRisk
        })
      : "";

  return (
    '<section class="dash-card wc-cae-readiness wc-cae-readiness-collapsed" aria-label="' +
    escapeHtmlAttr(sectionAriaLabel) +
    '" data-wc-preserve-expanded="phase-readiness"' +
    wcUiStateAttr("phase-readiness-" + curPhase) +
    ">" +
    '<div class="wc-cae-readiness-head">' +
    '<button type="button" class="wc-cae-readiness-toggle" data-wc-action="phase-readiness-toggle" aria-expanded="false" aria-controls="wc-cae-readiness-body">' +
    '<span class="wc-cae-readiness-title">' +
    readinessTitle +
    "</span>" +
    '<span class="wc-cae-score-badge ' +
    scoreColor +
    '" title="Readiness to start this phase. Reach 100% before work begins.">' +
    escapeHtml(String(score)) +
    "<span>%</span></span>" +
    "</button>" +
    releaseBtn +
    "</div>" +
    '<div class="wc-cae-readiness-body" id="wc-cae-readiness-body">' +
    '<p class="muted wc-phase-card-hint">Every check below must pass before you begin. Complete &amp; Release unlocks at 100% readiness.</p>' +
    workBegunNote +
    phaseSection +
    checksSection +
    pendingBlock +
    "</div>" +
    "</section>"
  );
}

/** Phase progress — delivery task completion and release closeout. */
function renderPhaseProgressCard(
  ws: Record<string, unknown> | null,
  snapshot: PhaseSnapshot | null,
  humanGateCount: number,
  orderingInputs?: PhaseOrderingInputs
): string {
  const curPhase = workspaceCurrentPhaseKey(ws);
  if (curPhase.length === 0 || !snapshot) {
    return "";
  }
  const orderingRisk = resolvePhaseCloseoutOrderingRisk(ws, orderingInputs);
  const phaseReleased =
    snapshot.released ||
    deliveredPhaseKeysInclude(orderingInputs?.deliveredPhaseKeys, snapshot.phaseKey ?? curPhase);
  const nextPhase =
    ws?.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const segments = snapshot?.segments ?? EMPTY_PHASE_SEGMENTS;
  const barPct = phaseDeliveryBarPercent(segments);
  const overallPct = phaseProgressOverallPercent(snapshot, humanGateCount, orderingRisk, phaseReleased);
  const terminal = snapshot?.terminalCount ?? 0;
  const checked = snapshot?.checkedTaskCount ?? 0;
  const remaining = snapshot?.remainingCount ?? 0;
  const scoreColor =
    overallPct >= 100
      ? "wc-cae-score-ok"
      : overallPct >= 75
        ? "wc-cae-score-warn"
        : "wc-cae-score-bad";

  const summaryLine =
    checked > 0
      ? escapeHtml(String(terminal)) +
        " of " +
        escapeHtml(String(checked)) +
        " delivery tasks terminal" +
        (remaining > 0 ? " · " + escapeHtml(String(remaining)) + " remaining" : "")
      : "No delivery tasks in this phase";

  const closeoutLine = snapshot.closeoutPassed
    ? '<p class="wc-phase-closeout-ok">All delivery tasks in this phase are finished.</p>'
    : remaining > 0
      ? '<p class="muted">Finish remaining delivery tasks in this phase before you release it.</p>'
      : "";

  const progressChecks = buildPhaseProgressChecks({
    snapshot,
    humanGateCount,
    orderingRisk,
    phaseReleased
  });
  const progressChecksSection =
    '<div class="wc-cae-checks wc-phase-progress-checks">' +
    progressChecks.map((c) => renderPhaseCheckRow(c)).join("") +
    "</div>";
  const markCompleteReady = phaseMarkCompleteReady(snapshot, humanGateCount);

  return (
    '<section class="dash-card wc-phase-progress wc-phase-progress-collapsed" aria-label="Phase progress · Phase ' +
    escapeHtmlAttr(curPhase) +
    '" data-wc-preserve-expanded="phase-progress"' +
    wcUiStateAttr("phase-progress-" + curPhase) +
    ">" +
    '<div class="wc-phase-progress-head">' +
    '<button type="button" class="wc-cae-readiness-toggle" data-wc-action="phase-progress-toggle" aria-expanded="false" aria-controls="wc-phase-progress-body">' +
    '<span class="wc-cae-readiness-title"><b>Phase Progress · Phase ' +
    escapeHtml(curPhase) +
    "</b></span>" +
    '<span class="wc-cae-score-badge ' +
    scoreColor +
    '" title="Progress toward release for this phase (100% requires every check below)">' +
    escapeHtml(String(overallPct)) +
    "<span>%</span></span>" +
    "</button>" +
    "</div>" +
    '<div class="wc-phase-progress-body" id="wc-phase-progress-body">' +
    '<p class="wc-phase-progress-summary">' +
    summaryLine +
    "</p>" +
    renderPhaseProgressBar(segments) +
    renderPhaseProgressLegend(segments) +
    renderPhaseOrderingRiskHtml(orderingRisk) +
    progressChecksSection +
    closeoutLine +
    renderPhaseMarkCompleteButton(curPhase, markCompleteReady) +
    "</div>" +
    "</section>"
  );
}


type EditorIntegrationRenderState = {
  appName?: unknown;
  uriScheme?: unknown;
  ideKind?: unknown;
  chatPrefill?: {
    label?: unknown;
    canPrefillDirectly?: unknown;
    externalCursorDeeplink?: unknown;
    commands?: Record<string, unknown>;
  };
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function renderTaskMetadataChip(kind: string, label: string): string {
  return '<span class="dash-task-chip dash-task-chip-' + escapeHtmlAttr(kind) + '">' + escapeHtml(label) + "</span>";
}

function renderDashboardTaskBody(
  row: {
    id?: unknown;
    title?: unknown;
    summary?: unknown;
    priority?: unknown;
    severity?: unknown;
    components?: unknown;
    component?: unknown;
    features?: unknown;
    featureDetails?: unknown;
  },
  options?: { includeFallbackFeatureDetails?: boolean }
): string {
  const id = String(row?.id ?? "").trim();
  const title = String(row?.title ?? "").trim();
  const summaryRaw = String(row?.summary ?? row?.title ?? "").trim();
  const summary = summaryRaw.length > 0 ? summaryRaw : title;
  const priority = String(row?.priority ?? "").trim();
  const severity = String(row?.severity ?? "").trim();
  const featureDetails = Array.isArray(row?.featureDetails)
    ? (row.featureDetails as Array<Record<string, unknown>>)
    : [];
  const components = [
    ...normalizeStringArray(row?.components),
    ...normalizeStringArray(row?.component),
    ...(options?.includeFallbackFeatureDetails === false
      ? []
      : featureDetails
          .map((detail) => String(detail?.componentDisplayName ?? detail?.componentId ?? "").trim())
          .filter((value) => value.length > 0))
  ].filter((value, index, values) => values.indexOf(value) === index);
  const features = [
    ...normalizeStringArray(row?.features),
    ...featureDetails
      .map((detail) => String(detail?.name ?? detail?.slug ?? "").trim())
      .filter((value) => value.length > 0)
  ].filter((value, index, values) => values.indexOf(value) === index);

  const chips: string[] = [];
  if (priority.length > 0) {
    chips.push(renderTaskMetadataChip("priority", priority));
  }
  if (severity.length > 0) {
    chips.push(renderTaskMetadataChip("severity", severity));
  }
  for (const component of components) {
    chips.push(renderTaskMetadataChip("component", component));
  }
  for (const feature of features) {
    chips.push(renderTaskMetadataChip("feature", feature));
  }

  return (
    '<span class="dash-row-label dash-task-row-body">' +
    '<span class="dash-task-row-line">' +
    (id.length > 0 ? '<span class="dash-task-row-id">' + escapeHtml(id) + "</span>" : "") +
    (chips.length > 0 ? '<span class="dash-task-row-chips">' + chips.join("") + "</span>" : "") +
    "</span>" +
    '<span class="dash-task-row-summary" title="' +
    escapeHtmlAttr(summary) +
    '">' +
    escapeHtml(summary) +
    "</span></span>"
  );
}

function renderTaskRowList(items: unknown, emptyMessage = "No ready tasks."): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">' + escapeHtml(emptyMessage) + "</p>";
  }
  return (
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as {
          id?: unknown;
          title?: unknown;
          summary?: unknown;
          priority?: unknown;
          severity?: unknown;
          components?: unknown;
          component?: unknown;
          features?: unknown;
          featureDetails?: unknown;
        };
        const id = String(row?.id ?? "").trim();
        const idAttr = escapeHtml(id);
        return (
          '<div class="dash-row" role="listitem">' +
          renderDashboardTaskBody(row) +
          renderQueueTaskActionButtons(id) +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderWishlistOpenList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No Items</p>';
  }
  return (
    '<p class="muted"><b>Wishlist Preview</b></p>' +
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; taskId?: unknown };
        const id = String(row?.id ?? "").trim();
        const taskId = String(row?.taskId ?? row?.id ?? "").trim();
        const title = escapeHtml(String(row?.title ?? ""));
        const label = escapeHtml(id) + (id ? " " : "") + title;
        const idAttr = escapeHtml(id);
        const taskIdAttr = escapeHtml(taskId);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          label +
          "</span>" +
          '<span class="dash-row-actions">' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="wishlist-view" data-wishlist-id="' +
          idAttr +
          '" title="Open wishlist item details">View</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="wishlist-chat" data-wishlist-id="' +
          idAttr +
          '" title="Open wishlist intake in chat">Process</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="wishlist-decline" data-task-id="' +
          taskIdAttr +
          '" title="Decline this wishlist item">Decline</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderDashboardIdeasSectionInnerHtml(rawIdeas: unknown): string {
  const ideas = rawIdeas && typeof rawIdeas === "object" ? (rawIdeas as Record<string, unknown>) : {};
  const available = ideas.available === true;
  const top = Array.isArray(ideas.top) ? ideas.top.slice(0, 5) : [];
  const openCount = Number(ideas.openCount ?? 0);
  const planningCount = Number(ideas.planningCount ?? 0);
  const plannedCount = Number(ideas.plannedCount ?? 0);
  const totalCount = Number(ideas.totalCount ?? top.length);
  const rows = top
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const title = String(row.title ?? id).trim();
      const note = typeof row.note === "string" ? row.note.trim() : "";
      const status = String(row.status ?? "open").trim();
      const planningChatSession = row.planningChatSession && typeof row.planningChatSession === "object"
        ? (row.planningChatSession as Record<string, unknown>)
        : null;
      const hasPlanningChatSession = planningChatSession?.status === "active" && planningChatSession.ideaId === id;
      const displayNote = note.length > 160 ? note.slice(0, 157).trimEnd() + "..." : note;
      const idAttr = escapeHtmlAttr(id);
      const titleAttr = escapeHtmlAttr(title);
      const noteAttr = escapeHtmlAttr(note);
      if (!title) {
        return "";
      }
      return (
        '<div class="wc-ideas-row" draggable="true" data-wc-idea-id="' +
        idAttr +
        '" data-wc-idea-title="' +
        titleAttr +
        '" data-wc-idea-note="' +
        noteAttr +
        '">' +
        '<div class="wc-ideas-row-view">' +
        '<span class="wc-ideas-drag-handle" aria-hidden="true" title="Drag to reorder">::</span>' +
        '<div class="wc-ideas-row-main"><b data-wc-idea-title-view="1">' +
        escapeHtml(title) +
        "</b>" +
        (id ? " <code>" + escapeHtml(id) + "</code>" : "") +
        (displayNote ? '<p class="muted" data-wc-idea-note-view="1">' + escapeHtml(displayNote) + "</p>" : "") +
        "</div>" +
        '<span class="wc-tag">' +
        escapeHtml(status) +
        "</span>" +
        '<span class="wc-ideas-row-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="idea-plan">' +
        (hasPlanningChatSession ? "Resume planning &rarr;" : "Plan this") +
        "</button>" +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="idea-edit">Edit</button>' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="idea-delete">Delete</button>' +
        "</span>" +
        "</div>" +
        '<div class="wc-ideas-edit-form" data-wc-ideas-edit-form="1" hidden>' +
        '<input class="wc-input" data-wc-idea-edit-title="1" type="text" maxlength="180" value="' +
        titleAttr +
        '" aria-label="Idea title" />' +
        '<textarea class="wc-textarea" data-wc-idea-edit-note="1" rows="2" maxlength="1200" aria-label="Idea note">' +
        escapeHtml(note) +
        "</textarea>" +
        '<div class="wc-ideas-create-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="idea-update">Save</button>' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="idea-edit-cancel">Cancel</button>' +
        '<span class="muted wc-ideas-row-status" data-wc-idea-row-status="1" role="status" aria-live="polite"></span>' +
        "</div>" +
        "</div>" +
        "</div>"
      );
    })
    .filter((row) => row.length > 0)
    .join("");
  const body = !available
    ? '<p class="muted">Ideas unavailable.</p>'
    : rows.length === 0
      ? '<p class="muted">No ideas yet.</p>'
      : '<div class="wc-ideas-list" data-wc-ideas-list="1">' + rows + "</div>";
  const form = available
    ? '<form class="wc-ideas-create-form" data-wc-ideas-create-form="1">' +
      '<label class="wc-field-label" for="wc-idea-title">New idea</label>' +
      '<input id="wc-idea-title" class="wc-input" data-wc-idea-title="1" type="text" required maxlength="180" placeholder="Title" autocomplete="off" />' +
      '<textarea class="wc-textarea" data-wc-idea-note="1" rows="2" maxlength="1200" placeholder="Optional note"></textarea>' +
      '<div class="wc-ideas-create-actions">' +
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="idea-create">Add idea</button>' +
      '<span class="muted wc-ideas-create-status" data-wc-ideas-create-status="1" role="status" aria-live="polite"></span>' +
      "</div>" +
      "</form>"
    : "";
  return (
    '<section class="dash-card wc-ideas-section" aria-label="Ideas">' +
    "<p><b>Ideas</b> · Open " +
    escapeHtml(String(openCount)) +
    " · Planning " +
    escapeHtml(String(planningCount)) +
    " · Planned " +
    escapeHtml(String(plannedCount)) +
    " · Total " +
    escapeHtml(String(totalCount)) +
    "</p>" +
    '<div class="wc-ideas-toast" data-wc-ideas-toast="1" role="status" aria-live="polite" hidden></div>' +
    body +
    form +
    "</section>"
  );
}

function renderWishlistPager(openPage: number, openTotalPages: number): string {
  if (openTotalPages <= 1) {
    return "";
  }
  const prevPage = openPage > 0 ? openPage - 1 : 0;
  const lastPage = openTotalPages - 1;
  const nextPage = openPage < lastPage ? openPage + 1 : lastPage;
  const prevDisabled = openPage <= 0;
  const nextDisabled = openPage >= lastPage;
  return (
    '<div class="wc-wishlist-pager muted" role="navigation" aria-label="Wishlist pages" style="display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary"' +
    (prevDisabled ? " disabled" : "") +
    ' data-wc-action="wishlist-page" data-wishlist-page="' +
    String(prevPage) +
    '">Prev</button>' +
    '<span>Page ' +
    String(openPage + 1) +
    " of " +
    String(openTotalPages) +
    "</span>" +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary"' +
    (nextDisabled ? " disabled" : "") +
    ' data-wc-action="wishlist-page" data-wishlist-page="' +
    String(nextPage) +
    '">Next</button>' +
    "</div>"
  );
}

function renderProposedImprovementRow(row: {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  phase?: unknown;
  priority?: unknown;
  severity?: unknown;
  components?: unknown;
  component?: unknown;
  features?: unknown;
  featureDetails?: unknown;
}): string {
  const id = String(row?.id ?? "").trim();
  return (
    '<div class="dash-row" role="listitem">' +
    renderDashboardTaskBody(row) +
    renderProposedQueueTaskActionButtons(id, {
      acceptAction: "proposed-imp-accept",
      declineAction: "proposed-imp-decline",
    }) +
    "</div>"
  );
}

function renderProposedImprovementsList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      '<p class="muted">No proposed improvements.</p>' +
      '<p class="muted">Run <code>generate-recommendations</code>, <code>ingest-transcripts</code>, or <code>create-task</code>.</p>'
    );
  }
  const more =
    count > items.length
      ? ""
      : "";
  return (
    more +
    '<div class="dash-row-list" role="list">' +
    items.map((x) => renderProposedImprovementRow(x as { id?: unknown; title?: unknown; phase?: unknown })).join("") +
    "</div>"
  );
}

function renderTranscriptChurnResearchRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
  const id = String(row?.id ?? "").trim();
  const title = escapeHtml(String(row?.title ?? ""));
  const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
  const label = "- " + escapeHtml(id) + (id ? " " : "") + title + ph;
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    '<span class="dash-row-label">' +
    label +
    "</span>" +
    '<span class="dash-row-actions">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
    idAttr +
    '" title="Open task detail">View</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="transcript-churn-research-chat" data-task-id="' +
    idAttr +
    '" title="Open transcript churn research playbook in chat">Research</button>' +
    "</span></div>"
  );
}

function renderTranscriptChurnResearchList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No transcript churn rows.</p>';
  }
  const more =
    count > items.length
      ? ""
      : "";
  return (
    more +
    '<div class="dash-row-list" role="list">' +
    (items as unknown[])
      .map((x) => renderTranscriptChurnResearchRow(x as { id?: unknown; title?: unknown; phase?: unknown }))
      .join("") +
    "</div>"
  );
}

function renderProposedExecutionRow(row: {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  phase?: unknown;
  priority?: unknown;
  severity?: unknown;
  components?: unknown;
  component?: unknown;
  features?: unknown;
  featureDetails?: unknown;
}): string {
  const id = String(row?.id ?? "").trim();
  return (
    '<div class="dash-row" role="listitem">' +
    renderDashboardTaskBody(row) +
    renderProposedQueueTaskActionButtons(id, {
      acceptAction: "proposed-exe-accept",
      declineAction: "proposed-exe-decline",
    }) +
    "</div>"
  );
}

function renderProposedExecutionList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No proposed execution tasks (<code>status: proposed</code>, not improvement-type, not wishlist).</p>';
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + ".</p>"
      : "";
  return (
    more +
    '<div class="dash-row-list" role="list">' +
    items.map((x) => renderProposedExecutionRow(x as { id?: unknown; title?: unknown; phase?: unknown })).join("") +
    "</div>"
  );
}

function renderBlockedList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No blocked tasks.</p>';
  }
  return (
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { taskId?: unknown; blockedBy?: unknown };
        const tid = String(row?.taskId ?? "").trim();
        const deps = Array.isArray(row?.blockedBy) ? (row.blockedBy as string[]).join(", ") : "";
        const label = "- " + escapeHtml(tid) + " blocked by " + escapeHtml(deps);
        const idAttr = escapeHtml(tid);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">' +
          label +
          "</span>" +
          renderQueueTaskActionButtons(tid) +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function humanGateStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_review":
      return "Awaiting review";
    case "awaiting_policy_approval":
      return "Awaiting approval";
    case "awaiting_external_decision":
      return "Awaiting external decision";
    default:
      return status;
  }
}

function renderHumanGateRow(row: {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  phase?: unknown;
  status?: unknown;
  gateKind?: unknown;
  ageMs?: unknown;
  requestedDecision?: unknown;
  owner?: unknown;
  priority?: unknown;
  severity?: unknown;
  components?: unknown;
  component?: unknown;
  features?: unknown;
  featureDetails?: unknown;
}): string {
  const id = String(row?.id ?? "").trim();
  const idAttr = escapeHtml(id);
  const status = String(row?.status ?? row?.gateKind ?? "").trim();
  const ageMin =
    typeof row?.ageMs === "number" && Number.isFinite(row.ageMs)
      ? Math.max(0, Math.round(row.ageMs / 60_000))
      : 0;
  const gateLabel = humanGateStatusLabel(status);
  const decision =
    row?.requestedDecision != null && String(row.requestedDecision).trim().length > 0
      ? String(row.requestedDecision).trim()
      : "";
  const owner =
    row?.owner != null && String(row.owner).trim().length > 0 ? String(row.owner).trim() : "";
  const metaParts = [gateLabel];
  if (decision.length > 0) {
    metaParts.push(decision);
  }
  if (ageMin > 0) {
    metaParts.push(String(ageMin) + "m");
  }
  if (owner.length > 0) {
    metaParts.push("owner: " + owner);
  }
  return (
    '<div class="dash-row dash-human-gate-row" role="listitem">' +
    '<div class="dash-human-gate-main">' +
    renderDashboardTaskBody(row) +
    '<span class="dash-human-gate-meta muted">' +
    escapeHtml(metaParts.join(" · ")) +
    "</span></div>" +
    '<span class="dash-row-actions">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
    idAttr +
    '" title="Open task detail">View Task</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="human-gate-resume-ready" data-task-id="' +
    idAttr +
    '" title="Return task to ready queue">Resume ready</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="human-gate-resume-work" data-task-id="' +
    idAttr +
    '" title="Resume in-progress work">Resume work</button>' +
    "</span></div>"
  );
}

function renderHumanGatesList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No human-gated tasks in the current phase.</p>';
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + ".</p>"
      : "";
  return (
    more +
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) =>
        renderHumanGateRow(
          x as {
            id?: unknown;
            title?: unknown;
            phase?: unknown;
            status?: unknown;
            gateKind?: unknown;
            ageMs?: unknown;
            requestedDecision?: unknown;
            owner?: unknown;
          }
        )
      )
      .join("") +
    "</div>"
  );
}

function phaseBucketsNonEmpty(phaseBuckets: unknown): unknown[] {
  if (!Array.isArray(phaseBuckets)) {
    return [];
  }
  return phaseBuckets.filter((raw) => {
    const c = (raw as { count?: unknown }).count;
    return typeof c !== "number" || c > 0;
  });
}

type ReadyRollupBucket = {
  phaseKey?: unknown;
  label?: unknown;
  count?: unknown;
  top?: unknown;
  taskIds?: unknown;
};

function readyTaskRowId(row: unknown): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  return String((row as { id?: unknown }).id ?? "").trim();
}

function dedupeReadyTaskRowsById(rows: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of rows) {
    const id = readyTaskRowId(row);
    const key = id.length > 0 ? id : JSON.stringify(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}

function readyPhaseBucketMapKey(b: ReadyRollupBucket): string {
  const pk = b.phaseKey != null ? String(b.phaseKey).trim() : "";
  return pk.length > 0 ? pk : "__no_phase__";
}

function fixReadyPhaseBucketLabelCount(label: string, count: number): string {
  if (!label) {
    return `(${count})`;
  }
  if (/\(\d+\)\s*$/.test(label)) {
    return label.replace(/\(\d+\)\s*$/, `(${count})`);
  }
  return `${label} (${count})`;
}

/** Merge improvement + execution ready summaries for a single Queue-tab rollup. */
export function mergeReadyQueueRollupSummaries(
  improvements: Record<string, unknown>,
  execution: Record<string, unknown>
): { count: number; top: unknown[]; phaseBuckets: unknown } {
  const impTop = Array.isArray(improvements.top) ? (improvements.top as unknown[]) : [];
  const exeTop = Array.isArray(execution.top) ? (execution.top as unknown[]) : [];
  const top = dedupeReadyTaskRowsById([...impTop, ...exeTop]);
  const impCount = typeof improvements.count === "number" ? improvements.count : impTop.length;
  const exeCount = typeof execution.count === "number" ? execution.count : exeTop.length;
  const count = impCount + exeCount;
  const phaseBuckets =
    mergeReadyPhaseBuckets(improvements.phaseBuckets, execution.phaseBuckets) ??
    improvements.phaseBuckets ??
    execution.phaseBuckets;
  return { count, top, phaseBuckets };
}

function mergeReadyPhaseBuckets(a: unknown, b: unknown): unknown[] | undefined {
  const arrays = [a, b].filter((x) => Array.isArray(x)) as unknown[][];
  if (arrays.length === 0) {
    return undefined;
  }
  const map = new Map<string, ReadyRollupBucket>();
  for (const arr of arrays) {
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const incoming = raw as ReadyRollupBucket;
      const key = readyPhaseBucketMapKey(incoming);
      const incomingTop = Array.isArray(incoming.top) ? (incoming.top as unknown[]) : [];
      const incomingIds = Array.isArray(incoming.taskIds)
        ? (incoming.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
        : [];
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          phaseKey: incoming.phaseKey ?? null,
          label: incoming.label,
          count: typeof incoming.count === "number" ? incoming.count : incomingTop.length,
          top: [...incomingTop],
          ...(incomingIds.length > 0 ? { taskIds: [...incomingIds] } : {})
        });
        continue;
      }
      const mergedTop = dedupeReadyTaskRowsById([
        ...(Array.isArray(existing.top) ? (existing.top as unknown[]) : []),
        ...incomingTop
      ]);
      const mergedIds = [
        ...new Set([
          ...(Array.isArray(existing.taskIds) ? (existing.taskIds as string[]) : []),
          ...incomingIds
        ])
      ];
      const mergedCount =
        (typeof existing.count === "number" ? existing.count : 0) +
        (typeof incoming.count === "number" ? incoming.count : incomingTop.length);
      const label = fixReadyPhaseBucketLabelCount(
        String(existing.label ?? incoming.label ?? ""),
        mergedCount
      );
      map.set(key, {
        phaseKey: existing.phaseKey ?? incoming.phaseKey ?? null,
        label,
        count: mergedCount,
        top: mergedTop,
        ...(mergedIds.length > 0 ? { taskIds: mergedIds } : {})
      });
    }
  }
  return [...map.values()];
}

/** Phrase inserted for `{phase}` in the "Complete & Release" chat template (dashboard). */
export function resolvePhasePhraseForCompleteRelease(raw: {
  phaseKey?: unknown;
  top?: unknown;
}): string {
  const pk = raw.phaseKey;
  if (pk !== null && pk !== undefined && String(pk).trim() !== "") {
    return `Phase ${String(pk).trim()}`;
  }
  const top = raw.top;
  if (Array.isArray(top) && top.length > 0) {
    const row = top[0] as { phase?: unknown };
    if (row?.phase != null && String(row.phase).trim() !== "") {
      return String(row.phase).trim();
    }
  }
  return "Not Phased";
}

/** Task ids from a dashboard phase bucket (`taskIds` and/or preview `top`). */
export function collectPhaseBucketTaskIds(raw: {
  top?: unknown;
  taskIds?: unknown;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string) => {
    const k = id.trim();
    if (k.length > 0 && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  if (Array.isArray(raw.taskIds)) {
    for (const x of raw.taskIds) {
      if (typeof x === "string") {
        add(x);
      }
    }
  }
  if (Array.isArray(raw.top)) {
    for (const row of raw.top) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const id = (row as { id?: unknown }).id;
      if (id != null) {
        add(String(id));
      }
    }
  }
  return out;
}

function renderPhaseCompleteReleaseButton(args: {
  phaseKey: string;
  phasePhrase: string;
  taskIds: string[];
  workspaceCurrent: string;
  workspaceNext: string;
  scope: "current" | "bucket";
  /** Overview Phase Readiness only — when false, preflight styling (bucket scope ignores). */
  closeoutReady?: boolean;
  /** Overview Phase Readiness — disabled until phase readiness reaches 100%. */
  disabled?: boolean;
  laterDeliveredPhases?: string[];
  orderingBlocked?: boolean;
}): string {
  const pk = escapeHtmlAttr(args.phaseKey.trim());
  const phrase = escapeHtmlAttr(args.phasePhrase.trim());
  const ids = escapeHtmlAttr(args.taskIds.join(","));
  const cur = escapeHtmlAttr(args.workspaceCurrent.trim());
  const nxt = escapeHtmlAttr(args.workspaceNext.trim());
  const scope = args.scope === "current" ? "current" : "bucket";
  const closeoutReady = args.closeoutReady !== false;
  const disabled = args.disabled === true;
  const laterCsv = escapeHtmlAttr((args.laterDeliveredPhases ?? []).join(","));
  const title =
    args.orderingBlocked === true
      ? "Complete & Release blocked: later phases are already marked delivered on the roster. See phase-closeout-ordering-recovery runbook."
      : scope === "current"
        ? disabled
          ? "Complete & Release unlocks when phase readiness reaches 100%."
          : closeoutReady
            ? "Release this phase when you are ready."
            : "Finish the progress checks, then release this phase."
        : "Release every task in this phase bucket when ready.";
  const disabledAttr = disabled ? ' disabled aria-disabled="true"' : "";
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-release-btn' +
    (disabled ? " wc-btn-disabled" : closeoutReady ? "" : " dash-phase-release-btn--preflight") +
    '" data-wc-action="phase-complete-release"' +
    disabledAttr +
    ' data-wc-phase-key="' +
    pk +
    '" data-wc-phase-phrase="' +
    phrase +
    '" data-wc-phase-task-ids="' +
    ids +
    '" data-wc-workspace-current-phase="' +
    cur +
    '" data-wc-workspace-next-phase="' +
    nxt +
    '" data-wc-later-delivered-phases="' +
    laterCsv +
    '" data-wc-release-scope="' +
    scope +
    '" title="' +
    escapeHtmlAttr(title) +
    '">Complete &amp; Release</button>'
  );
}

function readyPhaseBucketHasTasks(raw: unknown): boolean {
  const b = raw as { count?: unknown; top?: unknown };
  if (typeof b.count === "number" && b.count > 0) {
    return true;
  }
  return Array.isArray(b.top) && b.top.length > 0;
}

/**
 * When `dashboard-summary` includes `phaseBuckets`, one `<details>` per phase (closed until expanded).
 */
function renderReadyPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  emptyMessage: string,
  phaseTrackPrefix: string,
  workspaceStatus: Record<string, unknown> | null,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  const wsCur =
    workspaceStatus?.currentKitPhase != null ? String(workspaceStatus.currentKitPhase).trim() : "";
  const wsNext =
    workspaceStatus?.nextKitPhase != null ? String(workspaceStatus.nextKitPhase).trim() : "";
  if (buckets.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    buckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; phaseKey?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const phasePhrase = resolvePhasePhraseForCompleteRelease(b);
        const taskIds = collectPhaseBucketTaskIds(b);
        const showRelease = readyPhaseBucketHasTasks(raw) && phaseKey.length > 0;
        const c = typeof b.count === "number" ? b.count : 0;
        const releaseBtn = showRelease
          ? renderPhaseCompleteReleaseButton({
              phaseKey,
              phasePhrase,
              taskIds,
              workspaceCurrent: wsCur,
              workspaceNext: wsNext,
              scope: "bucket"
            })
          : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs("ready", phaseKey, c, "", collectPhaseBucketTaskIds(b)) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summaryLabel +
          releaseBtn +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderProposedPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderProposedImprovementsList(totalCount, fallbackTop);
  }
  const sumCounts = buckets.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCounts < totalCount
      ? ""
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · Accept/Decline per row; Accept All processes the phase.</p>' +
    '<div class="phase-stack">' +
    buckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown; phaseKey?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-accept-all" data-wc-action="proposed-imp-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" data-proposed-phase-key="' +
              escapeHtmlAttr(typeof b.phaseKey === "string" ? b.phaseKey.trim() : "") +
              '" title="Accept all proposed improvement tasks in this phase">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs("proposed-improvement", phaseKey, c, "", taskIds) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summaryLabel +
          acceptAllBtn +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderTranscriptChurnResearchPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderTranscriptChurnResearchList(totalCount, fallbackTop);
  }
  const sumCounts = buckets.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCounts < totalCount
      ? ""
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    buckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs(
            "transcript-churn",
            phaseKey,
            c,
            "",
            collectPhaseBucketTaskIds(b)
          ) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Proposed execution uses the same row shape as improvements for phase bodies. */
function renderProposedExecutionPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const bucketsPe = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsPe.length === 0) {
    return renderProposedExecutionList(totalCount, fallbackTop);
  }
  const sumCountsPe = bucketsPe.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCountsPe < totalCount
      ? ""
      : "";
  return (
    more +
    '<p class="muted"><b>Accept All</b> accepts every proposed execution task in that phase.</p>' +
    '<div class="phase-stack">' +
    bucketsPe
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown; phaseKey?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-accept-all" data-wc-action="proposed-exe-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" data-proposed-phase-key="' +
              escapeHtmlAttr(typeof b.phaseKey === "string" ? b.phaseKey.trim() : "") +
              '" title="Accept all proposed execution tasks in this phase">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs(
            "proposed-execution",
            phaseKey,
            c,
            "",
            collectPhaseBucketTaskIds(b)
          ) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summaryLabel +
          acceptAllBtn +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderBlockedPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  totalBlocked: number,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const bucketsBl = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsBl.length === 0) {
    return renderBlockedList(fallbackTop);
  }
  const sumBlocked = bucketsBl.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumBlocked < totalBlocked
      ? ""
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    bucketsBl
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs("blocked", phaseKey, c, "", collectPhaseBucketTaskIds(b)) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

const LAZY_QUEUE_BUCKET_LIMIT = 50;

function lazyQueueBucketPlaceholder(count: number): string {
  const hint =
    count > LAZY_QUEUE_BUCKET_LIMIT
      ? "Expand to load the first " + String(LAZY_QUEUE_BUCKET_LIMIT) + " tasks…"
      : "Expand to load tasks…";
  return (
    '<div class="wc-lazy-bucket-body" data-wc-lazy-loaded="0">' +
    '<p class="muted wc-lazy-bucket-hint" role="status">' +
    escapeHtml(hint) +
    "</p></div>"
  );
}

function lazyQueueBucketDetailsAttrs(
  category: string,
  phaseKey: string,
  count: number,
  extraClass = "",
  taskIds: string[] = []
): string {
  const cls =
    "phase-bucket wc-lazy-queue-bucket" +
    (category === "completed" || category === "cancelled" ? " terminal-phase-bucket" : "") +
    (extraClass.length > 0 ? " " + extraClass : "");
  const sortedIds = taskIds.length > 0 ? [...taskIds].sort() : [];
  const taskIdsAttr =
    sortedIds.length > 0
      ? ' data-wc-bucket-task-ids="' + escapeHtmlAttr(sortedIds.join(",")) + '"'
      : "";
  return (
    ' class="' +
    cls +
    '"' +
    ' data-wc-queue-category="' +
    escapeHtmlAttr(category) +
    '" data-wc-phase-key="' +
    escapeHtmlAttr(phaseKey) +
    '" data-wc-bucket-count="' +
    escapeHtmlAttr(String(count)) +
    '"' +
    taskIdsAttr
  );
}

/** @deprecated use lazyQueueBucketListLimit */
function lazyTerminalBucketPlaceholder(count: number): string {
  return lazyQueueBucketPlaceholder(count);
}

/**
 * Terminal statuses (completed / cancelled): bucket summaries only; rows load on first expand.
 */
function renderTerminalTaskPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  _totalInStatus: number,
  emptyMessage: string,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>,
  terminalStatus: "completed" | "cancelled"
): string {
  const bucketsTm = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsTm.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    bucketsTm
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : lazyQueueBucketPlaceholder(c);
        return (
          '<details' +
          lazyQueueBucketDetailsAttrs(
            terminalStatus,
            phaseKey,
            c,
            "wc-lazy-terminal-bucket",
            collectPhaseBucketTaskIds(b)
          ) +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(queuePhaseBucketTrackId(phaseTrackPrefix, phaseKey)) +
          '><summary class="phase-bucket-summary">' +
          summary +
          "</summary>" +
          inner +
          "</details>"
        );
      })
      .join("") +
    "</div>"
  );
}

/** Host-injected HTML for a lazy terminal phase bucket (`list-tasks` preview rows). */
export function renderDashboardQueueTaskRowsHtml(
  tasks: unknown[],
  emptyMessage = "No tasks in this phase."
): string {
  return renderTaskRowList(tasks, emptyMessage);
}

export function lazyTerminalBucketListLimit(): number {
  return LAZY_QUEUE_BUCKET_LIMIT;
}

export function lazyQueueBucketListLimit(): number {
  return LAZY_QUEUE_BUCKET_LIMIT;
}

/** Readable label for `build-plan` planningType / status strings (dashboard only). */
function humanizePlanningToken(raw: string): string {
  const s = raw.trim();
  if (s.length === 0) {
    return "";
  }
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Dashboard-local guided `build-plan` flow (host runs CLI; webview collects answers). */
export type PlanningInterviewWizardPanel =
  | { kind: "picker" }
  | {
      kind: "question";
      planningType: string;
      questionId: string;
      prompt: string;
      examples: string[];
      whyItMatters: string;
      progressHint: string;
    }
  | { kind: "success"; planningType: string; code: string; message: string }
  | { kind: "error"; message: string };

export function renderPlanningInterviewWizardPanel(panel: PlanningInterviewWizardPanel): string {
  const planningTypes: readonly [string, string][] = [
    ["change", "Change / Refactor"],
    ["new-feature", "New Feature"],
    ["task-breakdown", "Task Breakdown"],
    ["sprint-phase", "Sprint / Phase"],
    ["task-ordering", "Task Ordering"]
  ];
  if (panel.kind === "picker") {
    const opts = planningTypes
      .map(
        ([v, label]) =>
          '<option value="' + escapeHtmlAttr(v) + '">' + escapeHtml(label) + "</option>"
      )
      .join("");
    return (
      '<div class="dash-planning-wizard" aria-label="Guided planning interview">' +
      '<div class="dash-planning-wizard-picker-row">' +
      '<label class="dash-planning-wizard-label dash-planning-wizard-label-inline" for="wc-planning-type">Planning Type</label>' +
      '<select id="wc-planning-type" class="dash-planning-wizard-select">' +
      opts +
      "</select>" +
      '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="planning-wizard-start">Start interview</button>' +
      "</div>" +
      "</div>"
    );
  }
  if (panel.kind === "question") {
    const ex =
      panel.examples.length > 0
        ? "<p><b>Examples:</b> " + escapeHtml(panel.examples.join(" · ")) + "</p>"
        : "";
    return (
      '<div class="dash-planning-wizard" aria-label="Planning question">' +
      "<p><b>Question</b> · " +
      escapeHtml(panel.planningType) +
      " · " +
      escapeHtml(panel.progressHint) +
      "</p>" +
      "<p>" +
      escapeHtml(panel.prompt) +
      "</p>" +
      ex +
      (panel.whyItMatters.trim().length > 0
        ? '<p class="muted"><b>Why it matters:</b> ' + escapeHtml(panel.whyItMatters) + "</p>"
        : "") +
      '<label class="dash-planning-wizard-label" for="wc-planning-answer">Your answer</label>' +
      '<textarea id="wc-planning-answer" class="dash-planning-wizard-textarea" rows="5" spellcheck="true"></textarea>' +
      '<p class="dash-planning-wizard-actions">' +
      '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="planning-wizard-submit">Submit answer</button> ' +
      '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="planning-wizard-cancel">Cancel</button>' +
      "</p>" +
      "</div>"
    );
  }
  if (panel.kind === "success") {
    const persistenceHint =
      panel.code === "planning-response-ready"
        ? '<p class="muted">Your answers were saved. No task was created.</p>'
        : panel.code === "planning-wishlist-ready"
          ? '<p class="muted">Your answers were saved. Finish the wishlist flow when you are ready.</p>'
          : panel.code === "planning-artifact-created"
            ? '<p class="muted">Wishlist item created. Refresh the dashboard to see it.</p>'
            : "";
    return (
      '<div class="dash-planning-wizard ok" aria-label="Planning interview complete">' +
      "<p><b>Interview complete</b> · " +
      escapeHtml(panel.planningType) +
      " · <code>" +
      escapeHtml(panel.code) +
      "</code></p>" +
      "<p>" +
      escapeHtml(panel.message) +
      "</p>" +
      persistenceHint +
      '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="planning-wizard-dismiss">Done</button>' +
      "</div>"
    );
  }
  return (
    '<div class="dash-planning-wizard bad" aria-label="Planning interview error">' +
    "<p><b>Interview error</b></p>" +
    "<p>" +
    escapeHtml(panel.message) +
    "</p>" +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="planning-wizard-cancel">Reset</button>' +
    "</div>"
  );
}

function formatPlanningUpdatedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(t);
  } catch {
    return iso;
  }
}

function renderPlanArtifactDraftPanel(planArtifact: unknown): string {
  if (!planArtifact || typeof planArtifact !== "object") {
    return "";
  }
  const summary = planArtifact as Record<string, unknown>;
  const current = summary.current;
  if (!current || typeof current !== "object") {
    return "";
  }
  const row = current as Record<string, unknown>;
  const title = String(row.title ?? "").trim() || "Untitled Plan";
  const planRef = String(row.planRef ?? "").trim();
  const planId = String(row.planId ?? "").trim();
  const statusRaw = String(row.status ?? "").trim();
  const statusDisp = statusRaw.length > 0 ? humanizePlanningToken(statusRaw) : "Draft";
  const planningTypeRaw = String(row.planningType ?? "").trim();
  const planningType = planningTypeRaw.length > 0 ? humanizePlanningToken(planningTypeRaw) : "Planning";
  const version = typeof row.version === "number" ? row.version : Number(row.version ?? 0);
  const versionText = Number.isFinite(version) && version > 0 ? "v" + String(version) : "v?";
  const wbsRows = typeof row.wbsRowCount === "number" ? row.wbsRowCount : Number(row.wbsRowCount ?? 0);
  const openQuestions =
    typeof row.openQuestionCount === "number" ? row.openQuestionCount : Number(row.openQuestionCount ?? 0);
  const updatedAt = String(row.updatedAt ?? "").trim();
  const updatedText = updatedAt.length > 0 ? formatPlanningUpdatedAt(updatedAt) : "—";
  const heading = statusRaw === "draft" ? "Plan Draft" : "Plan Artifact";
  const refLabel = planRef.length > 0 ? planRef : planId;
  const reviewFindings = Array.isArray(row.reviewFindings)
    ? row.reviewFindings
    : Array.isArray(summary.reviewFindings)
      ? summary.reviewFindings
      : [];
  const wbsPreview = Array.isArray(row.wbsPreview)
    ? row.wbsPreview
    : Array.isArray(summary.wbsPreview)
      ? summary.wbsPreview
      : [];
  const reviewHtml =
    reviewFindings.length > 0
      ? '<div class="wc-plan-review" aria-label="Plan review findings">' +
        '<p class="wc-plan-subtitle"><b>Review Findings</b></p>' +
        '<div class="wc-plan-review-list" role="list">' +
        reviewFindings
          .slice(0, 5)
          .map((finding) => {
            const findingRow = finding && typeof finding === "object" ? (finding as Record<string, unknown>) : {};
            const severity = String(findingRow.severity ?? findingRow.level ?? "info").trim() || "info";
            const message = String(findingRow.message ?? findingRow.title ?? findingRow.code ?? "Finding").trim();
            const pathText = String(findingRow.path ?? findingRow.field ?? "").trim();
            return (
              '<div class="wc-plan-review-row" role="listitem">' +
              '<span class="wc-plan-review-severity">' +
              escapeHtml(humanizePlanningToken(severity)) +
              "</span>" +
              '<span class="wc-plan-review-message">' +
              escapeHtml(message) +
              (pathText.length > 0 ? ' <span class="wc-plan-review-path">' + escapeHtml(pathText) + "</span>" : "") +
              "</span>" +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        "</div>"
      : statusRaw === "reviewed" || statusRaw === "accepted" || statusRaw === "finalized"
        ? '<p class="wc-plan-review-pass"><b>Review Passed</b></p>'
        : "";
  const wbsHtml =
    wbsPreview.length > 0
      ? '<div class="wc-plan-wbs" aria-label="WBS preview">' +
        '<p class="wc-plan-subtitle"><b>WBS Preview</b></p>' +
        '<div class="wc-plan-wbs-list" role="list">' +
        wbsPreview
          .slice(0, 5)
          .map((item) => {
            const itemRow = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const itemId = String(itemRow.wbsId ?? itemRow.id ?? "").trim();
            const itemPath = String(itemRow.path ?? "").trim();
            const itemTitle = String(itemRow.title ?? itemRow.suggestedTaskTitle ?? "Untitled WBS item").trim();
            const itemPhase = String(itemRow.recommendedPhase ?? itemRow.phaseKey ?? "").trim();
            const prefix = [itemId, itemPath].filter((value) => value.length > 0).join(" · ");
            return (
              '<div class="wc-plan-wbs-row" role="listitem">' +
              '<span class="wc-plan-wbs-title">' +
              (prefix.length > 0 ? '<b>' + escapeHtml(prefix) + "</b> · " : "") +
              escapeHtml(itemTitle) +
              "</span>" +
              (itemPhase.length > 0 ? '<span class="wc-plan-wbs-phase">' + escapeHtml(itemPhase) + "</span>" : "") +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        "</div>"
      : "";
  const hasBlockingReviewFinding = reviewFindings.some((finding) => {
    const findingRow = finding && typeof finding === "object" ? (finding as Record<string, unknown>) : {};
    const severity = String(findingRow.severity ?? findingRow.level ?? "").trim().toLowerCase();
    return severity === "blocker" || severity === "error";
  });
  const canAccept =
    planId.length > 0 &&
    planRef.length > 0 &&
    Number.isFinite(version) &&
    version > 0 &&
    statusRaw === "reviewed" &&
    !hasBlockingReviewFinding &&
    Number.isFinite(openQuestions) &&
    openQuestions === 0;
  const acceptDisabledReason =
    statusRaw !== "reviewed"
      ? "Review must pass before accepting this plan."
      : hasBlockingReviewFinding
        ? "Review blockers must be resolved before accepting this plan."
        : Number.isFinite(openQuestions) && openQuestions > 0
          ? "Open questions must be resolved or deferred before accepting this plan."
          : planId.length === 0 || planRef.length === 0 || !Number.isFinite(version) || version <= 0
            ? "Plan identity is incomplete."
            : "Accept this reviewed plan.";
  const reviewActionHtml =
    statusRaw === "draft"
      ? '<div class="wc-plan-artifact-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="plan-artifact-review" data-plan-id="' +
        escapeHtmlAttr(planId) +
        '" data-plan-version="' +
        escapeHtmlAttr(Number.isFinite(version) ? String(version) : "") +
        '" title="Review this draft plan with the PlanArtifact rubric"' +
        (planId.length > 0 && Number.isFinite(version) && version > 0 ? "" : " disabled") +
        ">Review</button>" +
        "</div>"
      : "";
  const acceptActionHtml =
    statusRaw === "accepted" || statusRaw === "finalized"
      ? ""
      : '<div class="wc-plan-artifact-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="plan-artifact-accept" data-plan-id="' +
        escapeHtmlAttr(planId) +
        '" data-plan-ref="' +
        escapeHtmlAttr(planRef) +
        '" data-plan-version="' +
        escapeHtmlAttr(Number.isFinite(version) ? String(version) : "") +
        '" title="' +
        escapeHtmlAttr(acceptDisabledReason) +
        '"' +
        (canAccept ? "" : " disabled") +
        ">Accept</button>" +
        "</div>";
  const finalizeActionHtml =
    statusRaw === "accepted"
      ? '<div class="wc-plan-artifact-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="plan-artifact-finalize" data-plan-id="' +
        escapeHtmlAttr(planId) +
        '" data-plan-version="' +
        escapeHtmlAttr(Number.isFinite(version) ? String(version) : "") +
        '" title="Finalize this accepted plan into ready queue tasks">Finalize</button>' +
        "</div>"
      : "";
  return (
    '<section class="dash-card wc-plan-artifact" aria-label="Plan draft">' +
    '<div class="wc-plan-artifact-head">' +
    '<div class="wc-plan-artifact-main">' +
    '<p class="wc-plan-artifact-title"><b>' +
    escapeHtml(heading) +
    "</b> · " +
    escapeHtml(title) +
    "</p>" +
    '<p class="wc-plan-artifact-meta">' +
    escapeHtml(planningType) +
    " · " +
    escapeHtml(versionText) +
    (refLabel.length > 0 ? " · " + escapeHtml(refLabel) : "") +
    "</p>" +
    "</div>" +
    '<span class="wc-plan-artifact-status">' +
    escapeHtml(statusDisp) +
    "</span>" +
    "</div>" +
    '<div class="wc-plan-artifact-stats" role="list">' +
    '<span class="wc-plan-artifact-stat" role="listitem"><b>' +
    escapeHtml(String(Number.isFinite(wbsRows) ? wbsRows : 0)) +
    "</b> WBS rows</span>" +
    '<span class="wc-plan-artifact-stat" role="listitem"><b>' +
    escapeHtml(String(Number.isFinite(openQuestions) ? openQuestions : 0)) +
    "</b> open questions</span>" +
    '<span class="wc-plan-artifact-stat" role="listitem"><span class="wc-plan-artifact-label">Updated</span> ' +
    escapeHtml(updatedText) +
    "</span>" +
    "</div>" +
    reviewHtml +
    wbsHtml +
    reviewActionHtml +
    acceptActionHtml +
    finalizeActionHtml +
    "</section>"
  );
}

function renderPlanningSession(ps: unknown, wizardPanel?: PlanningInterviewWizardPanel | null): string {
  const wizardHtml =
    wizardPanel !== undefined && wizardPanel !== null ? renderPlanningInterviewWizardPanel(wizardPanel) : "";

  if (!ps || typeof ps !== "object") {
    return (
      '<section class="dash-card" aria-label="Planning session">' +
      '<div class="dash-planning-head">' +
      '<div class="dash-planning-head-main"><p class="dash-planning-title"><b>Planning Interview</b></p></div>' +
      "</div>" +
      wizardHtml +
      "</section>"
    );
  }
  const o = ps as Record<string, unknown>;
  const pct = typeof o.completionPct === "number" ? String(o.completionPct) : "—";
  const typeRaw = String(o.planningType ?? "").trim();
  const statusRaw = String(o.status ?? "").trim();
  const typeDisp = typeRaw.length > 0 ? humanizePlanningToken(typeRaw) : "Planning";
  const statusDisp = statusRaw.length > 0 ? humanizePlanningToken(statusRaw) : "—";
  const crit =
    typeof o.answeredCritical === "number" && typeof o.totalCritical === "number"
      ? escapeHtml(String(o.answeredCritical)) +
        " of " +
        escapeHtml(String(o.totalCritical)) +
        " required questions answered"
      : "";
  const when =
    typeof o.updatedAt === "string" && o.updatedAt.length > 0
      ? formatPlanningUpdatedAt(o.updatedAt)
      : "—";
  const resumeCli = String(o.resumeCli ?? "").trim();
  const resumeActions =
    '<span class="dash-planning-actions">' +
    (resumeCli.length > 0
      ? '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="planning-resume-chat" data-resume-cli="' +
        escapeHtmlAttr(resumeCli) +
        '" title="Open a new Agent chat with the saved planning resume command">Resume</button>'
      : "") +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary dash-planning-discard-btn" data-wc-action="planning-discard" title="Discard the saved planning interview">Discard</button>' +
    "</span>";
  return (
    '<section class="dash-card" aria-label="Planning session resume">' +
    '<div class="dash-planning-head">' +
    '<div class="dash-planning-head-main"><p class="dash-planning-title"><b>Planning Interview</b> · ' +
    escapeHtml(typeDisp) +
    " · " +
    escapeHtml(statusDisp) +
    "</p></div>" +
    resumeActions +
    "</div>" +
    "<p>" +
    escapeHtml(pct) +
    "% through required questions" +
    (crit ? " (" + crit + ")" : "") +
    "</p>" +
    '<p class="muted">Last saved: ' +
    escapeHtml(when) +
    "</p>" +
    '<p class="muted">Resume opens a fresh Agent chat with the saved command; Discard clears the saved interview.</p>' +
    "</section>"
  );
}

/** 3-column grid of status counts with right-aligned tabular numbers. */
function buildDashboardStateCountGridHtml(ss: Record<string, unknown>): string {
  const order: [string, string][] = [
    ["research", "Research"],
    ["proposed", "Proposed"],
    ["ready", "Ready"],
    ["in_progress", "In Progress"],
    ["blocked", "Blocked"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"]
  ];
  const cells: { label: string; n: number }[] = [];
  for (const [key, label] of order) {
    const v = ss[key];
    if (typeof v === "number") {
      cells.push({ label, n: v });
    }
  }
  if (cells.length === 0) {
    return '<p class="ok">—</p>';
  }
  return (
    '<div class="dash-count-grid" role="list">' +
    cells
      .map(
        (c) =>
          '<div class="dash-count-cell" role="listitem">' +
          '<span class="dash-count-label">' +
          escapeHtml(c.label) +
          '</span> <span class="dash-count-num ok">' +
          escapeHtml(String(c.n)) +
          "</span></div>"
      )
      .join("") +
    "</div>"
  );
}

function teamAssignmentStatusPhrase(status: string): string {
  switch (status) {
    case "assigned":
      return "Assigned — worker in progress";
    case "submitted":
      return "Submitted — awaiting supervisor reconcile";
    case "blocked":
      return "Blocked";
    default:
      return humanizeDashboardToken(status);
  }
}

function renderTeamAssignmentRowActions(r: Record<string, unknown>): string {
  const id = escapeHtml(String(r.id ?? ""));
  const st = String(r.status ?? "");
  const sup = escapeHtml(String(r.supervisorId ?? ""));
  const wrk = escapeHtml(String(r.workerId ?? ""));
  const parts: string[] = [];
  if (st === "assigned") {
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="team-assignment-handoff" data-assignment-id="' +
        id +
        '" data-worker-id="' +
        wrk +
        '" title="submit-assignment-handoff">Submit handoff</button>'
    );
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="team-assignment-block" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="block-assignment">Block</button>'
    );
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="team-assignment-cancel" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="cancel-assignment">Cancel</button>'
    );
  } else if (st === "submitted") {
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="team-assignment-reconcile" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="reconcile-assignment">Reconcile</button>'
    );
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="team-assignment-block" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="block-assignment">Block</button>'
    );
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="team-assignment-cancel" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="cancel-assignment">Cancel</button>'
    );
  } else if (st === "blocked") {
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="team-assignment-cancel" data-assignment-id="' +
        id +
        '" data-supervisor-id="' +
        sup +
        '" title="cancel-assignment">Cancel</button>'
    );
  }
  if (parts.length === 0) {
    return "";
  }
  return '<div class="dash-row-actions">' + parts.join("") + "</div>";
}

/**
 * **Role** — `data.agentGuidance.displayLabel` (effective `kit.agentGuidance` tier + RPG party catalog).
 * **Agent Temperament** — resolved agent-behavior profile label (`builtin:*` / `custom:*`).
 */
function renderTeamExecutionSection(team: unknown): string {
  if (!team || typeof team !== "object") {
    return "";
  }
  const o = team as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const avail = o.available === true;
  const total = typeof o.totalCount === "number" ? o.totalCount : 0;
  const active = typeof o.activeCount === "number" ? o.activeCount : 0;
  const by = (o.byStatus as Record<string, unknown> | undefined) ?? {};
  const top = Array.isArray(o.topActive) ? (o.topActive as unknown[]) : [];
  const statusLine =
    "<p class=\"muted\">Total " +
    String(total) +
    " · Active " +
    String(active) +
    " · Assigned " +
    String(typeof by.assigned === "number" ? by.assigned : 0) +
    " · Submitted " +
    String(typeof by.submitted === "number" ? by.submitted : 0) +
    " · Blocked " +
    String(typeof by.blocked === "number" ? by.blocked : 0) +
    "</p>";
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Team execution">' +
      "<p><b>Team Assignments</b></p>" +
      '<p class="muted">Team execution data is unavailable.</p>' +
      "</section>"
    );
  }
  const toolbar =
    '<div class="dash-team-exec-toolbar" role="toolbar" aria-label="Team assignment actions">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="team-assignment-register" title="register-assignment">Create assignment</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="team-execution-chat" title="Supervisor playbook in chat">Supervisor guide</button>' +
    "</div>";
  if (top.length === 0) {
    return (
      '<section class="dash-card dash-team-execution" aria-label="Team execution">' +
      "<p><b>Team Assignments</b></p>" +
      statusLine +
      '<p class="muted">Delegate an execution task to a worker agent, then reconcile their handoff when they submit.</p>' +
      toolbar +
      '<p class="muted">No active assignments yet — use <b>Create assignment</b> to register the first handoff.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = escapeHtml(String(r.id ?? ""));
      const tid = escapeHtml(String(r.executionTaskId ?? ""));
      const title = r.executionTaskTitle != null ? escapeHtml(String(r.executionTaskTitle)) : "";
      const st = String(r.status ?? "");
      const stLabel = escapeHtml(teamAssignmentStatusPhrase(st));
      const sup = escapeHtml(String(r.supervisorId ?? ""));
      const wrk = escapeHtml(String(r.workerId ?? ""));
      const actions = renderTeamAssignmentRowActions(r);
      return (
        '<div class="dash-row dash-team-assignment-row" role="listitem">' +
        '<div class="dash-team-assignment-main">' +
        '<span class="dash-row-label"><b>' +
        tid +
        "</b>" +
        (title ? " — " + title : "") +
        "</span>" +
        '<span class="dash-team-assignment-meta muted">' +
        stLabel +
        " · sup " +
        sup +
        " · worker " +
        wrk +
        " · " +
        id +
        "</span>" +
        "</div>" +
        actions +
        "</div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card dash-team-execution" aria-label="Team execution">' +
    "<p><b>Team Assignments</b></p>" +
    statusLine +
    toolbar +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}

function renderApprovalInboxSection(queue: unknown): string {
  if (!queue || typeof queue !== "object") {
    return "";
  }
  const o = queue as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const count = typeof o.count === "number" ? o.count : 0;
  const top = Array.isArray(o.top) ? (o.top as unknown[]) : [];
  const artifacts = Array.isArray(o.policyArtifacts) ? (o.policyArtifacts as unknown[]) : [];
  const artifactLines = artifacts
    .map((a) => {
      const r = a as Record<string, unknown>;
      const path = escapeHtml(String(r.relativePath ?? ""));
      const role = escapeHtml(String(r.role ?? ""));
      return "<li><code>" + path + "</code> — " + role + "</li>";
    })
    .join("");
  const statusLine = '<p class="muted">Awaiting review ' + String(count) + "</p>";
  const toolbar =
    '<div class="dash-team-exec-toolbar" role="toolbar" aria-label="Policy approval inbox">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="approval-inbox-chat" title="Approval inbox playbook in chat">Inbox guide</button>' +
    "</div>";
  if (top.length === 0) {
    return (
      '<section class="dash-card dashboard-approvals" aria-label="Policy approval inbox">' +
      "<p><b>Policy Approval Inbox</b></p>" +
      statusLine +
      '<p class="muted">Improvement tasks in <b>ready</b> or <b>in_progress</b> need a <code>review-item</code> decision. Proposed improvements are triaged from the queue above.</p>' +
      toolbar +
      '<p class="muted">Queue empty — audit artifacts:</p><ul class="muted">' +
      artifactLines +
      "</ul></section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = escapeHtml(String(r.id ?? ""));
      const title = escapeHtml(String(r.title ?? ""));
      const st = escapeHtml(String(r.status ?? ""));
      const pri = r.priority != null ? escapeHtml(String(r.priority)) : "—";
      return (
        '<div class="dash-row dash-team-assignment-row" role="listitem">' +
        '<div class="dash-team-assignment-main">' +
        '<span class="dash-row-label"><b>' +
        id +
        "</b> — " +
        title +
        "</span>" +
        '<span class="dash-team-assignment-meta muted">' +
        st +
        " · " +
        pri +
        "</span>" +
        "</div>" +
        '<div class="dash-row-actions">' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="approval-review-accept" data-task-id="' +
        id +
        '" data-task-title="' +
        title +
        '" title="review-item accept">Accept</button>' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="approval-review-decline" data-task-id="' +
        id +
        '" data-task-title="' +
        title +
        '" title="review-item decline">Decline</button>' +
        '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="approval-review-accept-edited" data-task-id="' +
        id +
        '" data-task-title="' +
        title +
        '" title="review-item accept_edited">Accept Edited.</button>' +
        "</div></div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card dashboard-approvals" aria-label="Policy approval inbox">' +
    "<p><b>Policy Approval Inbox</b></p>" +
    statusLine +
    toolbar +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}

function checkpointRefKindPhrase(refKind: string): string {
  return refKind === "stash" ? "Stash snapshot" : "HEAD pointer";
}

function renderCheckpointRowActions(r: Record<string, unknown>): string {
  const id = escapeHtml(String(r.id ?? ""));
  const refKind = escapeHtml(String(r.refKind ?? "head"));
  const taskId = r.taskId != null ? escapeHtml(String(r.taskId)) : "";
  return (
    '<div class="dash-row-actions">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="checkpoint-compare" data-checkpoint-id="' +
    id +
    '" title="compare-checkpoint">Compare</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="checkpoint-rewind" data-checkpoint-id="' +
    id +
    '" data-ref-kind="' +
    refKind +
    '" data-task-id="' +
    taskId +
    '" title="rewind-to-checkpoint">Rewind</button>' +
    "</div>"
  );
}

function renderTaskCheckpointsSection(cp: unknown): string {
  if (!cp || typeof cp !== "object") {
    return "";
  }
  const o = cp as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const avail = o.available === true;
  const total = typeof o.totalCount === "number" ? o.totalCount : 0;
  const topRaw = Array.isArray(o.topRecent) ? (o.topRecent as unknown[]) : [];
  const seenCheckpointIds = new Set<string>();
  const top: unknown[] = [];
  for (const entry of topRaw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = String((entry as Record<string, unknown>).id ?? "").trim();
    if (id.length > 0) {
      if (seenCheckpointIds.has(id)) {
        continue;
      }
      seenCheckpointIds.add(id);
    }
    top.push(entry);
  }
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Task checkpoints">' +
      "<p><b>Task Checkpoints</b></p>" +
      '<p class="muted">Checkpoint data is unavailable.</p>' +
      "</section>"
    );
  }
  const statusLine = '<p class="muted">Saved checkpoints ' + String(total) + "</p>";
  const toolbar =
    '<div class="dash-team-exec-toolbar" role="toolbar" aria-label="Checkpoint actions">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="checkpoint-create-head" title="create-checkpoint head">Snapshot HEAD</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="checkpoint-create-stash" title="create-checkpoint stash">Snapshot stash</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="checkpoint-recovery-chat" title="Checkpoint playbook in chat">Recovery guide</button>' +
    "</div>";
  if (top.length === 0) {
    return (
      '<section class="dash-card dash-task-checkpoints" aria-label="Task checkpoints">' +
      "<p><b>Task Checkpoints</b></p>" +
      statusLine +
      '<p class="muted">Git snapshots linked to tasks — create one before risky edits, compare later, rewind only with explicit confirmation.</p>' +
      toolbar +
      '<p class="muted">No checkpoints yet — use <b>Snapshot HEAD</b> or <b>Snapshot stash</b> before you start risky work.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = escapeHtml(String(r.id ?? ""));
      const tid = r.taskId != null ? escapeHtml(String(r.taskId)) : "—";
      const label = r.label != null && String(r.label).trim() ? escapeHtml(String(r.label)) : "—";
      const refKind = String(r.refKind ?? "head");
      const refLabel = escapeHtml(checkpointRefKindPhrase(refKind));
      const created =
        typeof r.createdAt === "string" && r.createdAt.length > 0
          ? escapeHtml(formatPlanningUpdatedAt(r.createdAt))
          : "—";
      const actions = renderCheckpointRowActions(r);
      const title = label !== "—" ? label : id.length > 14 ? id.slice(0, 14) + "…" : id;
      return (
        '<div class="dash-row dash-team-assignment-row" role="listitem">' +
        '<div class="dash-team-assignment-main">' +
        '<span class="dash-row-label"><b>' +
        title +
        "</b></span>" +
        '<span class="dash-team-assignment-meta muted">' +
        refLabel +
        " · task " +
        tid +
        " · " +
        created +
        " · " +
        id +
        "</span>" +
        "</div>" +
        actions +
        "</div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card dash-task-checkpoints" aria-label="Task checkpoints">' +
    "<p><b>Task Checkpoints</b></p>" +
    statusLine +
    toolbar +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}

function subagentSessionStatusPhrase(status: string): string {
  switch (status) {
    case "open":
      return "Open — hand off work in Cursor, then close when done";
    case "closed":
      return "Closed";
    default:
      return humanizeDashboardToken(status);
  }
}

function renderSubagentSessionRowActions(r: Record<string, unknown>): string {
  const sessionId = escapeHtml(String(r.sessionId ?? ""));
  const definitionId = escapeHtml(String(r.definitionId ?? ""));
  const st = String(r.status ?? "");
  const parts: string[] = [];
  if (st === "open") {
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="subagent-session-close" data-session-id="' +
        sessionId +
        '" data-definition-id="' +
        definitionId +
        '" title="close-subagent-session">Close session</button>'
    );
    parts.push(
      '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="subagent-spawn" data-subagent-id="' +
        definitionId +
        '" title="spawn-subagent">New session</button>'
    );
  }
  if (parts.length === 0) {
    return "";
  }
  return '<div class="dash-row-actions">' + parts.join("") + "</div>";
}

function renderSubagentRegistrySection(sub: unknown): string {
  if (!sub || typeof sub !== "object") {
    return "";
  }
  const o = sub as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return "";
  }
  const avail = o.available === true;
  const defs = typeof o.definitionsCount === "number" ? o.definitionsCount : 0;
  const retired = typeof o.retiredDefinitionsCount === "number" ? o.retiredDefinitionsCount : 0;
  const openSess = typeof o.openSessionsCount === "number" ? o.openSessionsCount : 0;
  const top = Array.isArray(o.topOpenSessions) ? (o.topOpenSessions as unknown[]) : [];
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Subagent registry">' +
      "<p><b>Subagent Registry</b></p>" +
      '<p class="muted">Subagent data is unavailable.</p>' +
      "</section>"
    );
  }
  const statusLine =
    '<p class="muted">Definitions ' +
    String(defs) +
    " · Retired " +
    String(retired) +
    " · Open sessions " +
    String(openSess) +
    "</p>";
  const toolbar =
    '<div class="dash-team-exec-toolbar" role="toolbar" aria-label="Subagent registry actions">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="subagent-register" title="register-subagent">Register role</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="subagent-spawn" title="spawn-subagent">Start session</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="subagent-retire" title="retire-subagent">Retire role</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="subagent-registry-chat" title="Registry playbook in chat">Registry guide</button>' +
    "</div>";
  if (top.length === 0) {
    const emptyHint =
      defs > 0
        ? "No open sessions — use <b>Start session</b> to link a subagent to a task."
        : "Register a subagent role first, then start a task-linked session.";
    return (
      '<section class="dash-card dash-subagent-registry" aria-label="Subagent registry">' +
      "<p><b>Subagent Registry</b></p>" +
      statusLine +
      '<p class="muted">Named agent roles with task-linked sessions and an audit trail.</p>' +
      toolbar +
      '<p class="muted">' +
      emptyHint +
      "</p>" +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const sessionId = escapeHtml(String(r.sessionId ?? ""));
      const def = escapeHtml(String(r.definitionId ?? ""));
      const tid = r.executionTaskId != null ? escapeHtml(String(r.executionTaskId)) : "—";
      const st = String(r.status ?? "");
      const stLabel = escapeHtml(subagentSessionStatusPhrase(st));
      const updated =
        typeof r.updatedAt === "string" && r.updatedAt.length > 0
          ? escapeHtml(formatPlanningUpdatedAt(r.updatedAt))
          : "—";
      const actions = renderSubagentSessionRowActions(r);
      const sidShort = sessionId.length > 10 ? sessionId.slice(0, 8) + "…" : sessionId;
      return (
        '<div class="dash-row dash-team-assignment-row" role="listitem">' +
        '<div class="dash-team-assignment-main">' +
        '<span class="dash-row-label"><b>' +
        def +
        "</b> · session " +
        sidShort +
        "</span>" +
        '<span class="dash-team-assignment-meta muted">' +
        stLabel +
        " · task " +
        tid +
        " · updated " +
        updated +
        "</span>" +
        "</div>" +
        actions +
        "</div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card dash-subagent-registry" aria-label="Subagent registry">' +
    "<p><b>Subagent Registry</b></p>" +
    statusLine +
    toolbar +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
}


function truncateOverviewLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) {
    return one;
  }
  return one.slice(0, Math.max(1, max - 1)) + "…";
}

function humanizeDashboardToken(value: string): string {
  const token = value.trim();
  if (token.length === 0) {
    return "—";
  }
  return token
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const DASHBOARD_AGENT_STATUS_LABELS: Record<DashboardAgentStatusKind, string> = {
  unavailable: "Unavailable",
  planning: "Planning",
  blocked: "Blocked",
  working_task: "Working",
  delegating_task: "Delegating",
  ready_task: "Ready",
  awaiting_instruction: "Idle",
  reviewing_item: "Reviewing",
  reviewing_pr: "Reviewing PR",
  validating: "Validating",
  releasing: "Releasing",
  awaiting_policy_approval: "Needs approval",
  awaiting_human_gate: "Waiting on human"
};

const DASHBOARD_AGENT_STATUS_CHIP_LABELS: Record<DashboardAgentStatusKind, string> = {
  unavailable: "Unavailable",
  planning: "Planning",
  blocked: "Blocked",
  working_task: "Working",
  delegating_task: "Delegating",
  ready_task: "Ready",
  awaiting_instruction: "Idle",
  reviewing_item: "Review item",
  reviewing_pr: "PR review",
  validating: "Validating",
  releasing: "Releasing",
  awaiting_policy_approval: "Needs approval",
  awaiting_human_gate: "Human gate"
};

const DASHBOARD_AGENT_ACTIVE_STATUS_ORDER: DashboardAgentStatusKind[] = [
  "working_task",
  "validating",
  "planning",
  "reviewing_pr",
  "reviewing_item",
  "releasing",
  "delegating_task",
  "ready_task",
  "awaiting_instruction",
  "unavailable",
  "blocked",
  "awaiting_policy_approval",
  "awaiting_human_gate"
];

const DASHBOARD_AGENT_ATTENTION_STATE_ORDER: DashboardAgentActivityRow["attention"]["state"][] = [
  "needs_policy",
  "needs_human",
  "blocked",
  "stale",
  "failed",
  "unavailable"
];

const DASHBOARD_AGENT_ROLE_LABELS: Record<DashboardAgentActivityRow["role"], string> = {
  orchestrator: "Orchestrator",
  task_worker: "Task worker",
  subagent: "Subagent",
  unknown: "Agent"
};

const DASHBOARD_AGENT_ATTENTION_LABELS: Record<DashboardAgentActivityRow["attention"]["state"], string> = {
  none: "",
  blocked: "Blocked",
  needs_human: "Waiting on human",
  needs_policy: "Needs approval",
  stale: "Stale",
  failed: "Failed",
  unavailable: "Unavailable"
};

function dashboardAgentStatusLabel(kind: DashboardAgentStatusKind): string {
  return DASHBOARD_AGENT_STATUS_LABELS[kind] ?? humanizeDashboardToken(kind);
}

function dashboardAgentStatusChipLabel(kind: DashboardAgentStatusKind): string {
  return DASHBOARD_AGENT_STATUS_CHIP_LABELS[kind] ?? dashboardAgentStatusLabel(kind);
}

function dashboardAgentAttentionLabel(state: DashboardAgentActivityRow["attention"]["state"]): string {
  return DASHBOARD_AGENT_ATTENTION_LABELS[state] ?? "";
}

function compareDashboardAgentText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareDashboardAgentUpdatedAt(a: string | null, b: string | null): number {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  const aOk = Number.isFinite(aMs);
  const bOk = Number.isFinite(bMs);
  if (aOk && bOk) {
    if (aMs !== bMs) {
      return bMs - aMs;
    }
  } else if (aOk !== bOk) {
    return aOk ? -1 : 1;
  }
  return 0;
}

function compareDashboardAgentStatusKind(a: DashboardAgentStatusKind, b: DashboardAgentStatusKind): number {
  const aIdx = DASHBOARD_AGENT_ACTIVE_STATUS_ORDER.indexOf(a);
  const bIdx = DASHBOARD_AGENT_ACTIVE_STATUS_ORDER.indexOf(b);
  if (aIdx !== bIdx) {
    return (aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx) - (bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx);
  }
  return 0;
}

function compareDashboardAgentAttentionState(
  a: DashboardAgentActivityRow["attention"]["state"],
  b: DashboardAgentActivityRow["attention"]["state"]
): number {
  const aIdx = DASHBOARD_AGENT_ATTENTION_STATE_ORDER.indexOf(a);
  const bIdx = DASHBOARD_AGENT_ATTENTION_STATE_ORDER.indexOf(b);
  if (aIdx !== bIdx) {
    return (aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx) - (bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx);
  }
  return 0;
}

function compareDashboardAgentActivityRows(
  a: DashboardAgentActivityRow,
  b: DashboardAgentActivityRow,
  kind: "active" | "attention"
): number {
  if (kind === "attention") {
    const attentionOrder = compareDashboardAgentAttentionState(a.attention.state, b.attention.state);
    if (attentionOrder !== 0) {
      return attentionOrder;
    }
  } else {
    const statusOrder = compareDashboardAgentStatusKind(a.status, b.status);
    if (statusOrder !== 0) {
      return statusOrder;
    }
  }
  const updatedOrder = compareDashboardAgentUpdatedAt(a.freshness.updatedAt, b.freshness.updatedAt);
  if (updatedOrder !== 0) {
    return updatedOrder;
  }
  return compareDashboardAgentText(a.displayName, b.displayName);
}

function dashboardAgentSourceLabel(
  source: DashboardAgentActivitySummary["source"] | DashboardAgentActivityRow["source"]
): string {
  switch (source) {
    case "live_activity":
      return "Live";
    case "team_execution":
      return "Team";
    case "subagent_registry":
      return "Subagent";
    case "mixed":
      return "Mixed";
    case "derived_only":
      return "Inferred";
    case "derived":
      return "Derived";
    case "future_runtime":
      return "Future";
    default:
      return "Unknown";
  }
}

function formatDashboardRelativeAge(_updatedAt: string | null): string {
  return "";
}

function formatDashboardAgentFreshness(freshness: DashboardAgentActivityRow["freshness"]): string {
  const base = formatDashboardRelativeAge(freshness.updatedAt);
  switch (freshness.state) {
    case "stale":
      return base ? `stale · ${base}` : "stale";
    case "expired":
      return base ? `expired · ${base}` : "expired";
    default:
      return base;
  }
}

function dashboardAgentActivityDetail(row: DashboardAgentActivityRow): string {
  const parts: string[] = [];
  const taskId = cleanDashboardText(row.work.taskId);
  const taskTitle = cleanDashboardText(row.work.title);
  const taskPart = taskId && taskTitle ? `${taskId} — ${taskTitle}` : taskId || taskTitle;
  if (taskPart) {
    parts.push(taskPart);
  }
  const phaseKey = cleanDashboardText(row.work.phaseKey);
  if (phaseKey) {
    parts.push(`Phase ${phaseKey}`);
  }
  const command = cleanDashboardText(row.work.command);
  if (command) {
    parts.push(command);
  }
  const step = cleanDashboardText(row.work.currentStep);
  if (step) {
    parts.push(step);
  }
  const prNumber = row.refs.prNumber != null ? Number(row.refs.prNumber) : null;
  if (prNumber != null && Number.isFinite(prNumber)) {
    parts.push(`PR #${String(prNumber)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No task metadata";
}

function dashboardAgentActivityDetailItems(row: DashboardAgentActivityRow): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  const add = (label: string, value: unknown): void => {
    const text = cleanDashboardText(value);
    if (text) {
      items.push([label, text]);
    }
  };
  add("Row", row.rowId);
  add("Task", row.work.taskId);
  add("Title", row.work.title);
  add("Task status", row.work.taskStatus);
  add("Phase", row.work.phaseKey ? `Phase ${row.work.phaseKey}` : "");
  add("Command", row.work.command);
  add("Current step", row.work.currentStep);
  add("Activity", row.refs.activityId);
  add("Agent", row.refs.agentId);
  add("Session", row.refs.sessionId ?? row.work.sessionId);
  add("Assignment", row.refs.assignmentId ?? row.work.assignmentId);
  add("Agent definition", row.refs.agentDefinitionId);
  add("Subagent definition", row.refs.subagentDefinitionId);
  add("PR", row.refs.prNumber != null ? `#${String(row.refs.prNumber)}` : "");
  add("Updated", row.freshness.updatedAt);
  add("Started", row.freshness.startedAt);
  add("Expires", row.freshness.expiresAt);
  add("Custom agent", row.metadata?.customAgentName);
  add("Agent display", row.metadata?.agentDisplayName);
  if (row.attention.message) {
    add("Attention", row.attention.message);
  }
  return items;
}

function renderDashboardAgentActivityExpandedDetails(row: DashboardAgentActivityRow): string {
  const items = dashboardAgentActivityDetailItems(row);
  if (items.length === 0) {
    return '<p class="muted">No expanded context is available.</p>';
  }
  return (
    '<dl class="dash-agent-row-expanded">' +
    items
      .map(
        ([label, value]) =>
          "<div><dt>" +
          escapeHtml(label) +
          "</dt><dd>" +
          escapeHtml(value) +
          "</dd></div>"
      )
      .join("") +
    "</dl>"
  );
}

function renderDashboardAgentActivityChip(label: string, kind: string): string {
  if (!label) {
    return "";
  }
  return (
    '<span class="dash-agent-row-chip" data-agent-chip-kind="' +
    escapeHtmlAttr(kind) +
    '">' +
    escapeHtml(label) +
    "</span>"
  );
}

function renderWcAgentDot(status: WcDashboardStatusKind): string {
  return (
    '<span class="wc-dot wc-dot--' +
    escapeHtmlAttr(status) +
    ' wc-status-dot wc-status-dot--' +
    escapeHtmlAttr(status) +
    '" aria-hidden="true"></span>'
  );
}

function renderDashboardAgentTaskLine(row: DashboardAgentActivityRow): string {
  const taskId = cleanDashboardText(row.work.taskId);
  const title = cleanDashboardText(row.work.title);
  const phaseKey = cleanDashboardText(row.work.phaseKey);
  if (!taskId && !title && !phaseKey) {
    return "";
  }
  return (
    '<div class="wc-agent-card-task">' +
    (taskId.length > 0
      ? '<code class="wc-agent-card-task-chip wc-agent-card-task-id">' + escapeHtml(taskId) + "</code>"
      : "") +
    (title.length > 0
      ? '<span class="wc-agent-card-task-title" title="' +
        escapeHtmlAttr(title) +
        '">' +
        escapeHtml(title) +
        "</span>"
      : "") +
    (phaseKey.length > 0
      ? '<span class="wc-agent-card-phase muted">Phase ' + escapeHtml(phaseKey) + "</span>"
      : "") +
    "</div>"
  );
}

function renderDashboardAgentActivityRow(
  row: DashboardAgentActivityRow,
  rowKind: "main" | "active" | "attention",
  subagentRows: DashboardAgentActivityRow[] = []
): string {
  const labelText = cleanDashboardText(row.displayName) || "Unnamed agent";
  const statusText = dashboardAgentStatusLabel(row.status);
  const statusChipText = dashboardAgentStatusChipLabel(row.status);
  const wcStatus = resolveWcDashboardStatus(row.status);
  const roleText = DASHBOARD_AGENT_ROLE_LABELS[row.role] ?? "Agent";
  const freshnessText = formatDashboardAgentFreshness(row.freshness);
  const sourceText = dashboardAgentSourceLabel(row.source);
  const attentionText = dashboardAgentAttentionLabel(row.attention.state);
  const taskId = cleanDashboardText(row.work.taskId);
  const phaseKey = cleanDashboardText(row.work.phaseKey);
  const chips = [
    renderDashboardAgentActivityChip(statusChipText, `status-${row.status}`),
    renderDashboardAgentActivityChip(roleText, `role-${row.role}`),
    renderDashboardAgentActivityChip(sourceText, row.source),
    renderDashboardAgentActivityChip(freshnessText, `freshness-${row.freshness.state}`),
    attentionText ? renderDashboardAgentActivityChip(attentionText, `attention-${row.attention.state}`) : "",
    taskId ? renderDashboardAgentActivityChip(taskId, "task") : "",
    phaseKey ? renderDashboardAgentActivityChip(`Phase ${phaseKey}`, "phase") : ""
  ]
    .filter(Boolean)
    .join("");
  const aria = `${labelText}, ${statusText}, ${rowKind === "main" ? "Main Agent" : rowKind === "attention" ? "Needs Attention" : "Active Agent"}`;
  const hasSubagents = subagentRows.length > 0;
  const stateKey = "agent-card-" + row.rowId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return (
    '<details class="wc-agent-card' +
    (hasSubagents ? " wc-agent-card--expanded" : "") +
    ' dash-agent-row dash-agent-activity-row dash-agent-activity-row--' +
    rowKind +
    '"' +
    (hasSubagents ? " open" : "") +
    ' role="listitem" data-status="' +
    escapeHtmlAttr(wcStatus.kind) +
    '" data-agent-row-kind="' +
    escapeHtmlAttr(rowKind) +
    '" data-agent-row-source="' +
    escapeHtmlAttr(row.source) +
    '" data-agent-row-id="' +
    escapeHtmlAttr(row.rowId) +
    '" data-wc-ui-state-key="' +
    escapeHtmlAttr(stateKey) +
    '" aria-label="' +
    escapeHtmlAttr(aria) +
    '">' +
    '<div class="wc-agent-card-bar" aria-hidden="true"></div>' +
    '<summary class="wc-agent-card-header dash-agent-row-summary' +
    (hasSubagents ? "" : " wc-agent-card-header--no-expand") +
    '">' +
    '<span class="wc-agent-card-row1">' +
    renderWcAgentDot(wcStatus.kind) +
    '<span class="wc-agent-card-name dash-agent-row-main"><b>' +
    escapeHtml(labelText) +
    '</b><span class="muted">' +
    escapeHtml(statusText) +
    "</span></span>" +
    '<span class="wc-agent-card-status-chip">' +
    escapeHtml(wcStatus.label) +
    "</span>" +
    '<span class="wc-agent-card-role">' +
    escapeHtml(roleText) +
    "</span>" +
    (hasSubagents ? '<span class="wc-agent-card-chevron" aria-hidden="true">›</span>' : "") +
    "</span>" +
    '<div class="wc-agent-card-now dash-agent-row-detail">' +
    '<div class="wc-agent-card-now-label">Now</div>' +
    '<span class="wc-agent-card-now-text">' +
    escapeHtml(dashboardAgentActivityDetail(row)) +
    "</span></div>" +
    renderDashboardAgentTaskLine(row) +
    '<span class="dash-agent-row-meta">' +
    chips +
    "</span>" +
    "</summary>" +
    (hasSubagents
      ? '<div class="wc-agent-tree" role="list" aria-label="Subagents">' +
        subagentRows.map((subagent) => renderDashboardAgentSubagentTreeRow(subagent, rowKind)).join("") +
        "</div>"
      : "") +
    '<div class="dash-agent-row-details" aria-label="Expanded agent activity context">' +
    renderDashboardAgentActivityExpandedDetails(row) +
    "</div>" +
    "</details>"
  );
}

function renderDashboardAgentSubagentTreeRow(
  row: DashboardAgentActivityRow,
  rowKind: "main" | "active" | "attention"
): string {
  const labelText = cleanDashboardText(row.displayName) || "Unnamed agent";
  const statusText = dashboardAgentStatusLabel(row.status);
  const wcStatus = resolveWcDashboardStatus(row.status);
  const roleText = DASHBOARD_AGENT_ROLE_LABELS[row.role] ?? "Subagent";
  const aria = `${labelText}, ${statusText}, ${rowKind === "main" ? "Main Agent" : rowKind === "attention" ? "Needs Attention" : "Active Agent"}`;
  return (
    '<div class="wc-agent-tree-row dash-agent-row dash-agent-activity-row dash-agent-activity-row--' +
    rowKind +
    '" role="listitem" data-status="' +
    escapeHtmlAttr(wcStatus.kind) +
    '" data-agent-row-kind="' +
    escapeHtmlAttr(rowKind) +
    '" data-agent-row-source="' +
    escapeHtmlAttr(row.source) +
    '" data-agent-row-id="' +
    escapeHtmlAttr(row.rowId) +
    '" aria-label="' +
    escapeHtmlAttr(aria) +
    '">' +
    '<div class="wc-agent-card-row1">' +
    renderWcAgentDot(wcStatus.kind) +
    '<span class="wc-agent-card-name dash-agent-row-main"><b>' +
    escapeHtml(labelText) +
    '</b><span class="muted">' +
    escapeHtml(statusText) +
    "</span></span>" +
    '<span class="wc-agent-card-status-chip">' +
    escapeHtml(wcStatus.label) +
    "</span>" +
    '<span class="wc-agent-card-role">' +
    escapeHtml(roleText) +
    "</span>" +
    "</div>" +
    '<div class="wc-agent-card-now dash-agent-row-detail">' +
    '<div class="wc-agent-card-now-label">Now</div>' +
    '<span class="wc-agent-card-now-text">' +
    escapeHtml(dashboardAgentActivityDetail(row)) +
    "</span></div>" +
    renderDashboardAgentTaskLine(row) +
    '<div class="dash-agent-row-details" aria-label="Expanded agent activity context">' +
    renderDashboardAgentActivityExpandedDetails(row) +
    "</div>" +
    "</div>"
  );
}

function renderDashboardAgentActivityFallback(summary: DashboardAgentActivitySummary): string {
  const fallback = summary.inferredFallback;
  if (!fallback) {
    return '<p class="muted">No live activity yet.</p>';
  }
  const wcStatus = resolveWcDashboardStatus(fallback.kind);
  const label = cleanDashboardText(fallback.label) || dashboardAgentStatusLabel(fallback.kind);
  const detail = [
    fallback.detail ? cleanDashboardText(fallback.detail) : "",
    fallback.taskId ? `Task ${cleanDashboardText(fallback.taskId)}` : "",
    fallback.phaseKey ? `Phase ${cleanDashboardText(fallback.phaseKey)}` : "",
    fallback.command ? cleanDashboardText(fallback.command) : ""
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    '<div class="wc-agent-card dash-agent-row dash-agent-activity-row dash-agent-activity-row--fallback" role="listitem" data-status="' +
    escapeHtmlAttr(wcStatus.kind) +
    '" aria-label="Inferred agent activity">' +
    '<div class="wc-agent-card-bar" aria-hidden="true"></div>' +
    '<div class="wc-agent-card-header wc-agent-card-header--no-expand">' +
    '<span class="wc-agent-card-row1">' +
    renderWcAgentDot(wcStatus.kind) +
    '<span class="wc-agent-card-name dash-agent-row-main"><b>' +
    escapeHtml(label) +
    '</b><span class="muted">Inferred</span></span>' +
    '<span class="wc-agent-card-status-chip">' +
    escapeHtml(wcStatus.label) +
    "</span>" +
    "</span>" +
    '<div class="wc-agent-card-now dash-agent-row-detail">' +
    '<div class="wc-agent-card-now-label">Now</div>' +
    '<span class="wc-agent-card-now-text">' +
    escapeHtml(detail || "No live activity lease is active.") +
    "</span></div>" +
    '<span class="dash-agent-row-meta">' +
    renderDashboardAgentActivityChip("Inferred", "source-derived") +
    renderDashboardAgentActivityChip(formatDashboardRelativeAge(fallback.updatedAt), "freshness-derived") +
    "</span>" +
    "</div>" +
    "</div>"
  );
}

function renderDashboardAgentActivityRows(
  rows: DashboardAgentActivityRow[],
  rowKind: "active" | "attention"
): string {
  const sortedRows = [...rows].sort((a, b) => compareDashboardAgentActivityRows(a, b, rowKind));
  if (sortedRows.length === 0) {
    return rowKind === "active"
      ? '<p class="muted">No additional active agents.</p>'
      : '<p class="muted">No agents need attention.</p>';
  }
  const groups: Array<{ parent: DashboardAgentActivityRow; subagents: DashboardAgentActivityRow[] }> = [];
  for (const row of sortedRows) {
    if (row.role === "subagent" && groups.length > 0) {
      groups[groups.length - 1]!.subagents.push(row);
      continue;
    }
    groups.push({ parent: row, subagents: [] });
  }
  return (
    '<div class="dash-agent-row-list wc-agent-card-list" role="list">' +
    groups.map((group) => renderDashboardAgentActivityRow(group.parent, rowKind, group.subagents)).join("") +
    "</div>"
  );
}

function renderDashboardAgentActivityFooter(summary: DashboardAgentActivitySummary): string {
  const summaryLine = `${summary.activeCount} active · ${summary.needsAttentionCount} needs attention · ${summary.staleCount} stale`;
  const sourceLine = `Live ${String(summary.sourceMap.liveActivityCount)} · Team ${String(summary.sourceMap.teamExecutionCount)} · Subagents ${String(summary.sourceMap.subagentSessionCount)}`;
  const fallbackLine = summary.sourceMap.derivedFallbackUsed ? "Derived fallback used" : dashboardAgentSourceLabel(summary.source);
  return (
    '<div class="dash-agent-activity-footer">' +
    '<p><b>Summary</b> ' +
    escapeHtml(summaryLine) +
    "</p>" +
    '<p class="muted">' +
    escapeHtml(sourceLine) +
    " · " +
    escapeHtml(fallbackLine) +
    "</p>" +
    "</div>"
  );
}

function renderDashboardAgentActivityBoard(summary: DashboardAgentActivitySummary | null | undefined): string {
  if (!summary || typeof summary !== "object") {
    return (
      '<section class="wc-agent-board dash-agent-status-banner dash-agent-activity-board" aria-label="Agent Activity">' +
      '<p><b>Agent Activity</b> <span class="dash-agent-status-label">Unknown</span></p>' +
      '<p class="muted">No agent activity summary is available.</p>' +
      "</section>"
    );
  }
  const mainRow = summary.main?.freshness.state === "expired" ? null : summary.main;
  const mainRowHtml = mainRow ? renderDashboardAgentActivityRow(mainRow, "main") : renderDashboardAgentActivityFallback(summary);
  const mainRowId = mainRow?.rowId ?? "";
  const activeRows = summary.active.filter(
    (row: DashboardAgentActivityRow) =>
      row.rowId !== mainRowId && row.attention.state === "none" && row.freshness.state !== "expired"
  );
  const attentionRows = summary.needsAttention.filter(
    (row: DashboardAgentActivityRow) => row.rowId !== mainRowId && row.freshness.state !== "expired"
  );
  const headerSource = dashboardAgentSourceLabel(summary.source);
  const headerFreshness = formatDashboardRelativeAge(summary.generatedAt);
  const sourceLabel = summary.source === "derived_only" ? "Inferred" : headerSource;
  const boardState = summary.sourceMap.liveActivityCount > 0 ? "live" : summary.source === "derived_only" ? "inferred" : "mixed";
  return (
    '<section class="wc-agent-board dash-agent-status-banner dash-agent-activity-board" aria-label="Agent Activity" data-agent-activity-source="' +
    escapeHtmlAttr(summary.source) +
    '" data-agent-activity-state="' +
    escapeHtmlAttr(boardState) +
    '">' +
    '<p><b>Agent Activity</b> <span class="dash-agent-status-label">' +
    escapeHtml(headerFreshness ? `${headerSource} · ${headerFreshness}` : headerSource) +
    "</span></p>" +
    '<p class="muted">Source: ' +
    escapeHtml(sourceLabel) +
    "</p>" +
    '<div class="dash-agent-activity-section dash-agent-activity-section--main" aria-label="Main Agent">' +
    '<p class="wc-agent-section-label"><b>Main Agent</b></p>' +
    mainRowHtml +
    "</div>" +
    '<div class="dash-agent-activity-section dash-agent-activity-section--attention" aria-label="Needs Attention">' +
    '<p class="wc-agent-section-label"><b>Needs Attention</b> <span class="muted">(' +
    escapeHtml(String(attentionRows.length)) +
    ")</span></p>" +
    renderDashboardAgentActivityRows(attentionRows, "attention") +
    "</div>" +
    '<div class="dash-agent-activity-section dash-agent-activity-section--active" aria-label="Active Agents">' +
    '<p class="wc-agent-section-label"><b>Active Agents</b> <span class="muted">(' +
    escapeHtml(String(activeRows.length)) +
    ")</span></p>" +
    renderDashboardAgentActivityRows(activeRows, "active") +
    "</div>" +
    renderDashboardAgentActivityFooter(summary) +
    "</section>"
  );
}

function renderAgentStatusBanner(d: Record<string, unknown>): string {
  return renderDashboardAgentActivityBoard(
    (d.agentActivitySummary as DashboardAgentActivitySummary | null | undefined) ?? null
  );
}

function renderEditorIntegrationEmbed(editorIntegration: unknown): string {
  if (!editorIntegration || typeof editorIntegration !== "object") {
    return "";
  }
  const state = editorIntegration as EditorIntegrationRenderState;
  const chat = state.chatPrefill && typeof state.chatPrefill === "object" ? state.chatPrefill : {};
  const appName = typeof state.appName === "string" && state.appName.trim() ? state.appName.trim() : "Unknown editor";
  const uriScheme = typeof state.uriScheme === "string" && state.uriScheme.trim() ? state.uriScheme.trim() : "unknown";
  const ideKind = typeof state.ideKind === "string" && state.ideKind.trim() ? state.ideKind.trim() : "other";
  const chatLabel = typeof chat.label === "string" && chat.label.trim() ? chat.label.trim() : "Clipboard fallback";
  const direct = chat.canPrefillDirectly === true ? "Direct" : "Clipboard";
  const external = chat.externalCursorDeeplink === true ? "enabled" : "disabled";
  return (
    '<div class="dash-editor-integration dash-editor-integration--embedded" aria-label="Editor integration">' +
    "<p><b>Editor</b> " +
    escapeHtml(appName) +
    ' <span class="muted">' +
    escapeHtml(ideKind) +
    " · scheme " +
    "<code>" +
    escapeHtml(uriScheme) +
    "</code></span></p>" +
    "<p><b>Chat prefill</b> " +
    escapeHtml(chatLabel) +
    ' <span class="muted">' +
    escapeHtml(direct) +
    " · cursor URL " +
    escapeHtml(external) +
    "</span></p>" +
    "</div>"
  );
}

/** Phase roster from `dashboard-summary.systemStatus.phase.phaseCatalog` (Phase 88+). */
export function renderPhaseCatalogOverviewSection(
  phaseSlice: Record<string, unknown> | null | undefined,
  workspaceStatus?: Record<string, unknown> | null,
  releasedPhaseKeys?: readonly string[],
  legacyDeliveredMaxOrdinal?: number | null,
  activeQueuePhaseKeys?: readonly string[]
): string {
  if (!phaseSlice || typeof phaseSlice !== "object") {
    return "";
  }
  const rosterContext: Record<string, unknown> = {
    ...phaseSlice,
    currentKitPhase:
      workspaceCurrentPhaseKey(workspaceStatus) ||
      (phaseSlice.currentKitPhase != null ? String(phaseSlice.currentKitPhase).trim() : ""),
    nextKitPhase:
      workspaceStatus?.nextKitPhase != null
        ? workspaceStatus.nextKitPhase
        : phaseSlice.nextKitPhase
  };
  const cat = phaseSlice.phaseCatalog as Record<string, unknown> | undefined;
  const supported = cat && cat.supported === true;
  if (!supported) {
    return (
      '<section class="dash-card dash-phase-catalog" aria-label="Phase catalog">' +
      "<p><b>Phase Roster</b></p>" +
      '<p class="muted">Phase descriptions require a newer planning database. Upgrade Workflow Cannon and reopen this workspace.</p>' +
      "</section>"
    );
  }
  const phases = parsePhaseCatalogRows(phaseSlice);
  const workspaceCurrent = workspaceCurrentPhaseKey(workspaceStatus);

  let inner: string;
  if (phases.length === 0) {
    inner =
      '<p class="muted">No phases in the roster yet. Set the current or next phase in Config, or register a new phase.</p>';
  } else {
    const narrow = buildNarrowPhaseRosterRows(
      phases,
      rosterContext,
      releasedPhaseKeys,
      legacyDeliveredMaxOrdinal,
      activeQueuePhaseKeys
    );
    const rosterRows = narrow.ok
      ? narrow.rows
      : workspaceCurrent.length === 0
        ? buildPhaseRosterRowsWhenNoCurrent(
            phases,
            rosterContext,
            releasedPhaseKeys,
            legacyDeliveredMaxOrdinal,
            activeQueuePhaseKeys
          )
        : [];
    if (rosterRows.length === 0) {
      inner =
        workspaceCurrent.length === 0
          ? '<p class="muted">Set the <b>next phase</b> in Config, or use <b>Start</b> on a phase below.</p>'
          : '<p class="muted">Set a <b>current phase</b> in Config to show the last delivered phase, the active one, and upcoming phases here.</p>';
    } else {
      const rosterFocus: PhaseScheduleFocus = {
        ...phaseScheduleFocusFromWorkspace(
          rosterContext,
          releasedPhaseKeys,
          legacyDeliveredMaxOrdinal,
          activeQueuePhaseKeys
        ),
        knownRosterPhaseKeys: new Set(phases.map((p) => p.phaseKey.trim()).filter((k) => k.length > 0))
      };
      let rows = "";
      for (const r of rosterRows) {
        const sd = r.shortDescription != null ? String(r.shortDescription).trim() : "";
        const desc = sd.length > 0 ? escapeHtml(sd) : '<span class="muted">—</span>';
        const inputValue = escapeHtmlAttr(sd);
        const scheduleTag = resolvePhaseScheduleTag(r.phaseKey, rosterFocus);
        const statusTag =
          scheduleTag !== null ? renderPhaseScheduleTagHtml(scheduleTag) : '<span class="muted">—</span>';
        const phaseKeyAttr = escapeHtmlAttr(r.phaseKey);
        const phaseOrd = r.phaseKey.trim();
        const isCurrent =
          r.status === "current" ||
          (workspaceCurrent.length > 0 && workspaceCurrent === phaseOrd);
        const isDelivered = r.status === "delivered";
        const noCatalogHint =
          r.inCatalog === true
            ? ""
            : ' <span class="wc-context-help dash-phase-catalog-hint" tabindex="0" role="button" aria-label="Not in phase roster" data-wc-help-text="This phase is not in the roster yet. You can still edit deliverables here. Use Register Phase to add it.">' +
              '<span class="wc-context-help-icon" aria-hidden="true">?</span></span>';
        rows +=
          `<tr><td class="dash-phase-roster-col-phase">${renderPhaseRosterPhaseLink(r.phaseKey)}</td><td class="dash-phase-roster-col-status"><span class="dash-phase-roster-status-inner">${statusTag}${noCatalogHint}</span></td><td class="dash-phase-roster-col-deliverables dash-phase-deliverables-cell"><div class="dash-phase-deliverables" data-wc-phase-row="${phaseKeyAttr}">` +
          '<div class="dash-phase-deliverables-body">' +
          `<span class="dash-phase-deliverables-text">${desc}</span>` +
          `<div class="dash-phase-deliverables-editor" hidden><input type="text" class="dash-phase-deliverables-input wc-input" data-wc-phase-input="${phaseKeyAttr}" value="${inputValue}" aria-label="Deliverables for phase ${phaseKeyAttr}" /></div>` +
          '<span class="dash-phase-saving" aria-live="polite" hidden>' +
          '<span class="wc-spinner wc-spinner-inline" aria-hidden="true"></span> Saving…</span></div>' +
          '<p class="dash-phase-deliverables-error bad" aria-live="polite" hidden></p></div></td>' +
          `<td class="dash-phase-roster-col-actions">${renderPhaseRosterActionsCell(phaseKeyAttr, { isCurrent, isDelivered })}</td></tr>`;
      }
      inner =
        rows.length > 0
          ? '<table class="dash-phase-catalog-table"><thead>' +
            PHASE_ROSTER_TABLE_HEAD +
            "</thead><tbody>" +
            rows +
            "</tbody></table>"
          : '<p class="muted">No matching roster rows.</p>';
    }
  }
  const table = inner;
  const btn =
    '<p style="margin-top:8px"><button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="register-phase-catalog">Register Phase</button></p>';
  return (
    '<section id="wc-phase-roster" class="dash-card dash-phase-catalog" aria-label="Phase catalog">' +
    "<p><b>Phase Roster</b></p>" +
    table +
    btn +
    "</section>"
  );
}

function renderStatusEditorIntegrationSection(editorIntegration?: unknown): string {
  const editorInner = renderEditorIntegrationEmbed(editorIntegration);
  if (editorInner === "") {
    return "";
  }
  return (
    '<section class="dash-card dash-status-editor-integration" aria-label="Editor and chat prefill">' +
    editorInner +
    "</section>"
  );
}

/** Blockers and pending decisions (when workspace snapshot has items). */
function renderWorkspaceBlockersPendingSection(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return (
      '<section class="dash-card dashboard-overview" aria-label="Workspace status">' +
      '<p class="muted">Workspace status is unavailable.</p>' +
      '<p class="muted">Refresh the dashboard or check Workflow Cannon setup in Config.</p>' +
      "</section>"
    );
  }

  const blockers = Array.isArray(ws.blockers)
    ? (ws.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  const pending = Array.isArray(ws.pendingDecisions)
    ? (ws.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (blockers.length === 0 && pending.length === 0) {
    return "";
  }

  let html =
    '<section class="dash-card dashboard-overview' +
    (blockers.length > 0 ? " wc-blocker-card" : "") +
    '" aria-label="Workspace blockers and decisions">';
  if (blockers.length > 0) {
    const shown = blockers
      .slice(0, 2)
      .map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more =
      blockers.length > 2
        ? " <span class=\"muted\">(+" + String(blockers.length - 2) + " more)</span>"
        : "";
    html += "<p><b>Blockers</b> " + shown.join(" · ") + more + "</p>";
  }
  if (pending.length > 0) {
    const shown = pending
      .slice(0, 2)
      .map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more = pending.length > 2 ? " …" : "";
    html += "<p><b>Pending Decisions</b> " + shown.join(" · ") + more + "</p>";
  }
  html += "</section>";
  return html;
}

/** Closed-by-default roll-up for a dashboard status band (ready / proposed / blocked / terminal). */
function renderStatusRollup(
  trackId: string,
  summaryInnerHtml: string,
  bodyHtml: string,
  emptyOnly?: boolean,
  openByDefault?: boolean,
  filterKey?: string
): string {
  const body = emptyOnly ? '<p class="muted">No Items</p>' : bodyHtml;
  const filterAttr =
    filterKey ? ' data-wc-filter="' + escapeHtmlAttr(filterKey) + '"' : "";
  return (
    '<details class="status-section' +
    (emptyOnly ? " wc-section-empty" : "") +
    '"' +
    wcTrackAttr(trackId) +
    filterAttr +
    (openByDefault ? " open" : "") +
    ">" +
    "<summary>" +
    summaryInnerHtml +
    "</summary>" +
    '<div class="status-section-body">' +
    body +
    "</div>" +
    "</details>"
  );
}

export type TaskStateSyncRenderState =
  | "current"
  | "syncing"
  | "behind"
  | "offline"
  | "conflict";

/** Task-state git projection posture for the Status tab (S4.3). */
export function renderTaskStateSyncStatusHtml(taskStateProjection: unknown): string {
  if (!taskStateProjection || typeof taskStateProjection !== "object") {
    return "";
  }
  function formatAge(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return "0s";
    }
    const sec = Math.floor(ms / 1000);
    if (sec < 60) {
      return `${sec}s`;
    }
    const min = Math.floor(sec / 60);
    if (min < 60) {
      return `${min}m`;
    }
    const hrs = Math.floor(min / 60);
    if (hrs < 24) {
      return `${hrs}h`;
    }
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }
  const proj = taskStateProjection as Record<string, unknown>;
  const raw =
    typeof proj.displayState === "string" && proj.displayState.trim()
      ? proj.displayState.trim()
      : "offline";
  const state: TaskStateSyncRenderState =
    raw === "syncing" ||
    raw === "current" ||
    raw === "behind" ||
    raw === "offline" ||
    raw === "conflict"
      ? raw
      : "offline";
  const labels: Record<TaskStateSyncRenderState, string> = {
    current: "Current",
    syncing: "Syncing",
    behind: "Behind",
    offline: "Offline",
    conflict: "Conflict"
  };
  const remediation =
    typeof proj.remediation === "string" && proj.remediation.trim() ? proj.remediation.trim() : "";
  const seq =
    typeof proj.appliedSequence === "number" && Number.isFinite(proj.appliedSequence)
      ? String(proj.appliedSequence)
      : "—";
  const commit =
    typeof proj.sourceCommit === "string" && proj.sourceCommit.trim()
      ? proj.sourceCommit.trim().slice(0, 12)
      : "—";
  const localProjection =
    typeof proj.localProjection === "string" && proj.localProjection.trim()
      ? proj.localProjection.trim()
      : "fresh";
  const outboxRaw =
    proj.outbox && typeof proj.outbox === "object" ? (proj.outbox as Record<string, unknown>) : {};
  const pending =
    typeof outboxRaw.pending === "number" && Number.isFinite(outboxRaw.pending) ? outboxRaw.pending : 0;
  const publishing =
    typeof outboxRaw.publishing === "number" && Number.isFinite(outboxRaw.publishing)
      ? outboxRaw.publishing
      : 0;
  const failed =
    typeof outboxRaw.failed === "number" && Number.isFinite(outboxRaw.failed) ? outboxRaw.failed : 0;
  const conflict =
    typeof outboxRaw.conflict === "number" && Number.isFinite(outboxRaw.conflict) ? outboxRaw.conflict : 0;
  const oldestPendingAgeMs =
    typeof outboxRaw.oldestPendingAgeMs === "number" && Number.isFinite(outboxRaw.oldestPendingAgeMs)
      ? outboxRaw.oldestPendingAgeMs
      : 0;
  const queueStatus =
    failed > 0
      ? "Failed"
      : conflict > 0
        ? "Conflict"
        : pending > 0 || publishing > 0
          ? "Pending"
          : "Drained";
  const recommendedAction =
    typeof proj.recommendedAction === "string" && proj.recommendedAction.trim()
      ? proj.recommendedAction.trim()
      : "none";
  const pillClass = "wc-task-state-pill wc-task-state-" + state;
  return (
    '<section class="dash-card" aria-label="Task-state sync">' +
    "<p><b>Task-state sync</b></p>" +
    '<p class="' +
    escapeHtml(pillClass) +
    '" role="status"><span class="wc-task-state-label">' +
    escapeHtml(labels[state]) +
    "</span></p>" +
    '<div class="wc-status-kv-block">' +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Applied sequence</span><span class="wc-status-kv-val">' +
    escapeHtml(seq) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Source commit</span><span class="wc-status-kv-val"><code>' +
    escapeHtml(commit) +
    "</code></span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Projection</span><span class="wc-status-kv-val">' +
    escapeHtml(localProjection) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Queue status</span><span class="wc-status-kv-val">' +
    escapeHtml(queueStatus) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Outbox pending</span><span class="wc-status-kv-val">' +
    escapeHtml(String(pending)) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Outbox publishing</span><span class="wc-status-kv-val">' +
    escapeHtml(String(publishing)) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Outbox failed/conflict</span><span class="wc-status-kv-val">' +
    escapeHtml(`${failed}/${conflict}`) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Oldest pending age</span><span class="wc-status-kv-val">' +
    escapeHtml(formatAge(oldestPendingAgeMs)) +
    "</span></div>" +
    '<div class="wc-status-kv"><span class="wc-status-kv-label">Recommended action</span><span class="wc-status-kv-val">' +
    escapeHtml(recommendedAction) +
    "</span></div>" +
    "</div>" +
    (remediation
      ? '<p class="muted wc-task-state-remediation">' + escapeHtml(remediation) + "</p>"
      : "") +
    "</section>"
  );
}

/** Status tab: workspace identity, agent profile, and task counts from dashboard-summary data. */
function renderStatusSectionHtml(
  d: Record<string, unknown>,
  ss: Record<string, unknown>,
  editorIntegration?: EditorIntegrationRenderState | null
): string {
  const taskStateBlock = renderTaskStateSyncStatusHtml(d.taskStateProjection);
  const sys = (d.systemStatus as Record<string, unknown>) ?? {};
  const ident = (sys.identity as Record<string, unknown>) ?? {};
  const ag = (d.agentGuidance as Record<string, unknown> | null | undefined) ?? {};

  function kvRow(label: string, val: string): string {
    return (
      '<div class="wc-status-kv"><span class="wc-status-kv-label">' +
      escapeHtml(label) +
      '</span><span class="wc-status-kv-val">' +
      val +
      "</span></div>"
    );
  }

  const projName = String(ident.projectName ?? "").trim();
  const pkgName = String(ident.packageName ?? "").trim();
  const displayName = projName || pkgName || "—";
  const kitVersion = String(ident.rootPackageVersion ?? "—").trim() || "—";
  const kitRoot = String(ident.workspaceKitRoot ?? "—").trim() || "—";
  const generatedAt = typeof sys.generatedAt === "string" && sys.generatedAt.trim()
    ? sys.generatedAt.trim()
    : "";

  const workspaceCard =
    '<section class="dash-card" aria-label="Workspace identity">' +
    "<p><b>Workspace</b></p>" +
    '<div class="wc-status-kv-block">' +
    kvRow("Project", escapeHtml(displayName)) +
    kvRow("Workflow Cannon version", escapeHtml(kitVersion)) +
    kvRow("Install root", "<code>" + escapeHtml(kitRoot) + "</code>") +
    (generatedAt ? kvRow("Snapshot", escapeHtml(generatedAt)) : "") +
    (typeof d.taskStoreLastUpdated === "string" && d.taskStoreLastUpdated.trim()
      ? kvRow("Store updated", escapeHtml(String(d.taskStoreLastUpdated)))
      : "") +
    "</div></section>";

  const roleRaw = String((ag as Record<string, unknown>).displayLabel ?? (ag as Record<string, unknown>).role ?? "").trim();
  const tempRaw = String(
    (ag as Record<string, unknown>).temperamentLabel ??
    (ag as Record<string, unknown>).temperament ?? ""
  ).trim();
  const presentation =
    ag.agentPresentation && typeof ag.agentPresentation === "object"
      ? (ag.agentPresentation as Record<string, unknown>)
      : null;
  const workLog = typeof presentation?.workLog === "string" ? presentation.workLog : "";
  const rationale = typeof presentation?.rationale === "string" ? presentation.rationale : "";
  const detail = typeof presentation?.finalAnswerDetail === "string" ? presentation.finalAnswerDetail : "";
  const presentationVal = [
    workLog ? `Work-log ${workLog}` : "",
    rationale ? `Rationale ${rationale}` : "",
    detail ? `Final ${detail}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
  const phaseRaw = (ag as Record<string, unknown>).phase;
  const tierRaw = String(
    (ag as Record<string, unknown>).guidanceTier ??
    (ag as Record<string, unknown>).tier ?? ""
  ).trim();

  const agentCard =
    '<section class="dash-card" aria-label="Agent profile">' +
    "<p><b>Agent Profile</b></p>" +
    '<div class="wc-status-kv-block">' +
    (roleRaw ? kvRow("Role", escapeHtml(roleRaw)) : "") +
    (tempRaw ? kvRow("Temperament", escapeHtml(tempRaw)) : "") +
    (presentationVal ? kvRow("Presentation", escapeHtml(presentationVal)) : "") +
    (phaseRaw !== undefined && phaseRaw !== null && phaseRaw !== ""
      ? kvRow("Phase", escapeHtml(String(phaseRaw)))
      : "") +
    (tierRaw ? kvRow("Guidance tier", escapeHtml(tierRaw)) : "") +
    "</div>" +
    '<p class="muted wc-status-guidance-manage">Manage guidance policies in the Dashboard <b>CAE</b> tab (Workflow Cannon → Dashboard).</p>' +
    "</section>";

  const pg = d.planningGeneration;
  const pol = d.planningGenerationPolicy;
  const planningCard =
    typeof pg === "number" && Number.isFinite(pg)
      ? '<section class="dash-card" aria-label="Planning sync">' +
        "<p><b>Planning Sync</b></p>" +
        '<div class="wc-status-kv-block">' +
        kvRow("Generation", escapeHtml(String(pg))) +
        kvRow("Policy", escapeHtml(String(pol ?? "—"))) +
        "</div></section>"
      : "";

  const countsCard =
    '<section class="dash-card" aria-label="Task counts">' +
    "<p><b>Task Counts</b></p>" +
    buildDashboardStateCountGridHtml(ss) +
    "</section>";

  return (
    taskStateBlock +
    agentCard +
    renderStatusEditorIntegrationSection(editorIntegration) +
    workspaceCard +
    planningCard +
    countsCard +
    renderEmbeddedStatusPanelHtml(d)
  );
}

/**
 * Render the full status panel (header, This Workspace, Planning Data, Agent
 * Profile, Phase & Workspace, Coordination, Doctor, Modules, CAE)
 * inside the Dashboard sidebar's Status tab. The standalone Status webview
 * panel was sunsetted; this is now the only host for `renderStatusTabInnerHtml`.
 */
function renderEmbeddedStatusPanelHtml(d: Record<string, unknown>): string {
  let inner: string;
  try {
    inner = renderStatusTabInnerHtml({ ok: true, data: d });
  } catch (e) {
    inner =
      '<p class="wc-status-error">Embedded status render error: ' +
      escapeHtml(e instanceof Error ? e.message : String(e)) +
      "</p>";
  }
  return '<div class="wc-status-tab-embedded">' + inner + "</div>";
}

/** Kit-shaped results from `list-phase-notes` / `get-phase-context` (webview receives merged reads). */
export type PhaseJournalKitPayload = {
  ok?: unknown;
  code?: unknown;
  message?: unknown;
  data?: Record<string, unknown>;
};

export type DashboardPhaseJournalBundle = {
  listPhaseNotes: PhaseJournalKitPayload;
  getPhaseContext: PhaseJournalKitPayload;
  /**
   * Optional rollup of notes for past phases (workspace ordinal < current). Each entry contains
   * the raw note rows (same shape as `listPhaseNotes.data.notes`) for one past phaseKey.
   * Phases with zero notes should be omitted by the producer.
   */
  pastPhaseNotes?: Array<{
    phaseKey: string;
    notes: unknown[];
  }>;
};

const PHASE_NOTE_TYPES_CONVERTIBLE = new Set(["task-suggestion", "follow-up"]);

function truncatePhaseNoteRowText(raw: string, maxLen = 80): string {
  const s = raw.trim();
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

/** Render a single phase note row (reused by current-phase list and Past Phases rollups). */
function renderPhaseNoteRow(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }
  const n = raw as Record<string, unknown>;
  const id = typeof n.id === "string" ? n.id : "";
  const summary = typeof n.summary === "string" ? n.summary : "";
  const noteType = typeof n.noteType === "string" ? n.noteType : "";
  const priority = typeof n.priority === "string" ? n.priority : "";
  const status = typeof n.status === "string" ? n.status : "";
  const details = typeof n.details === "string" ? n.details : null;
  const convertedTaskId = typeof n.convertedTaskId === "string" ? n.convertedTaskId : null;
  const subject = summary.trim();
  const detailsTrim = details ? details.trim() : "";
  const preferredText = subject.length > 0 ? subject : detailsTrim;
  const rowText = preferredText.length > 0 ? truncatePhaseNoteRowText(preferredText, 80) : "Untitled note";
  const rowTitle = preferredText.length > 0 ? preferredText : "Phase note";

  const viewBtn =
    id.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="phase-note-view" data-note-id="' +
        escapeHtmlAttr(id) +
        '" data-note-type="' +
        escapeHtmlAttr(noteType) +
        '" data-note-priority="' +
        escapeHtmlAttr(priority) +
        '" data-note-summary="' +
        escapeHtmlAttr(summary) +
        '" data-note-details="' +
        escapeHtmlAttr(details ?? "") +
        '" title="View phase note">View</button>'
      : "";

  const editBtn =
    status === "active" && id.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="phase-note-edit" data-note-id="' +
        escapeHtmlAttr(id) +
        '" data-note-summary="' +
        escapeHtmlAttr(summary) +
        '" data-note-details="' +
        escapeHtmlAttr(details ?? "") +
        '" title="Edit phase note">Edit</button>'
      : "";

  const deleteBtn =
    status === "active" && id.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-wc-action="phase-note-delete" data-note-id="' +
        escapeHtmlAttr(id) +
        '" data-note-priority="' +
        escapeHtmlAttr(priority) +
        '" title="Delete phase note">Delete</button>'
      : "";

  const canConvert =
    status === "active" && id.length > 0 && !convertedTaskId && PHASE_NOTE_TYPES_CONVERTIBLE.has(noteType);

  const convertBtn = canConvert
    ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="phase-note-convert" data-note-id="' +
      escapeHtmlAttr(id) +
      '" title="convert-phase-note-to-task">Convert</button>'
    : "";

  const convertedLine =
    convertedTaskId && convertedTaskId.length > 0
      ? '<p class="muted wc-phase-note-converted">Converted → <button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
        escapeHtmlAttr(convertedTaskId) +
        '">' +
        escapeHtml(convertedTaskId) +
        "</button></p>"
      : "";

  return (
    '<div class="dash-row dash-phase-note-row">' +
    '<div class="dash-row-label" title="' +
    escapeHtmlAttr(rowTitle) +
    '">' +
    escapeHtml(rowText) +
    convertedLine +
    "</div>" +
    '<div class="dash-row-actions">' +
    viewBtn +
    editBtn +
    deleteBtn +
    convertBtn +
    "</div>" +
    "</div>"
  );
}

/** Past Phases rollup: one `<details>` per past phaseKey that has notes; expanding shows the notes. */
function renderPastPhaseNotesRollup(
  pastPhaseNotes: DashboardPhaseJournalBundle["pastPhaseNotes"]
): string {
  const entries = Array.isArray(pastPhaseNotes)
    ? pastPhaseNotes.filter((e) => e && Array.isArray(e.notes) && e.notes.length > 0)
    : [];
  if (entries.length === 0) {
    return (
      '<details class="dash-phase-notes-past" data-wc-track="dash-phase-notes-past">' +
      '<summary><b>Past Phases</b></summary>' +
      '<p class="muted" role="status">No notes from past phases.</p>' +
      '</details>'
    );
  }
  const items = entries
    .map((entry) => {
      const phaseKey = String(entry.phaseKey ?? "").trim() || "—";
      const rows = entry.notes.map((n) => renderPhaseNoteRow(n)).join("");
      const trackId = "dash-phase-notes-past-" + phaseKey.replace(/[^a-zA-Z0-9_-]/g, "_");
      return (
        '<details class="dash-phase-notes-past-item" data-wc-track="' +
        escapeHtmlAttr(trackId) +
        '">' +
        '<summary><code>' +
        escapeHtml(phaseKey) +
        '</code> <span class="muted">(' +
        escapeHtml(String(entry.notes.length)) +
        ')</span></summary>' +
        '<div class="dash-row-list">' +
        rows +
        '</div>' +
        '</details>'
      );
    })
    .join("");
  return (
    '<details class="dash-phase-notes-past" data-wc-track="dash-phase-notes-past">' +
    '<summary><b>Past Phases</b> <span class="muted">(' +
    escapeHtml(String(entries.length)) +
    ')</span></summary>' +
    items +
    '</details>'
  );
}

/**
 * Overview tab card: phase journal rows + kit-backed actions (dismiss / convert / persist suggestions).
 * Pure HTML — button clicks postMessage from `DashboardViewProvider` bootstrap.
 */
export function renderPhaseJournalStatsBanner(stats: unknown): string {
  if (!stats || typeof stats !== "object") {
    return "";
  }
  const row = stats as Record<string, unknown>;
  if (row.available !== true) {
    return "";
  }
  const current = row.currentPhase as Record<string, unknown> | undefined;
  if (!current) {
    return "";
  }
  const count = typeof current.activeNoteCount === "number" ? current.activeNoteCount : 0;
  const phaseKey = current.phaseKey != null ? String(current.phaseKey) : "";
  const silence = current.silenceWarning === true;
  const warnCls = silence ? " dash-phase-journal-silence-warn" : "";
  const phaseLabel = phaseKey.length > 0 ? "Phase " + phaseKey : "Current phase";
  return (
    '<section class="dash-card dash-phase-journal-stats' +
    warnCls +
    '" aria-label="Phase journal capture">' +
    "<p><b>Notes captured this phase</b> · " +
    escapeHtml(phaseLabel) +
    ": <b>" +
    String(count) +
    "</b></p>" +
    (silence
      ? '<p class="muted" role="status">No phase notes yet despite completed delivery work — capture context with <b>New</b> or Add phase note.</p>'
      : "") +
    "</section>"
  );
}

function renderPhaseNotesOverviewSection(
  bundle: DashboardPhaseJournalBundle | null | undefined,
  phaseJournalStats?: unknown
): string {
  if (bundle === null || bundle === undefined) {
    return "";
  }
  const list = bundle.listPhaseNotes;
  const ctx = bundle.getPhaseContext;
  const listOk = list.ok === true && list.data && typeof list.data === "object";
  const ctxOk = ctx.ok === true && ctx.data && typeof ctx.data === "object";

  if (!listOk && !ctxOk) {
    const code = escapeHtml(String(list.code ?? ctx.code ?? "error"));
    const msg = escapeHtml(String(list.message ?? ctx.message ?? ""));
    return (
      '<section class="dash-card dash-phase-notes" aria-label="Phase notes">' +
      "<p><b>Phase Notes</b></p>" +
      '<p class="muted">Phase journal unavailable: <code>' +
      code +
      "</code> " +
      msg +
      "</p>" +
      "</section>"
    );
  }

  const listData = (listOk ? list.data : {}) as Record<string, unknown>;
  const notes = Array.isArray(listData.notes) ? (listData.notes as unknown[]) : [];

  const addBtn =
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="phase-note-add" title="add-phase-note">New</button>';

  const rows = notes.map((n) => renderPhaseNoteRow(n)).join("");
  const empty =
    notes.length === 0
      ? '<p class="muted" role="status">No phase notes for this phase.</p>'
      : "";

  let journalHint = "";
  if (phaseJournalStats && typeof phaseJournalStats === "object") {
    const journalRow = phaseJournalStats as Record<string, unknown>;
    if (journalRow.available === true) {
      const current = journalRow.currentPhase as Record<string, unknown> | undefined;
      if (current?.silenceWarning === true) {
        journalHint =
          '<p class="muted dash-phase-journal-silence-warn" role="status">No phase notes yet despite completed delivery work — capture context with <b>New</b>.</p>';
      }
    }
  }

  return (
    '<section class="dash-card dash-phase-notes" aria-label="Phase notes">' +
    '<div class="dash-phase-notes-head"><p><b>Phase Notes</b></p>' +
    addBtn +
    "</div>" +
    journalHint +
    empty +
    (notes.length > 0 ? '<div class="dash-row-list">' + rows + "</div>" : "") +
    renderPastPhaseNotesRollup(bundle.pastPhaseNotes) +
    "</section>"
  );
}

/** Inner HTML for #root from a `workspace-kit run dashboard-summary`–shaped payload (or extension error object). */
export function renderDashboardRootInnerHtml(
  payload: unknown,
  planningWizardPanel?: PlanningInterviewWizardPanel | null,
  editorIntegration?: EditorIntegrationRenderState | null,
  phaseJournal?: DashboardPhaseJournalBundle | null,
  embeddedCaePanelHtml?: string | null,
  options?: RenderDashboardRootOptions
): string {
  if (payload === null || payload === undefined) {
    return "<p>No payload</p>";
  }
  const p = payload as { ok?: unknown; code?: unknown; data?: Record<string, unknown> };
  if (p.ok !== true) {
    const guidance =
      p.code === "policy-denied"
        ? "\n\nThis action was not approved. Try again or contact your maintainer."
        : "";
    return (
      '<pre class="bad">' + escapeHtml(JSON.stringify(payload, null, 2) + guidance) + "</pre>"
    );
  }
  const d = p.data ?? {};
  const ss = (d.stateSummary as Record<string, unknown>) || {};
  const ws = (d.workspaceStatus as Record<string, unknown> | null | undefined) ?? null;
  const deliveredPhaseKeys = readDeliveredPhaseKeys(d);
  const rolledOutPhaseKeys = readRolledOutPhaseKeys(d);
  const rosterDeliveredPhaseKeys = mergePhaseKeysForRosterDelivery(
    deliveredPhaseKeys,
    rolledOutPhaseKeys
  );
  const legacyDeliveredMaxOrdinal = readLegacyDeliveredMaxOrdinal(d);
  const activeQueuePhaseKeys = readPhaseKeysWithActiveQueueWork(d);
  const phaseFocus = phaseScheduleFocusFromWorkspace(
    ws,
    deliveredPhaseKeys,
    legacyDeliveredMaxOrdinal,
    activeQueuePhaseKeys
  );
  const phaseSystemSlice =
    d.systemStatus && typeof d.systemStatus === "object"
      ? ((d.systemStatus as Record<string, unknown>).phase as Record<string, unknown> | undefined)
      : undefined;
  const phaseCatalogLookup = buildPhaseCatalogLookup(phaseSystemSlice);
  const phaseOrderingInputs: PhaseOrderingInputs | undefined =
    phaseCatalogLookup.size > 0
      ? {
          phases: [...phaseCatalogLookup.values()],
          deliveredPhaseKeys: rosterDeliveredPhaseKeys,
          legacyDeliveredMaxOrdinal,
          activeQueuePhaseKeys
        }
      : undefined;
  const wishlist = (d.wishlist as Record<string, unknown>) || {};
  const wishlistEnabled = wishlist.enabled === true;
  const wishlistOpenTop = Array.isArray(wishlist.openTop) ? wishlist.openTop : [];
  const wishOpen = Number(wishlist.openCount ?? 0);
  const wishTotal = Number(wishlist.totalCount ?? 0);
  const wishPageSize =
    typeof wishlist.openPageSize === "number" && wishlist.openPageSize > 0
      ? wishlist.openPageSize
      : 5;
  const wishOpenPage =
    typeof wishlist.openPage === "number" && Number.isInteger(wishlist.openPage) && wishlist.openPage >= 0
      ? wishlist.openPage
      : 0;
  const wishOpenTotalPages =
    typeof wishlist.openTotalPages === "number" && wishlist.openTotalPages >= 0
      ? wishlist.openTotalPages
      : wishOpen === 0
        ? 0
        : Math.ceil(wishOpen / wishPageSize);
  const wishPageSummary =
    wishOpen > 0 && wishOpenTotalPages > 1
      ? " · Page " + String(wishOpenPage + 1) + " / " + String(wishOpenTotalPages)
      : "";
  const planningSession = d.planningSession;
  const blockedSummary = (d.blockedSummary as Record<string, unknown>) || {};
  const blockedTop = Array.isArray(blockedSummary.top) ? (blockedSummary.top as unknown[]).slice(0, 8) : [];
  const humanGatesSummary = (d.humanGatesSummary as Record<string, unknown> | undefined) ?? {};
  const humanGatesCount = typeof humanGatesSummary.count === "number" ? humanGatesSummary.count : 0;
  const humanGatesTop = Array.isArray(humanGatesSummary.top)
    ? (humanGatesSummary.top as unknown[]).slice(0, 15)
    : [];
  const ris = (d.readyImprovementsSummary as Record<string, unknown> | undefined) ?? {};
  const res = (d.readyExecutionSummary as Record<string, unknown> | undefined) ?? {};
  const oldReadyOnly = !("readyImprovementsSummary" in d) && !("readyExecutionSummary" in d);
  let readyMerged = mergeReadyQueueRollupSummaries(ris, res);
  if (oldReadyOnly && Array.isArray(d.readyQueueTop) && (d.readyQueueTop as unknown[]).length > 0) {
    const legacyTop = (d.readyQueueTop as unknown[]).slice(0, 15);
    readyMerged = {
      count: typeof d.readyQueueCount === "number" ? (d.readyQueueCount as number) : legacyTop.length,
      top: legacyTop,
      phaseBuckets: res.phaseBuckets ?? ris.phaseBuckets
    };
  }
  const readyCount = readyMerged.count;
  const readyTop = readyMerged.top;
  const readyPhaseBuckets = readyMerged.phaseBuckets;
  const pis = (d.proposedImprovementsSummary as Record<string, unknown> | undefined) ?? {};
  const piCount = typeof pis.count === "number" ? pis.count : 0;
  const piTop = Array.isArray(pis.top) ? (pis.top as unknown[]) : [];
  const pes = (d.proposedExecutionSummary as Record<string, unknown> | undefined) ?? {};
  const peCount = typeof pes.count === "number" ? pes.count : 0;
  const peTop = Array.isArray(pes.top) ? (pes.top as unknown[]) : [];
  const tcrs = (d.transcriptChurnResearchSummary as Record<string, unknown> | undefined) ?? {};
  const tcrCount = typeof tcrs.count === "number" ? tcrs.count : 0;
  const tcrTop = Array.isArray(tcrs.top) ? (tcrs.top as unknown[]) : [];
  const terminalSection = (() => {
    const cs = d.completedSummary as Record<string, unknown> | undefined;
    const ks = d.cancelledSummary as Record<string, unknown> | undefined;
    if (!cs && !ks) {
      return "";
    }
    const compCount = typeof cs?.count === "number" ? cs.count : 0;
    const cancCount = typeof ks?.count === "number" ? ks.count : 0;
    const compTop = Array.isArray(cs?.top) ? (cs!.top as unknown[]).slice(0, 15) : [];
    const cancTop = Array.isArray(ks?.top) ? (ks!.top as unknown[]).slice(0, 15) : [];
    const inner =
      renderStatusRollup(
        "status-term-comp",
        "<b>Completed</b> (" + String(compCount) + ")",
        renderTerminalTaskPhaseBuckets(
          cs?.phaseBuckets,
          compTop,
          compCount,
          "No completed tasks.",
          "term-comp",
          phaseFocus,
          phaseCatalogLookup,
          "completed"
        ),
        compCount === 0,
        false,
        "terminal"
      ) +
      renderStatusRollup(
        "status-term-can",
        "<b>Cancelled</b> (" + String(cancCount) + ")",
        renderTerminalTaskPhaseBuckets(
          ks?.phaseBuckets,
          cancTop,
          cancCount,
          "No cancelled tasks.",
          "term-can",
          phaseFocus,
          phaseCatalogLookup,
          "cancelled"
        ),
        cancCount === 0,
        false,
        "terminal"
      );
    return (
      '<section class="dashboard-terminal-tasks" aria-label="Completed and cancelled tasks">' + inner + "</section>"
    );
  })();

  const tasksQuickActionsPanel =
    '<div class="dash-quick-actions" role="toolbar" aria-label="Chat playbook shortcuts">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" data-wc-action="generate-features-chat" title="New chat with /generate-features as text (same as slash command)">Generate Features</button>' +
    "</div>";

  const queuePhaseFilterOptions = deriveQueuePhaseFilterOptions({
    workspaceStatus: ws,
    phaseBuckets: [
      ris.phaseBuckets,
      res.phaseBuckets,
      pis.phaseBuckets,
      pes.phaseBuckets,
      tcrs.phaseBuckets,
      blockedSummary.phaseBuckets,
      (d.completedSummary as Record<string, unknown> | undefined)?.phaseBuckets,
      (d.cancelledSummary as Record<string, unknown> | undefined)?.phaseBuckets
    ],
    phaseReleaseDates: readPhaseReleaseDates(d)
  });

  const tasksBlock =
    '<section class="dash-card dashboard-tasks-block" aria-label="Task queue rollups">' +
    tasksQuickActionsPanel +
    renderFilterChipBar(queuePhaseFilterOptions, humanGatesCount) +
    renderStatusRollup(
      "status-ready",
      "<b>Ready</b> (" + String(readyCount) + ")",
      renderReadyPhaseBuckets(
          readyPhaseBuckets,
          readyTop,
          "No ready tasks.",
          "rdy",
          ws as Record<string, unknown> | null,
          phaseFocus,
          phaseCatalogLookup
        ),
      false,
      readyCount > 0,
      "ready"
    ) +
    renderStatusRollup(
      "status-prop-imp",
      "<b>Proposed · Improvements</b> (" + String(piCount) + ")",
      renderProposedPhaseBuckets(pis.phaseBuckets, piCount, piTop, "prop-imp", phaseFocus, phaseCatalogLookup),
      piCount === 0,
      false,
      "proposed"
    ) +
    renderStatusRollup(
      "status-prop-exe",
      "<b>Proposed · Execution</b> (" + String(peCount) + ")",
      renderProposedExecutionPhaseBuckets(pes.phaseBuckets, peCount, peTop, "prop-exe", phaseFocus, phaseCatalogLookup),
      peCount === 0,
      false,
      "proposed"
    ) +
    renderStatusRollup(
      "status-tc-research",
      "<b>Research · Transcript churn</b> (" + String(tcrCount) + ")",
      renderTranscriptChurnResearchPhaseBuckets(
        tcrs.phaseBuckets,
        tcrCount,
        tcrTop,
        "tc-churn",
        phaseFocus,
        phaseCatalogLookup
      ),
      false,
      false,
      "research"
    ) +
    renderStatusRollup(
      "status-blocked",
      "<b>Blocked</b> (" + String(Number(blockedSummary.count ?? 0)) + ")",
      renderBlockedPhaseBuckets(
        blockedSummary.phaseBuckets,
        blockedTop,
        Number(blockedSummary.count ?? 0),
        "blk",
        phaseFocus,
        phaseCatalogLookup
      ),
      Number(blockedSummary.count ?? 0) === 0,
      false,
      "blocked"
    ) +
    renderStatusRollup(
      "status-human-gates",
      "<b>Human Review</b> (" + String(humanGatesCount) + ")",
      renderHumanGatesList(humanGatesCount, humanGatesTop),
      humanGatesCount === 0,
      humanGatesCount > 0,
      "human-gates"
    ) +
    terminalSection +
    "</section>";

  const wishlistSection = wishlistEnabled
    ? '<section class="dash-card" aria-label="Wishlist">' +
      '<details class="status-section"' +
      wcTrackAttr("wishlist") +
      ">" +
      "<summary><b>Wishlist</b> · Open " +
      String(wishOpen) +
      " / Total " +
      String(wishTotal) +
      wishPageSummary +
      "</summary>" +
      '<div class="status-section-body">' +
      (wishOpen === 0
        ? '<p class="muted">No Items</p>'
        : renderWishlistOpenList(wishlistOpenTop) + renderWishlistPager(wishOpenPage, wishOpenTotalPages)) +
      "</div></details></section>"
    : "";

  // ── Assemble tab content ───────────────────────────────────────────────────

  const firstWishlistOpen = wishlistEnabled ? wishlistOpenTop[0] : undefined;
  const suggestedNext = d.suggestedNext;
  const phaseSnapshot = normalizePhaseSnapshot(d.currentPhaseDelivery, ws as Record<string, unknown> | null);
  const phaseWorkCandidates = [
    ...humanGatesTop,
    ...blockedTop,
    ...peTop,
    ...piTop,
    ...tcrTop
  ];
  const recNextCard = renderUpNextCardHtml({
    ws: ws as Record<string, unknown> | null,
    phaseSnapshot,
    suggestedNext,
    readyTop,
    readyCount,
    firstWishlistOpen,
    humanGatesCount,
    phaseWorkCandidates
  });

  const totalReadyCount = readyCount;
  const totalProposedCount = piCount + peCount;
  const totalBlockedCount = Number(blockedSummary.count ?? 0);
  const totalDoneCount =
    typeof (d.completedSummary as Record<string, unknown> | undefined)?.count === "number"
      ? ((d.completedSummary as Record<string, unknown>).count as number)
      : 0;

  const overviewContent =
    renderStatPills(
      totalReadyCount,
      totalProposedCount,
      totalBlockedCount,
      totalDoneCount,
      humanGatesCount
    ) +
    renderAgentStatusBanner(d) +
    recNextCard +
    renderPhaseReadinessCard(
      ws as Record<string, unknown> | null,
      phaseSnapshot,
      phaseOrderingInputs
    ) +
    renderPhaseProgressCard(
      ws as Record<string, unknown> | null,
      phaseSnapshot,
      humanGatesCount,
      phaseOrderingInputs
    ) +
    renderWorkspaceBlockersPendingSection(ws as Record<string, unknown> | null) +
    renderTeamExecutionSection(d.teamExecution) +
    renderSubagentRegistrySection(d.subagentRegistry) +
    renderTaskCheckpointsSection(d.taskCheckpoints) +
    renderApprovalInboxSection(d.approvalQueue);

  const phaseRosterInner = renderPhaseCatalogOverviewSection(
    phaseSystemSlice,
    ws as Record<string, unknown> | null,
    rosterDeliveredPhaseKeys,
    legacyDeliveredMaxOrdinal,
    activeQueuePhaseKeys
  );
  const planArtifactInner = renderPlanArtifactDraftPanel(d.planArtifact);
  const planningInterviewInner = renderPlanningSession(planningSession, planningWizardPanel);

  const caePanelContent =
    typeof embeddedCaePanelHtml === "string" && embeddedCaePanelHtml.trim().length > 0
      ? '<div class="gp-root wc-dash-cae-host dash-cae-embedded wc-dashboard-embedded-guidance">' +
        namespaceEmbeddedCaePanelHtml(embeddedCaePanelHtml) +
        "</div>"
      : '<section class="dash-card" aria-label="CAE panel placeholder">' +
        '<p><b>CAE</b></p>' +
        '<p class="muted">Phase Readiness is under <b>WC Agent</b> on the Dashboard shell.</p>' +
        '<p class="muted">Embedded CAE unavailable; run <b>Workflow Cannon: Open Guidance Authoring</b> or refresh the Dashboard.</p>' +
        '</section>';

  const deferred = options?.deferredSections ?? new Set<DashboardSectionId>();
  const queueInner = tasksBlock + wishlistSection;
  const phaseJournalInner = renderPhaseNotesOverviewSection(phaseJournal ?? null, d.phaseJournalStats);

  const overviewWrapped = wrapDashboardSection("overview", overviewContent, deferred.has("overview"));
  const phaseRosterWrapped = wrapDashboardSection(
    "phase-roster",
    phaseRosterInner,
    deferred.has("phase-roster")
  );
  const ideasWrapped = wrapDashboardSection(
    "ideas",
    renderDashboardIdeasSectionInnerHtml(d.ideas),
    deferred.has("ideas")
  );
  const planArtifactWrapped = wrapDashboardSection(
    "plan-artifact",
    planArtifactInner,
    deferred.has("plan-artifact")
  );
  const planningInterviewWrapped = wrapDashboardSection(
    "planning-interview",
    planningInterviewInner,
    deferred.has("planning-interview")
  );
  const planningContent =
    phaseRosterWrapped + ideasWrapped + planArtifactWrapped + planningInterviewWrapped;
  const queueWrapped = wrapDashboardSection("queue", queueInner, deferred.has("queue"));
  const phaseJournalWrapped = wrapDashboardSection(
    "phase-journal",
    phaseJournalInner,
    deferred.has("phase-journal")
  );
  const taskEngineContent = phaseJournalWrapped + queueWrapped;

  const statusWrapped = wrapDashboardSection(
    "status",
    renderStatusSectionHtml(d, ss, editorIntegration),
    deferred.has("status")
  );

  const configWrapped = wrapDashboardSection(
    "config",
    renderConfigPanelShellHtml(),
    deferred.has("config")
  );

  const caeWrapped = wrapDashboardSection("cae", caePanelContent, deferred.has("cae"));

  // ── Tab shell ──────────────────────────────────────────────────────────────

  return (
    '<div class="wc-dashboard-tab-shell">' +
    '<div class="wc-header-sticky">' +
    renderWcDashboardBannerHtml(d) +
    renderDashboardTabBarHtml({
      activeTab: "overview",
      readyCount: totalReadyCount,
      blockedCount: totalBlockedCount,
      readModeBadge: options?.readModeBadge
    }) +
    '</div>' +
    '<div class="wc-tab-panel" data-wc-tab="overview" role="tabpanel">' + overviewWrapped + "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="planning" role="tabpanel" style="display:none">' +
    planningContent +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="task-engine" role="tabpanel" style="display:none">' +
    taskEngineContent +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="status" role="tabpanel" style="display:none">' +
    statusWrapped +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="config" role="tabpanel" style="display:none">' +
    configWrapped +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="cae" role="tabpanel" style="display:none">' +
    caeWrapped +
    "</div>" +
    "</div>"
  );
}

/** Status tab inner HTML for section patch hydration (T100398). */
export function renderDashboardStatusSectionInnerHtml(
  payload: unknown,
  editorIntegration?: EditorIntegrationRenderState | null
): string {
  const p = payload as { ok?: unknown; data?: Record<string, unknown> };
  if (p.ok !== true) {
    return '<p class="muted" role="status">Status unavailable.</p>';
  }
  const d = p.data ?? {};
  const ss = (d.stateSummary as Record<string, unknown>) || {};
  return renderStatusSectionHtml(d, ss, editorIntegration ?? null);
}

/** CAE tab inner HTML for section patch hydration (T100398). */
export function renderDashboardCaeSectionInnerHtml(embeddedCaePanelHtml: string | null): string {
  if (typeof embeddedCaePanelHtml === "string" && embeddedCaePanelHtml.trim().length > 0) {
    return (
      '<div class="gp-root wc-dash-cae-host dash-cae-embedded wc-dashboard-embedded-guidance">' +
      namespaceEmbeddedCaePanelHtml(embeddedCaePanelHtml) +
      "</div>"
    );
  }
  return (
    '<section class="dash-card" aria-label="CAE panel placeholder">' +
    '<p><b>CAE</b></p>' +
    '<p class="muted">Phase Readiness is under <b>WC Agent</b> on the Dashboard shell.</p>' +
    '<p class="muted">Embedded CAE unavailable; run <b>Workflow Cannon: Open Guidance Authoring</b> or refresh the Dashboard.</p>' +
    "</section>"
  );
}

/** Phase journal block inside the Queue tab (T100398 section patch). */
export function renderDashboardPhaseJournalSectionInnerHtml(
  phaseJournal: DashboardPhaseJournalBundle | null | undefined,
  phaseJournalStats: unknown
): string {
  return renderPhaseNotesOverviewSection(phaseJournal ?? null, phaseJournalStats);
}
