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
  type PhaseCatalogListRow
} from "../phase-roster-display.js";
import {
  renderPhaseBucketSummaryLabelHtml,
  renderPhaseScheduleTagHtml,
  resolvePhaseScheduleTag,
  type PhaseScheduleFocus
} from "../phase-schedule-tag.js";
import { buildGuidanceAuthoringWebviewBootstrap } from "../guidance/guidance-authoring-webview-bootstrap.js";
import { renderStatusTabInnerHtml } from "../status/render-status-tab.js";

function phaseScheduleFocusFromWorkspace(ws: Record<string, unknown> | null | undefined): PhaseScheduleFocus {
  return {
    currentKitPhase: ws?.currentKitPhase != null ? String(ws.currentKitPhase) : null,
    nextKitPhase: ws?.nextKitPhase != null ? String(ws.nextKitPhase) : null
  };
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

/** Inline deliverables + Edit on queue phase bucket headers (same behavior as Phase Roster). */
function renderPhaseBucketDeliverablesSuffixHtml(
  phaseKey: string,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const entry = catalog.get(phaseKey);
  const sd = entry?.shortDescription != null ? String(entry.shortDescription).trim() : "";
  const desc = sd.length > 0 ? escapeHtml(sd) : '<span class="muted">—</span>';
  const inputValue = escapeHtmlAttr(sd);
  const phaseKeyAttr = escapeHtmlAttr(phaseKey);
  return (
    ' <span class="phase-bucket-summary-deliverables">' +
    '<div class="dash-phase-deliverables dash-phase-deliverables--bucket" data-wc-phase-row="' +
    phaseKeyAttr +
    '">' +
    '<div class="dash-phase-deliverables-body">' +
    '<span class="dash-phase-deliverables-text">' +
    desc +
    "</span>" +
    '<div class="dash-phase-deliverables-editor" hidden><input type="text" class="dash-phase-deliverables-input wc-input" data-wc-phase-input="' +
    phaseKeyAttr +
    '" value="' +
    inputValue +
    '" aria-label="Deliverables for phase ' +
    phaseKeyAttr +
    '" /></div>' +
    '<span class="dash-phase-saving" aria-live="polite" hidden>Saving…</span>' +
    "</div>" +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary dash-phase-edit-anchor" data-wc-action="phase-deliverables-edit" data-wc-phase-key="' +
    phaseKeyAttr +
    '" aria-label="Edit deliverables for phase ' +
    phaseKeyAttr +
    '" title="Edit deliverables">Edit</button>' +
    '<p class="dash-phase-deliverables-error bad" aria-live="polite" hidden></p>' +
    "</div></span>"
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

/** Ready / proposed / blocked row control — posts `assignTaskPhase` (assign-task-phase). */
function renderPhaseAssignButton(taskId: string): string {
  const idAttr = escapeHtml(taskId);
  const aria = escapeHtmlAttr(`Set phase for task ${taskId}`);
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="assign-phase" data-task-id="' +
    idAttr +
    '" aria-label="' +
    aria +
    '" title="assign-task-phase — set stable phaseKey">Set Phase</button>'
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
    '" title="Open task detail view (markdown)">View Task</button>'
  );
}

function renderTaskCommentsButton(taskId: string, mode: "view" | "add"): string {
  const idAttr = escapeHtml(taskId);
  const label = mode === "add" ? "Add Comment" : "View Comments";
  const action = mode === "add" ? "task-comment-add" : "task-comments-view";
  const aria = escapeHtmlAttr(`${label} for task ${taskId}`);
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary' +
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
    renderPhaseAssignButton(taskId) +
    renderTaskDetailButton(taskId) +
    renderTaskCommentsButton(taskId, "view") +
    renderTaskCommentsButton(taskId, "add") +
    "</span>"
  );
}

/** Stable id for preserving `<details open>` when the host replaces `#root` innerHTML (`DashboardViewProvider` wcReplaceRoot). */
function wcTrackAttr(trackId: string): string {
  const safe = trackId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return ' data-wc-track="' + escapeHtml(safe) + '"';
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

/** Muted copy: execution-queue rollups exclude `wishlist_intake` (kit semantics). Safe on Overview + Task Engine (Wishlist lives on Task Engine). */
function renderExecutionReadyScopeFootnote(): string {
  return (
    '<p class="muted wc-ready-scope-note">' +
    "<b>Note:</b> Ready/proposed rollups follow the kit <em>execution queue</em>.</p>" +
    '<p class="muted">Wishlist intake rows are excluded; use <b>Wishlist</b> or <code>wk run list-tasks</code>.</p>'
  );
}

function recommendedNextCategoryFromRow(row: Record<string, unknown>): "execution" | "improvement" {
  const type = String(row.type ?? "").trim().toLowerCase();
  if (type === "improvement") {
    return "improvement";
  }
  const id = String(row.id ?? "").trim();
  if (/^imp-/i.test(id)) {
    return "improvement";
  }
  return "execution";
}

/** ★ "Recommended Next" card — kit `suggestedNext` (phase-aware ready ordering). */
function renderRecommendedNextCard(item: unknown): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const row = item as {
    id?: unknown;
    title?: unknown;
    phase?: unknown;
    phaseKey?: unknown;
    type?: unknown;
    priority?: unknown;
  };
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const phaseKey = row.phaseKey != null ? String(row.phaseKey).trim() : "";
  const phaseLabel = row.phase != null ? String(row.phase).trim() : "";
  if (!title && !id) {
    return "";
  }
  const displayTitle = title || id;
  const idAttr = id ? escapeHtmlAttr(id) : "";
  const phaseDisplay =
    phaseKey.length > 0 ? "Phase " + phaseKey : phaseLabel.length > 0 ? phaseLabel : "";
  const phaseTag =
    phaseDisplay.length > 0
      ? '<span class="wc-rec-tag wc-rec-tag-phase">' + escapeHtml(phaseDisplay) + "</span>"
      : "";
  const category = recommendedNextCategoryFromRow(row as Record<string, unknown>);
  const catTag =
    '<span class="wc-rec-tag wc-rec-tag-cat">' + escapeHtml(category) + "</span>";
  const viewBtn =
    id.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="task-detail" data-task-id="' +
        idAttr +
        '" title="Open task detail">View &rarr;</button>'
      : "";
  return (
    '<div class="wc-rec-next">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up next</span>' +
    "</div>" +
    '<p class="wc-rec-title">' +
    escapeHtml(displayTitle) +
    "</p>" +
    '<div class="wc-rec-footer">' +
    '<span class="wc-rec-tag wc-rec-tag-ready">ready</span>' +
    catTag +
    phaseTag +
    viewBtn +
    "</div>" +
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
        '" title="Prefill wishlist intake chat">Process &rarr;</button>'
      : "";
  const viewBtn =
    wishlistId.length > 0
      ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="wishlist-view" data-wishlist-id="' +
        idAttr +
        '" title="Open wishlist fields in the editor">View</button>'
      : "";
  return (
    '<div class="wc-rec-next wc-rec-next-wishlist">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Up next</span>' +
    "</div>" +
    '<p class="muted wc-rec-wl-hint">No execution-queue ready work — first open wishlist item.</p>' +
    "<p class=\"wc-rec-title\">" +
    escapeHtml(displayTitle) +
    "</p>" +
    '<div class="wc-rec-footer">' +
    '<span class="wc-rec-tag wc-rec-tag-wishlist">wishlist</span>' +
    '<span class="wc-rec-tag wc-rec-tag-open">open</span>' +
    '<span class="wc-rec-footer-actions">' +
    processBtn +
    viewBtn +
    "</span>" +
    "</div>" +
    "</div>"
  );
}

/** 4-pill stat row: Ready / Proposed / Blocked / Done. */
function renderStatPills(
  readyTotal: number,
  proposedTotal: number,
  blockedTotal: number,
  doneTotal: number
): string {
  const pills: Array<{ label: string; n: number; cls: string }> = [
    { label: "Ready", n: readyTotal, cls: "wc-pill-ready" },
    { label: "Proposed", n: proposedTotal, cls: "wc-pill-proposed" },
    { label: "Blocked", n: blockedTotal, cls: "wc-pill-blocked" },
    { label: "Done", n: doneTotal, cls: "wc-pill-done" },
  ];
  const filterMap: Record<string, string> = {
    "wc-pill-ready": "ready",
    "wc-pill-proposed": "proposed",
    "wc-pill-blocked": "blocked",
    "wc-pill-done": "all",
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
          '<span class="wc-stat-num">' +
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
}): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [{ value: "all", label: "All phases" }];
  const seen = new Set<string>(["all"]);
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

  const add = (value: string, label: string) => {
    if (!available.has(value) || seen.has(value)) {
      return;
    }
    seen.add(value);
    out.push({ value, label });
  };

  add("__no_phase__", "No Phase");

  const currentOrd = parsePhaseOrdinal(args.workspaceStatus?.currentKitPhase);
  const nextOrd = parsePhaseOrdinal(args.workspaceStatus?.nextKitPhase);

  if (currentOrd !== null) {
    const previous = currentOrd - 1;
    if (previous > 0) {
      add(String(previous), `Previous (${String(previous)})`);
    }
    add(String(currentOrd), `Current (${String(currentOrd)})`);
  }
  if (nextOrd !== null) {
    add(String(nextOrd), `Next (${String(nextOrd)})`);
  }

  const numericLeftovers = [...available]
    .filter((k) => /^\d+$/.test(k) && !seen.has(k))
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((n) => String(n));
  for (const k of numericLeftovers) {
    add(k, `Phase ${k}`);
  }

  const lexicalLeftovers = [...available]
    .filter((k) => !/^\d+$/.test(k) && k !== "__no_phase__" && !seen.has(k))
    .sort((a, b) => a.localeCompare(b));
  for (const k of lexicalLeftovers) {
    add(k, `Phase ${k}`);
  }

  return out;
}

function renderFilterChipBar(phaseOptions: Array<{ value: string; label: string }>): string {
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
  return (
    '<div class="wc-filter-chips" role="toolbar" aria-label="Filter task sections">' +
    '<button type="button" class="wc-filter-chip wc-filter-active" data-wc-filter-btn="all">All</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-ready" data-wc-filter-btn="ready">Ready</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-proposed" data-wc-filter-btn="proposed">Proposed</button>' +
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

/** Phase readiness card — rendered under WC Agent in the dashboard shell. */
function renderPhaseReadinessCard(
  ws: Record<string, unknown> | null,
  readyCount: number,
  blockedCount: number,
  proposedTotal: number
): string {
  const curPhase =
    ws?.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  const nextPhase =
    ws?.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const blockers: string[] = Array.isArray(ws?.blockers)
    ? (ws!.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  const pending: string[] = Array.isArray(ws?.pendingDecisions)
    ? (ws!.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];

  const totalReady = readyCount;
  const hasBlockers = blockers.length > 0 || blockedCount > 0;
  const hasProposed = proposedTotal > 0;

  function checkRow(label: string, ok: boolean, muted?: string): string {
    return (
      '<div class="wc-cae-check">' +
      '<span class="wc-cae-check-icon ' +
      (ok ? "wc-cae-check-ok" : "wc-cae-check-warn") +
      '">' +
      (ok ? "&#10003;" : "!") +
      "</span>" +
      '<span class="wc-cae-check-label">' +
      escapeHtml(label) +
      "</span>" +
      (muted ? '<span class="muted wc-cae-check-meta"> · ' + escapeHtml(muted) + "</span>" : "") +
      "</div>"
    );
  }

  const score = Math.round(
    ((totalReady > 0 ? 30 : 0) +
      (!hasBlockers ? 35 : blockedCount <= 1 ? 15 : 0) +
      (curPhase.length > 0 ? 20 : 0) +
      (!hasProposed || proposedTotal < 5 ? 15 : 5)) *
      1
  );

  const scoreColor =
    score >= 75 ? "wc-cae-score-ok" : score >= 40 ? "wc-cae-score-warn" : "wc-cae-score-bad";

  const phaseSection =
    curPhase.length > 0
      ? '<p><b>Current Phase</b> ' +
        escapeHtml(curPhase) +
        (nextPhase.length > 0 && nextPhase !== curPhase
          ? ' &rarr; <span class="muted">' + escapeHtml(nextPhase) + "</span>"
          : "") +
        "</p>"
      : '<p class="muted">No current phase set in workspace snapshot.</p>';

  const checksSection =
    '<div class="wc-cae-checks">' +
    checkRow(
      "Ready tasks available",
      totalReady > 0,
      totalReady > 0 ? String(totalReady) + " ready" : "none"
    ) +
    checkRow(
      "No active blockers",
      !hasBlockers,
      hasBlockers
        ? String(blockers.length + blockedCount) + " blocking"
        : "clear"
    ) +
    checkRow(
      "Phase configured",
      curPhase.length > 0,
      curPhase.length > 0 ? curPhase : "not set"
    ) +
    checkRow(
      "Proposed queue manageable",
      proposedTotal < 10,
      proposedTotal + " proposed"
    ) +
    "</div>";

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

  return (
    '<section class="dash-card wc-cae-readiness wc-cae-readiness-collapsed" aria-label="Phase readiness">' +
    '<button type="button" class="wc-cae-score-row wc-cae-readiness-toggle" data-wc-action="phase-readiness-toggle" aria-expanded="false" aria-controls="wc-cae-readiness-body">' +
    "<p><b>Phase Readiness</b></p>" +
    '<div class="wc-cae-score-badge ' +
    scoreColor +
    '">' +
    escapeHtml(String(score)) +
    "<span>%</span></div>" +
    "</button>" +
    '<div class="wc-cae-readiness-body" id="wc-cae-readiness-body">' +
    phaseSection +
    checksSection +
    pendingBlock +
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
    '<p class="muted"><b>Process</b> starts intake chat; <b>Decline</b> cancels the backing task.</p>' +
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
          '" title="Open full wishlist fields in the editor">View</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="wishlist-chat" data-wishlist-id="' +
          idAttr +
          '" title="Open wishlist intake flow for this item (prefills Cursor chat)">Process</button>' +
          '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="wishlist-decline" data-task-id="' +
          taskIdAttr +
          '" title="Decline → cancelled (reject on backing wishlist intake task; confirms policy rationale)">Decline</button>' +
          "</span></div>"
        );
      })
      .join("") +
    "</div>"
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
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    renderDashboardTaskBody(row) +
    renderQueueTaskActionButtons(id) +
    '<span class="dash-row-actions">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="proposed-imp-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="proposed-imp-decline" data-task-id="' +
    idAttr +
    '" title="Decline → cancelled (reject; confirms policy rationale)">Decline</button>' +
    "</span></div>"
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
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · Tasks sidebar <b>Improvements</b> or <code>list-tasks</code>.</p>"
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · Accept/Decline runs <code>run-transition</code> with approval.</p>' +
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
    '" title="Open task view (markdown)">View</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="transcript-churn-research-chat" data-task-id="' +
    idAttr +
    '" title="Open transcript churn research playbook in chat">Research</button>' +
    "</span></div>"
  );
}

function renderTranscriptChurnResearchList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      '<p class="muted">No transcript churn rows.</p>' +
      '<p class="muted">When rows appear, investigate, then run <code>synthesize-transcript-churn</code>.</p>'
    );
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · <code>list-tasks</code> with filters.</p>"
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
  const idAttr = escapeHtml(id);
  return (
    '<div class="dash-row" role="listitem">' +
    renderDashboardTaskBody(row) +
    renderQueueTaskActionButtons(id) +
    '<span class="dash-row-actions">' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="proposed-exe-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="proposed-exe-decline" data-task-id="' +
    idAttr +
    '" title="Decline → cancelled (reject; confirms policy rationale)">Decline</button>' +
    "</span></div>"
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
    '<p class="muted"><b>Row actions</b> · Accept/Decline runs <code>run-transition</code>.</p>' +
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
}): string {
  const pk = escapeHtmlAttr(args.phaseKey.trim());
  const phrase = escapeHtmlAttr(args.phasePhrase.trim());
  const ids = escapeHtmlAttr(args.taskIds.join(","));
  const cur = escapeHtmlAttr(args.workspaceCurrent.trim());
  const nxt = escapeHtmlAttr(args.workspaceNext.trim());
  const scope = args.scope === "current" ? "current" : "bucket";
  const title =
    scope === "current"
      ? "Drain current workspace phase, close out, and release"
      : "Drain this phase bucket, close out, and release";
  return (
    '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-release-btn" data-wc-action="phase-complete-release"' +
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
    '" data-wc-release-scope="' +
    scope +
    '" title="' +
    escapeHtmlAttr(title) +
    '">Complete &amp; Release</button>'
  );
}

/** Overview entry: closeout for workspace `currentKitPhase`. */
function renderOverviewCompleteReleaseBar(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return "";
  }
  const cur = ws.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  if (cur.length === 0) {
    return "";
  }
  const next = ws.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  return (
    '<section class="dash-card dash-phase-release-overview" aria-label="Phase closeout">' +
    '<div class="dash-phase-release-overview-row">' +
    "<p><b>Closeout phase " +
    escapeHtml(cur) +
    "</b> <span class=\"muted\">— drain queue, merge, release</span></p>" +
    renderPhaseCompleteReleaseButton({
      phaseKey: cur,
      phasePhrase: "Phase " + cur,
      taskIds: [],
      workspaceCurrent: cur,
      workspaceNext: next,
      scope: "current"
    }) +
    "</div></section>"
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
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  const phaseFocus = phaseScheduleFocusFromWorkspace(workspaceStatus);
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
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; phaseKey?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const phaseKey = b.phaseKey != null ? String(b.phaseKey).trim() : "";
        const phasePhrase = resolvePhasePhraseForCompleteRelease(b);
        const taskIds = collectPhaseBucketTaskIds(b);
        const showRelease = readyPhaseBucketHasTasks(raw) && phaseKey.length > 0;
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
        const body = renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          summaryLabel +
          releaseBtn +
          "</summary>" +
          body +
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
      ? '<p class="muted">Preview capped per phase · expand sections below or <code>list-tasks</code> for full lists.</p>'
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · Accept/Decline per row; Accept All processes the phase.</p>' +
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown; phaseKey?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-accept-all" data-wc-action="proposed-imp-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed improvement in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedImprovementsList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
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
      ? '<p class="muted">Preview capped per phase · expand sections below or <code>list-tasks</code> for full lists.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTranscriptChurnResearchList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
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
      ? '<p class="muted">Preview capped per phase · expand below or <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<p class="muted"><b>Accept All</b> accepts every proposed execution task in that phase.</p>' +
    '<div class="phase-stack">' +
    bucketsPe
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown; phaseKey?: unknown };
        const summaryLabel = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="wc-btn wc-btn-sm wc-btn-primary dash-phase-accept-all" data-wc-action="proposed-exe-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed execution task in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedExecutionList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
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
      ? '<p class="muted">Preview capped per phase · full list via <code>list-tasks</code> or <code>get-next-actions</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    bucketsBl
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : renderBlockedList(b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
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

/**
 * Terminal statuses (completed / cancelled): phase buckets closed until expanded.
 */
function renderTerminalTaskPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  totalInStatus: number,
  emptyMessage: string,
  phaseTrackPrefix: string,
  phaseFocus: PhaseScheduleFocus,
  catalog: Map<string, PhaseCatalogListRow>
): string {
  const bucketsTm = phaseBucketsNonEmpty(phaseBuckets);
  if (bucketsTm.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  const sum = bucketsTm.reduce((acc: number, x: unknown) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sum < totalInStatus
      ? '<p class="muted">Preview capped per phase · full list via <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    bucketsTm
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; phaseKey?: unknown };
        const summary = phaseBucketSummaryHtml(b, phaseFocus, catalog);
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket terminal-phase-bucket"' +
          phaseBucketFilterAttr(b.phaseKey) +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
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
        ? '<p class="muted"><b>Persistence:</b> Response-only; no task was written.</p>'
        : panel.code === "planning-wishlist-ready"
          ? '<p class="muted"><b>Persistence:</b> Answers saved; finalize with <code>build-plan</code> when ready.</p>'
          : panel.code === "planning-artifact-created"
            ? '<p class="muted"><b>Persistence:</b> Wishlist intake created; refresh the dashboard.</p>'
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
      '<p class="muted">Team execution data unavailable (kit SQLite below v7 or store not readable).</p>' +
      "</section>"
    );
  }
  if (top.length === 0) {
    return (
      '<section class="dash-card" aria-label="Team execution">' +
      "<p><b>Team Assignments</b></p>" +
      statusLine +
      '<p class="muted">No active supervisor assignments.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = escapeHtml(String(r.id ?? ""));
      const tid = escapeHtml(String(r.executionTaskId ?? ""));
      const title = r.executionTaskTitle != null ? escapeHtml(String(r.executionTaskTitle)) : "";
      const st = escapeHtml(String(r.status ?? ""));
      const sup = escapeHtml(String(r.supervisorId ?? ""));
      const wrk = escapeHtml(String(r.workerId ?? ""));
      const label =
        "- " +
        id +
        " → " +
        tid +
        (title ? " " + title : "") +
        " · " +
        st +
        " · sup " +
        sup +
        " · worker " +
        wrk;
      return '<div class="dash-row" role="listitem"><span class="dash-row-label">' + label + "</span></div>";
    })
    .join("");
  return (
    '<section class="dash-card" aria-label="Team execution">' +
    "<p><b>Team Assignments</b> (read-only)</p>" +
    statusLine +
    '<div class="dash-row-list" role="list">' +
    rows +
    "</div></section>"
  );
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
  const openSess = typeof o.openSessionsCount === "number" ? o.openSessionsCount : 0;
  const top = Array.isArray(o.topOpenSessions) ? (o.topOpenSessions as unknown[]) : [];
  if (!avail) {
    return (
      '<section class="dash-card" aria-label="Subagent registry">' +
      "<p><b>Subagent Registry</b></p>" +
      '<p class="muted">Subagent data unavailable (kit SQLite below v6 or store not readable).</p>' +
      "</section>"
    );
  }
  const statusLine =
    "<p class=\"muted\">Definitions " +
    String(defs) +
    " · Open sessions " +
    String(openSess) +
    "</p>";
  if (top.length === 0) {
    return (
      '<section class="dash-card" aria-label="Subagent registry">' +
      "<p><b>Subagent Registry</b> (read-only)</p>" +
      statusLine +
      '<p class="muted">No open subagent sessions.</p>' +
      "</section>"
    );
  }
  const rows = top
    .map((x) => {
      const r = x as Record<string, unknown>;
      const sid = escapeHtml(String(r.sessionId ?? ""));
      const def = escapeHtml(String(r.definitionId ?? ""));
      const tid = r.executionTaskId != null ? escapeHtml(String(r.executionTaskId)) : "—";
      const st = escapeHtml(String(r.status ?? ""));
      return (
        '<div class="dash-row" role="listitem"><span class="dash-row-label">- ' +
        sid +
        " · " +
        def +
        " · task " +
        tid +
        " · " +
        st +
        "</span></div>"
      );
    })
    .join("");
  return (
    '<section class="dash-card" aria-label="Subagent registry">' +
    "<p><b>Subagent Registry</b> (read-only)</p>" +
    statusLine +
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

type DashboardAgentRenderRow = {
  label: string;
  role: string;
  detail: string;
  phase: string;
  lastActivity: string;
  kind: string;
  taskId: string;
  subagent: boolean;
};

function cleanDashboardText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function agentStatusRenderRows(d: Record<string, unknown>): { kind: string; label: string; rows: DashboardAgentRenderRow[] } {
  let label = "Awaiting Instruction";
  let kind = "awaiting_instruction";
  const rows: DashboardAgentRenderRow[] = [];
  const agentStatus = d.agentStatus;
  if (agentStatus && typeof agentStatus === "object") {
    const row = agentStatus as Record<string, unknown>;
    const rawLabel = cleanDashboardText(row.label);
    const rawKind = cleanDashboardText(row.kind);
    if (rawLabel.length > 0) {
      label = rawLabel;
    }
    if (rawKind.length > 0) {
      kind = rawKind;
    }
    rows.push({
      label,
      role: "Current agent",
      detail: cleanDashboardText(row.detail) || humanizeDashboardToken(kind),
      phase: cleanDashboardText(row.phaseKey) || "—",
      lastActivity: cleanDashboardText(row.updatedAt) || "—",
      kind,
      taskId: cleanDashboardText(row.taskId),
      subagent: false
    });
  } else {
    rows.push({
      label,
      role: "Current agent",
      detail: "Waiting for operator instruction",
      phase: "—",
      lastActivity: "—",
      kind,
      taskId: "",
      subagent: false
    });
  }

  const teamExecution = d.teamExecution && typeof d.teamExecution === "object"
    ? (d.teamExecution as Record<string, unknown>)
    : null;
  const topActive = Array.isArray(teamExecution?.topActive) ? teamExecution.topActive : [];
  for (const raw of topActive.slice(0, 6)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const workerId = cleanDashboardText(row.workerId);
    const supervisorId = cleanDashboardText(row.supervisorId);
    const taskId = cleanDashboardText(row.executionTaskId);
    const title = cleanDashboardText(row.executionTaskTitle);
    const status = cleanDashboardText(row.status);
    rows.push({
      label: workerId || supervisorId || taskId || "Assigned agent",
      role: status ? `Team ${humanizeDashboardToken(status)}` : "Team assignment",
      detail: title || (taskId ? `Task ${taskId}` : "Assigned work"),
      phase: "—",
      lastActivity: cleanDashboardText(row.updatedAt) || "—",
      kind: status || "team_assignment",
      taskId,
      subagent: false
    });
  }

  const subagentRegistry = d.subagentRegistry && typeof d.subagentRegistry === "object"
    ? (d.subagentRegistry as Record<string, unknown>)
    : null;
  const topOpenSessions = Array.isArray(subagentRegistry?.topOpenSessions) ? subagentRegistry.topOpenSessions : [];
  for (const raw of topOpenSessions.slice(0, 6)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const definitionId = cleanDashboardText(row.definitionId);
    const sessionId = cleanDashboardText(row.sessionId);
    const taskId = cleanDashboardText(row.executionTaskId);
    const status = cleanDashboardText(row.status);
    rows.push({
      label: definitionId || sessionId || "Subagent",
      role: "Subagent",
      detail: taskId ? `Task ${taskId}` : humanizeDashboardToken(status || "open"),
      phase: "—",
      lastActivity: cleanDashboardText(row.updatedAt) || "—",
      kind: status || "subagent",
      taskId,
      subagent: true
    });
  }

  return { kind, label, rows };
}

function renderAgentStatusBanner(d: Record<string, unknown>): string {
  const { kind, label, rows } = agentStatusRenderRows(d);
  const rowHtml = rows
    .map((row) => {
      const labelText = row.label || "—";
      const roleText = row.role || "—";
      const aria = `${labelText}, ${roleText}`;
      const taskChip = row.taskId
        ? '<span class="dash-agent-row-chip">' + escapeHtml(row.taskId) + "</span>"
        : "";
      const subChip = row.subagent ? '<span class="dash-agent-row-chip dash-agent-row-chip-sub">Subagent</span>' : "";
      return (
        '<div class="dash-agent-row' +
        (row.subagent ? " dash-agent-row--subagent" : "") +
        '" role="listitem" aria-label="' +
        escapeHtmlAttr(aria) +
        '">' +
        '<span class="dash-agent-row-icon" aria-hidden="true">' +
        (row.subagent ? "↳" : "●") +
        "</span>" +
        '<span class="dash-agent-row-main"><b>' +
        escapeHtml(labelText) +
        '</b><span class="muted">' +
        escapeHtml(roleText) +
        "</span></span>" +
        '<span class="dash-agent-row-detail">' +
        escapeHtml(row.detail || "—") +
        "</span>" +
        '<span class="dash-agent-row-meta">' +
        (row.phase !== "—" ? '<span class="dash-agent-row-chip">Phase ' + escapeHtml(row.phase) + "</span>" : "") +
        taskChip +
        subChip +
        '<span class="muted">' +
        escapeHtml(row.lastActivity || "—") +
        "</span></span>" +
        "</div>"
      );
    })
    .join("");
  return (
    '<section class="dash-agent-status-banner" aria-label="WC Agent status" data-agent-status-kind="' +
    escapeHtmlAttr(kind) +
    '">' +
    '<p><b>WC Agent is:</b> <span class="dash-agent-status-label">' +
    escapeHtml(label) +
    "</span></p>" +
    '<div class="dash-agent-row-list" role="list">' +
    rowHtml +
    "</div>" +
    "</section>"
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
  phaseSlice: Record<string, unknown> | null | undefined
): string {
  if (!phaseSlice || typeof phaseSlice !== "object") {
    return "";
  }
  const cat = phaseSlice.phaseCatalog as Record<string, unknown> | undefined;
  const supported = cat && cat.supported === true;
  if (!supported) {
    return (
      '<section class="dash-card dash-phase-catalog" aria-label="Phase catalog">' +
      "<p><b>Phase Roster</b></p>" +
      '<p class="muted">Optional phase descriptions require planning SQLite <b>v23+</b> (upgrade workspace-kit, reopen DB).</p>' +
      "</section>"
    );
  }
  const phases = parsePhaseCatalogRows(phaseSlice);

  let inner: string;
  if (phases.length === 0) {
    inner =
      '<p class="muted">No phases in roster yet — set workspace current/next, assign tasks to a phase, or register a catalog entry.</p>';
  } else {
    const narrow = buildNarrowPhaseRosterRows(phases, phaseSlice);
    if (!narrow.ok) {
      inner =
        '<p class="muted">Set a numeric workspace <b>current phase</b> to show the last delivered phase, the active one, and upcoming phases here.</p>';
    } else {
      const rosterFocus = phaseScheduleFocusFromWorkspace(phaseSlice);
      let rows = "";
      for (const r of narrow.rows) {
        const sd = r.shortDescription != null ? String(r.shortDescription).trim() : "";
        const desc = sd.length > 0 ? escapeHtml(sd) : '<span class="muted">—</span>';
        const inputValue = escapeHtmlAttr(sd);
        const scheduleTag = resolvePhaseScheduleTag(r.phaseKey, rosterFocus);
        const statusTag =
          scheduleTag !== null ? renderPhaseScheduleTagHtml(scheduleTag) : '<span class="muted">—</span>';
        const phaseKeyAttr = escapeHtmlAttr(r.phaseKey);
        const noCatalogHint =
          r.inCatalog === true
            ? ""
            : ' <abbr class="muted dash-phase-no-catalog" title="No planning catalog row for this phase key">?</abbr>';
        rows +=
          `<tr><td class="dash-phase-roster-col-phase"><code>${escapeHtml(r.phaseKey)}</code></td><td class="dash-phase-roster-col-status">${statusTag}${noCatalogHint}</td><td class="dash-phase-roster-col-deliverables dash-phase-deliverables-cell"><div class="dash-phase-deliverables" data-wc-phase-row="${phaseKeyAttr}">` +
          '<div class="dash-phase-deliverables-body">' +
          `<span class="dash-phase-deliverables-text">${desc}</span>` +
          `<div class="dash-phase-deliverables-editor" hidden><input type="text" class="dash-phase-deliverables-input wc-input" data-wc-phase-input="${phaseKeyAttr}" value="${inputValue}" aria-label="Deliverables for phase ${phaseKeyAttr}" /></div>` +
          '<span class="dash-phase-saving" aria-live="polite" hidden>Saving…</span></div>' +
          `<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary dash-phase-edit-anchor" data-wc-action="phase-deliverables-edit" data-wc-phase-key="${phaseKeyAttr}" aria-label="Edit deliverables for phase ${phaseKeyAttr}" title="Edit deliverables">Edit</button>` +
          '<p class="dash-phase-deliverables-error bad" aria-live="polite" hidden></p></div></td></tr>';
      }
      inner =
        rows.length > 0
          ? '<table class="dash-phase-catalog-table"><thead><tr><th class="dash-phase-roster-col-phase">Phase</th><th class="dash-phase-roster-col-status">Status</th><th class="dash-phase-roster-col-deliverables">Deliverables</th></tr></thead><tbody>' +
            rows +
            "</tbody></table>"
          : '<p class="muted">No matching roster rows.</p>';
    }
  }
  const table = inner;
  const btn =
    '<p style="margin-top:8px"><button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-wc-action="register-phase-catalog">Register future phase</button></p>';
  return (
    '<section class="dash-card dash-phase-catalog" aria-label="Phase catalog">' +
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
      '<p class="muted">No workspace status from kit SQLite.</p>' +
      '<p class="muted">Run <code>pnpm run wk doctor</code> or migrate planning DB to user_version 10+.</p>' +
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

/** Status tab: workspace identity, agent profile, and task counts from dashboard-summary data. */
function renderStatusSectionHtml(
  d: Record<string, unknown>,
  ss: Record<string, unknown>,
  editorIntegration?: EditorIntegrationRenderState | null
): string {
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
    kvRow("Kit version", escapeHtml(kitVersion)) +
    kvRow("Kit root", "<code>" + escapeHtml(kitRoot) + "</code>") +
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
    '<p class="muted wc-status-guidance-manage">Manage guidance policies via the CAE sidebar panel (Workflow Cannon activity bar).</p>' +
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
    '<p class="muted wc-status-counts-scope-note">' +
    "<b>Note:</b> Task Counts uses <code>stateSummary</code> store-wide statuses.</p>" +
    '<p class="muted">Overview pills and Queue sections use execution-queue rollups.</p>' +
    '<p class="muted">Ready/proposed excludes <code>wishlist_intake</code>.</p>' +
    "</section>";

  return agentCard + renderStatusEditorIntegrationSection(editorIntegration) + workspaceCard + planningCard + countsCard + renderEmbeddedStatusPanelHtml(d);
}

/**
 * Render the full status panel (header, This Workspace, Planning Data, Agent
 * Profile, Phase & Workspace, Coordination, Doctor, Modules, CAE, Task Counts)
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
export function renderPhaseNotesOverviewSection(bundle: DashboardPhaseJournalBundle | null | undefined): string {
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

  return (
    '<section class="dash-card dash-phase-notes" aria-label="Phase notes">' +
    '<div class="dash-phase-notes-head"><p><b>Phase Notes</b></p>' +
    addBtn +
    "</div>" +
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
  embeddedCaePanelHtml?: string | null
): string {
  if (payload === null || payload === undefined) {
    return "<p>No payload</p>";
  }
  const p = payload as { ok?: unknown; code?: unknown; data?: Record<string, unknown> };
  if (p.ok !== true) {
    const guidance =
      p.code === "policy-denied"
        ? "\n\nPolicy denied: provide policyApproval rationale/session scope where required."
        : "";
    return (
      '<pre class="bad">' + escapeHtml(JSON.stringify(payload, null, 2) + guidance) + "</pre>"
    );
  }
  const d = p.data ?? {};
  const ss = (d.stateSummary as Record<string, unknown>) || {};
  const ws = (d.workspaceStatus as Record<string, unknown> | null | undefined) ?? null;
  const phaseFocus = phaseScheduleFocusFromWorkspace(ws);
  const phaseSystemSlice =
    d.systemStatus && typeof d.systemStatus === "object"
      ? ((d.systemStatus as Record<string, unknown>).phase as Record<string, unknown> | undefined)
      : undefined;
  const phaseCatalogLookup = buildPhaseCatalogLookup(phaseSystemSlice);
  const wishlist = (d.wishlist as Record<string, unknown>) || {};
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
          phaseCatalogLookup
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
          phaseCatalogLookup
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
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="add-wishlist-item" title="Create a wishlist intake task (same flow as /add-wishlist-item)">Add wishlist item</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="collaboration-hub" title="Chat + CLI for collaboration profiles; chat does not replace policyApproval">Collaboration profiles</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" data-wc-action="transcript-churn-research-chat" title="Transcript churn research playbook">Research churn</button>' +
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
    ]
  });

  const tasksBlock =
    '<section class="dash-card dashboard-tasks-block" aria-label="Task queue rollups">' +
    tasksQuickActionsPanel +
    renderFilterChipBar(queuePhaseFilterOptions) +
    renderStatusRollup(
      "status-ready",
      "<b>Ready</b> (" + String(readyCount) + ")",
      renderExecutionReadyScopeFootnote() +
        renderReadyPhaseBuckets(
          readyPhaseBuckets,
          readyTop,
          "No ready tasks.",
          "rdy",
          ws as Record<string, unknown> | null,
          phaseCatalogLookup
        ),
      /* Always render body so execution-queue scope footnote appears even when count is 0. */
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
    terminalSection +
    "</section>";

  const wishlistSection =
    '<section class="dash-card" aria-label="Wishlist">' +
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
    "</div></details></section>";

  // ── Assemble tab content ───────────────────────────────────────────────────

  const firstWishlistOpen = wishlistOpenTop[0];
  const suggestedNext = d.suggestedNext;
  /** Kit `suggestedNext` (workspace phase + priority); wishlist only when no runnable ready work. */
  const recNextCard =
    suggestedNext && typeof suggestedNext === "object"
      ? renderRecommendedNextCard(suggestedNext)
      : firstWishlistOpen
        ? renderRecommendedNextWishlistCard(firstWishlistOpen)
        : "";

  const totalReadyCount = readyCount;
  const totalProposedCount = piCount + peCount;
  const totalBlockedCount = Number(blockedSummary.count ?? 0);
  const totalDoneCount =
    typeof (d.completedSummary as Record<string, unknown> | undefined)?.count === "number"
      ? ((d.completedSummary as Record<string, unknown>).count as number)
      : 0;

  const overviewContent =
    renderAgentStatusBanner(d) +
    recNextCard +
    renderPhaseReadinessCard(
      ws as Record<string, unknown> | null,
      readyCount,
      totalBlockedCount,
      totalProposedCount
    ) +
    renderStatPills(totalReadyCount, totalProposedCount, totalBlockedCount, totalDoneCount) +
    renderOverviewCompleteReleaseBar(ws as Record<string, unknown> | null) +
    renderPhaseCatalogOverviewSection(phaseSystemSlice) +
    renderWorkspaceBlockersPendingSection(ws as Record<string, unknown> | null) +
    renderTeamExecutionSection(d.teamExecution) +
    renderSubagentRegistrySection(d.subagentRegistry);

  const caePanelContent =
    typeof embeddedCaePanelHtml === "string" && embeddedCaePanelHtml.trim().length > 0
      ? '<div class="gp-root wc-dash-cae-host dash-cae-embedded">' +
        namespaceEmbeddedCaePanelHtml(embeddedCaePanelHtml) +
        "<script>" +
        buildGuidanceAuthoringWebviewBootstrap("dash-cae-") +
        "</script></div>"
      : '<section class="dash-card" aria-label="CAE panel placeholder">' +
        '<p><b>CAE</b></p>' +
        '<p class="muted">Phase Readiness is under <b>WC Agent</b> on the Dashboard shell.</p>' +
        '<p class="muted">Embedded CAE panel unavailable; use the Guidance panel as fallback.</p>' +
        '</section>';

  const taskEngineContent =
    renderPhaseNotesOverviewSection(phaseJournal ?? null) +
    tasksBlock +
    wishlistSection +
    renderPlanningSession(planningSession, planningWizardPanel);

  const statusContent = renderStatusSectionHtml(d, ss, editorIntegration);

  const configContent =
    '<section class="dash-card" aria-label="Config">' +
    "<p><b>Config</b></p>" +
    '<p class="muted">Configuration keys are managed in the <b>Config</b> sidebar panel.</p>' +
    '<p class="muted">Open it from the activity bar, or run <code>wk config</code> from the terminal.</p>' +
    '<p class="muted">Common keys: <code>kit.agentGuidance</code> · <code>kit.currentPhase</code> · ' +
    "<code>kit.agentRole</code> · <code>kit.planningGenerationPolicy</code></p>" +
    "</section>";

  // ── Tab shell ──────────────────────────────────────────────────────────────

  return (
    '<div class="wc-dashboard-tab-shell">' +
    '<div class="wc-tab-bar" role="tablist">' +
    '<button type="button" class="wc-tab-btn wc-tab-active" role="tab" data-wc-tab="overview">Overview</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="task-engine">Queue' +
    (totalReadyCount > 0
      ? '<span class="wc-tab-badge wc-tab-badge-ready">' + escapeHtml(String(totalReadyCount)) + "</span>"
      : totalBlockedCount > 0
        ? '<span class="wc-tab-badge wc-tab-badge-blocked">' + escapeHtml(String(totalBlockedCount)) + "</span>"
        : "") +
    "</button>" +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="status">Status</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="config">Config</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="cae">CAE</button>' +
    "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="overview" role="tabpanel">' + overviewContent + "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="task-engine" role="tabpanel" style="display:none">' + taskEngineContent + "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="status" role="tabpanel" style="display:none">' + statusContent + "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="config" role="tabpanel" style="display:none">' + configContent + "</div>" +
    '<div class="wc-tab-panel" data-wc-tab="cae" role="tabpanel" style="display:none">' + caePanelContent + "</div>" +
    "</div>"
  );
}
