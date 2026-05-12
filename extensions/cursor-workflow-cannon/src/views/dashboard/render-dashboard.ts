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
  phaseRosterStatusLabel,
  type PhaseCatalogListRow
} from "../phase-roster-display.js";

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute-safe escaping for double-quoted HTML attributes. */
export function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Ready / proposed / blocked row control — posts `assignTaskPhase` (assign-task-phase). */
function renderPhaseAssignButton(taskId: string): string {
  const idAttr = escapeHtml(taskId);
  const aria = escapeHtmlAttr(`Move task ${taskId} to a different phase`);
  return (
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="assign-phase" data-task-id="' +
    idAttr +
    '" aria-label="' +
    aria +
    '" title="assign-task-phase — set stable phaseKey">Phase</button>'
  );
}

/** Stable id for preserving `<details open>` when the host replaces `#root` innerHTML (`DashboardViewProvider` wcReplaceRoot). */
function wcTrackAttr(trackId: string): string {
  const safe = trackId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return ' data-wc-track="' + escapeHtml(safe) + '"';
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
    "<b>Note:</b> Ready / proposed rollups follow the kit <em>execution queue</em> — they omit <code>wishlist_intake</code> even when that row is ready. " +
    "Use <b>Wishlist</b> on the <b>Task Engine</b> tab, or <code>wk run list-tasks</code> for the full store.</p>"
  );
}

/** ★ "Recommended Next" card — first ready task (category from caller). */
function renderRecommendedNextCard(
  item: unknown,
  category: "execution" | "improvement"
): string {
  if (!item || typeof item !== "object") {
    return "";
  }
  const row = item as { id?: unknown; title?: unknown; phase?: unknown; priority?: unknown };
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const phase = row.phase != null ? String(row.phase).trim() : "";
  if (!title && !id) {
    return "";
  }
  const displayTitle = title || id;
  const idAttr = id ? escapeHtmlAttr(id) : "";
  const phaseTag =
    phase.length > 0
      ? '<span class="wc-rec-tag wc-rec-tag-phase">' + escapeHtml(phase) + "</span>"
      : "";
  const catTag =
    '<span class="wc-rec-tag wc-rec-tag-cat">' + escapeHtml(category) + "</span>";
  const viewBtn =
    id.length > 0
      ? '<button type="button" class="wc-rec-start-btn" data-wc-action="task-detail" data-task-id="' +
        idAttr +
        '" title="Open task detail">View &rarr;</button>'
      : "";
  return (
    '<div class="wc-rec-next">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Recommended Next</span>' +
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
      ? '<button type="button" class="wc-rec-start-btn" data-wc-action="wishlist-chat" data-wishlist-id="' +
        idAttr +
        '" title="Prefill wishlist intake chat">Process &rarr;</button>'
      : "";
  const viewBtn =
    wishlistId.length > 0
      ? '<button type="button" class="wc-rec-start-btn wc-rec-wl-view" data-wc-action="wishlist-view" data-wishlist-id="' +
        idAttr +
        '" title="Open wishlist fields in the editor">View</button>'
      : "";
  return (
    '<div class="wc-rec-next wc-rec-next-wishlist">' +
    '<div class="wc-rec-header">' +
    '<span class="wc-rec-label">&#9733; Recommended Next</span>' +
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
          '" title="Switch to Task Engine — ' +
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

/** Filter chip bar for the Task Engine tab. */
function renderFilterChipBar(): string {
  return (
    '<div class="wc-filter-chips" role="toolbar" aria-label="Filter task sections">' +
    '<button type="button" class="wc-filter-chip wc-filter-active" data-wc-filter-btn="all">All</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-ready" data-wc-filter-btn="ready">Ready</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-proposed" data-wc-filter-btn="proposed">Proposed</button>' +
    '<button type="button" class="wc-filter-chip wc-filter-chip-blocked" data-wc-filter-btn="blocked">Blocked</button>' +
    "</div>"
  );
}

/** Phase readiness card for the CAE tab. */
function renderCaePhaseReadinessContent(
  ws: Record<string, unknown> | null,
  readyExeCount: number,
  readyImpCount: number,
  blockedCount: number,
  proposedTotal: number,
  agentGuidance: unknown
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

  const totalReady = readyExeCount + readyImpCount;
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

  const guidanceLines: string[] = [];
  if (agentGuidance && typeof agentGuidance === "object") {
    const ag = agentGuidance as Record<string, unknown>;
    const roleLabel =
      typeof ag.displayLabel === "string" && ag.displayLabel.trim()
        ? ag.displayLabel.trim()
        : "";
    const tempLabel =
      typeof ag.temperamentLabel === "string" && ag.temperamentLabel.trim()
        ? ag.temperamentLabel.trim()
        : "";
    if (roleLabel) {
      guidanceLines.push("Role: " + roleLabel);
    }
    if (tempLabel) {
      guidanceLines.push("Temperament: " + tempLabel);
    }
  }

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

  const activeGuidance =
    guidanceLines.length > 0
      ? '<section class="dash-card" aria-label="Agent guidance">' +
        "<p><b>Active Guidance</b></p>" +
        guidanceLines
          .map((l) => "<p>" + escapeHtml(l) + "</p>")
          .join("") +
        '<p class="muted">Manage guidance policies via the CAE sidebar panel (Workflow Cannon activity bar).</p>' +
        "</section>"
      : "";

  return (
    '<section class="dash-card wc-cae-readiness" aria-label="Phase readiness">' +
    '<div class="wc-cae-score-row">' +
    "<p><b>Phase Readiness</b></p>" +
    '<div class="wc-cae-score-badge ' +
    scoreColor +
    '">' +
    escapeHtml(String(score)) +
    "<span>%</span></div>" +
    "</div>" +
    phaseSection +
    checksSection +
    pendingBlock +
    "</section>" +
    activeGuidance +
    '<section class="dash-card" aria-label="CAE sidebar">' +
    "<p><b>CAE — Full Controls</b></p>" +
    '<p class="muted">Pre-flight checks, guidance management, and check history are in the ' +
    "<b>CAE</b> sidebar panel. Open it via the Workflow Cannon activity bar.</p>" +
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

function renderTaskRowList(items: unknown, emptyMessage = "No ready tasks."): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">' + escapeHtml(emptyMessage) + "</p>";
  }
  return (
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; priority?: unknown };
        const id = String(row?.id ?? "").trim();
        const pri = row?.priority ? " [" + escapeHtml(String(row.priority)) + "]" : "";
        const label = "- " + escapeHtml(id) + (id ? " " : "") + escapeHtml(String(row?.title ?? "")) + pri;
        const idAttr = escapeHtml(id);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">' +
          label +
          "</span>" +
          (id.length > 0
            ? '<span class="dash-row-actions">' +
              renderPhaseAssignButton(id) +
              '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task view (markdown)">View</button>' +
              "</span>"
            : "") +
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
    '<p class="muted"><b>Open Wishlist Preview</b> · <b>Process</b> runs intake in chat; <b>Decline</b> cancels the backing intake task (<code>reject</code> → cancelled).</p>' +
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
          '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="wishlist-view" data-wishlist-id="' +
          idAttr +
          '" title="Open full wishlist fields in the editor">View</button>' +
          '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="wishlist-chat" data-wishlist-id="' +
          idAttr +
          '" title="Open wishlist intake flow for this item (prefills Cursor chat)">Process</button>' +
          '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="wishlist-decline" data-task-id="' +
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
    '<button type="button" class="dash-row-action dash-row-action-tertiary"' +
    (prevDisabled ? " disabled" : "") +
    ' data-wc-action="wishlist-page" data-wishlist-page="' +
    String(prevPage) +
    '">Prev</button>' +
    '<span>Page ' +
    String(openPage + 1) +
    " of " +
    String(openTotalPages) +
    "</span>" +
    '<button type="button" class="dash-row-action dash-row-action-tertiary"' +
    (nextDisabled ? " disabled" : "") +
    ' data-wc-action="wishlist-page" data-wishlist-page="' +
    String(nextPage) +
    '">Next</button>' +
    "</div>"
  );
}

function renderProposedImprovementRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
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
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="proposed-imp-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="proposed-imp-decline" data-task-id="' +
    idAttr +
    '" title="Decline → cancelled (reject; confirms policy rationale)">Decline</button>' +
    "</span></div>"
  );
}

function renderProposedImprovementsList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">No proposed improvements (<code>type: improvement</code>, <code>status: proposed</code>; legacy <code>imp-*</code> may still appear). Run <code>generate-recommendations</code> / <code>ingest-transcripts</code> or log via <code>create-task</code> per playbook. Confirm: <code>workspace-kit run list-tasks '{}'</code>.</p>`;
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · Tasks sidebar <b>Improvements</b> or <code>list-tasks</code>.</p>"
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> run <code>run-transition</code> (<code>accept</code> / <code>reject</code>; modal rationale + planning token when required).</p>' +
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
    '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
    idAttr +
    '" title="Open task view (markdown)">View</button>' +
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="transcript-churn-research-chat" data-task-id="' +
    idAttr +
    '" title="Open transcript churn research playbook in chat">Research</button>' +
    "</span></div>"
  );
}

function renderTranscriptChurnResearchList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      '<p class="muted">No transcript churn rows (<code>type: transcript_churn</code>, <code>status: research</code>). When they appear, investigate then run <code>synthesize-transcript-churn</code> (see <code>.ai/AGENT-CLI-MAP.md</code>).</p>'
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

function renderProposedExecutionRow(row: { id?: unknown; title?: unknown; phase?: unknown }): string {
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
    renderPhaseAssignButton(id) +
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="proposed-exe-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="proposed-exe-decline" data-task-id="' +
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
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> run <code>run-transition</code> when required.</p>' +
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
          (tid.length > 0
            ? '<span class="dash-row-actions">' +
              renderPhaseAssignButton(tid) +
              '<button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task view (markdown)">View</button>' +
              "</span>"
            : "") +
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
  phaseTrackPrefix: string
): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; phaseKey?: unknown; count?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const phasePhrase = resolvePhasePhraseForCompleteRelease(b);
        const phasePhraseAttr = escapeHtmlAttr(phasePhrase);
        const showRelease = readyPhaseBucketHasTasks(raw);
        const releaseBtn = showRelease
          ? '<button type="button" class="dash-phase-release-btn" data-wc-action="phase-complete-release" data-wc-phase-phrase="' +
            phasePhraseAttr +
            '" title="Open a new chat with a phase closeout prompt">Complete &amp; Release</button>'
          : "";
        const body = renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
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
  phaseTrackPrefix: string
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
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> / <span class="muted">Decline</span> per row. <b>Accept All</b> on a phase heading runs <code>accept</code> for every proposed improvement in that phase (one shared rationale; planning token refreshed between calls).</p>' +
    '<div class="phase-stack">' +
    buckets
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-primary dash-phase-accept-all" data-wc-action="proposed-imp-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed improvement in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedImprovementsList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
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
  phaseTrackPrefix: string
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
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTranscriptChurnResearchList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
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
  phaseTrackPrefix: string
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
    '<p class="muted"><b>Accept All</b> on a phase heading accepts every proposed execution task in that phase (shared rationale).</p>' +
    '<div class="phase-stack">' +
    bucketsPe
      .map((raw, i) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown; taskIds?: unknown };
        const summaryLabel = escapeHtml(String(b.label ?? ""));
        const taskIds = Array.isArray(b.taskIds)
          ? (b.taskIds as unknown[]).map((x) => String(x).trim()).filter((id) => id.length > 0)
          : [];
        const c = typeof b.count === "number" ? b.count : 0;
        const acceptAllBtn =
          c > 0 && taskIds.length > 0
            ? '<button type="button" class="dash-row-action dash-row-action-primary dash-phase-accept-all" data-wc-action="proposed-exe-accept-phase" data-proposed-task-ids="' +
              escapeHtmlAttr(taskIds.join(",")) +
              '" title="Accept every proposed execution task in this phase (shared policy rationale)">Accept All</button>'
            : "";
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedExecutionList(c, b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          '><summary class="phase-bucket-summary">' +
          '<span class="phase-bucket-summary-label">' +
          summaryLabel +
          "</span>" +
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
  phaseTrackPrefix: string
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
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : renderBlockedList(b.top ?? []);
        return (
          '<details class="phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
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
  phaseTrackPrefix: string
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
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket terminal-phase-bucket"' +
          wcTrackAttr(phaseTrackPrefix + "-p" + String(i)) +
          "><summary>" +
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
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-start">Start interview</button>' +
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
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-submit">Submit answer</button> ' +
      '<button type="button" class="dash-row-action-secondary" data-wc-action="planning-wizard-cancel">Cancel</button>' +
      "</p>" +
      "</div>"
    );
  }
  if (panel.kind === "success") {
    const persistenceHint =
      panel.code === "planning-response-ready"
        ? '<p class="muted"><b>Persistence:</b> Response-only — no wishlist row or task was written from this dashboard flow.</p>'
        : panel.code === "planning-wishlist-ready"
          ? '<p class="muted"><b>Persistence:</b> Answers saved; create the wishlist row with <code>build-plan</code> finalize + <code>createWishlist</code> from the CLI or chat when ready.</p>'
          : panel.code === "planning-artifact-created"
            ? '<p class="muted"><b>Persistence:</b> A wishlist intake row was created — refresh the dashboard or use <b>Open wishlist detail</b> from the toast if shown.</p>'
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
      '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-dismiss">Done</button>' +
      "</div>"
    );
  }
  return (
    '<div class="dash-planning-wizard bad" aria-label="Planning interview error">' +
    "<p><b>Interview error</b></p>" +
    "<p>" +
    escapeHtml(panel.message) +
    "</p>" +
    '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-wizard-cancel">Reset</button>' +
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
      "<p class=\"muted\">No interview in progress. Start or resume with <code>workspace-kit run build-plan</code> when you want guided planning; progress is saved automatically under <code>.workspace-kit/planning/</code>.</p>" +
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
      ? '<button type="button" class="dash-new-plan-btn" data-wc-action="planning-resume-chat" data-resume-cli="' +
        escapeHtmlAttr(resumeCli) +
        '" title="Open a new Agent chat with the saved planning resume command">Resume</button>'
      : "") +
    '<button type="button" class="dash-row-action-secondary dash-planning-discard-btn" data-wc-action="planning-discard" title="Discard the saved planning interview">Discard</button>' +
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
      "<p><b>Team assignments</b></p>" +
      '<p class="muted">Team execution data unavailable (kit SQLite below v7 or store not readable).</p>' +
      "</section>"
    );
  }
  if (top.length === 0) {
    return (
      '<section class="dash-card" aria-label="Team execution">' +
      "<p><b>Team assignments</b></p>" +
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
    "<p><b>Team assignments</b> (read-only)</p>" +
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
      "<p><b>Subagent registry</b></p>" +
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
      "<p><b>Subagent registry</b> (read-only)</p>" +
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
    "<p><b>Subagent registry</b> (read-only)</p>" +
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

/** Same leading-digit rule as `dashboard-phase-buckets.ts` `parseWorkspacePhaseKey`. */
function parseDashboardKitPhaseKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const m = String(raw).trim().match(/^(\d+)/);
  return m ? m[1]! : null;
}

/**
 * Ready **execution** tasks in the bucket that matches maintainer `current_kit_phase`
 * (see `readyExecutionSummary.phaseBuckets` from `dashboard-summary`).
 */
function countReadyExecutionTasksInCurrentPhase(
  ws: Record<string, unknown>,
  readyExecutionSummary: Record<string, unknown>
): number {
  const phaseKey = parseDashboardKitPhaseKey(ws.currentKitPhase);
  if (phaseKey === null) {
    return 0;
  }
  const buckets = Array.isArray(readyExecutionSummary.phaseBuckets)
    ? readyExecutionSummary.phaseBuckets
    : [];
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const b = raw as { phaseKey?: unknown; count?: unknown };
    const bk = b.phaseKey;
    if (bk === null || bk === undefined) {
      continue;
    }
    if (String(bk) !== phaseKey) {
      continue;
    }
    const n = b.count;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

const DELIVER_TOOLTIP_NO_READY = "There are no ready to work tasks for this phase.";
const DELIVER_TOOLTIP_NO_PHASE =
  "Current phase is not set or could not be read from the workspace snapshot.";
const DELIVER_TOOLTIP_ENABLED =
  "Prefill chat: deliver a ready task through the phase branch (task-to-phase-branch)";

function renderRoleTemperamentLines(ag: unknown): string {
  if (!ag || typeof ag !== "object") {
    return "";
  }
  const o = ag as Record<string, unknown>;
  const tier = typeof o.tier === "number" ? o.tier : null;
  const roleLabel = typeof o.displayLabel === "string" ? o.displayLabel.trim() : "";
  const tempLabel = typeof o.temperamentLabel === "string" ? o.temperamentLabel.trim() : "";
  const presentation = o.agentPresentation && typeof o.agentPresentation === "object"
    ? (o.agentPresentation as Record<string, unknown>)
    : null;
  const workLog = typeof presentation?.workLog === "string" ? presentation.workLog : "";
  const rationale = typeof presentation?.rationale === "string" ? presentation.rationale : "";
  const detail = typeof presentation?.finalAnswerDetail === "string" ? presentation.finalAnswerDetail : "";
  const presentationLine = workLog || rationale || detail
    ? "<p><b>Presentation:</b> " +
      [workLog ? `Work-log ${workLog}` : "", rationale ? `Rationale ${rationale}` : "", detail ? `Final ${detail}` : ""]
        .filter(Boolean)
        .map((x) => escapeHtml(x))
        .join(" · ") +
      "</p>"
    : "";
  if (tier === null) {
    return "";
  }
  return (
    "<p><b>Role:</b> " +
    escapeHtml(roleLabel.length > 0 ? roleLabel : "—") +
    "</p>" +
    "<p><b>Agent Temperament:</b> " +
    escapeHtml(tempLabel.length > 0 ? tempLabel : "—") +
    "</p>" +
    presentationLine
  );
}

function renderAgentStatusBanner(agentStatus: unknown): string {
  let label = "Awaiting Instruction";
  let kind = "awaiting_instruction";
  if (agentStatus && typeof agentStatus === "object") {
    const row = agentStatus as Record<string, unknown>;
    const rawLabel = typeof row.label === "string" ? row.label.trim() : "";
    const rawKind = typeof row.kind === "string" ? row.kind.trim() : "";
    if (rawLabel.length > 0) {
      label = rawLabel;
    }
    if (rawKind.length > 0) {
      kind = rawKind;
    }
  }
  return (
    '<section class="dash-agent-status-banner" aria-label="WC Agent status" data-agent-status-kind="' +
    escapeHtmlAttr(kind) +
    '">' +
    '<p><b>WC Agent is:</b> <span class="dash-agent-status-label">' +
    escapeHtml(label) +
    "</span></p>" +
    "</section>"
  );
}

function renderEditorIntegrationSection(editorIntegration: unknown): string {
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
    '<section class="dash-card dash-editor-integration" aria-label="Editor integration">' +
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
    "</section>"
  );
}

/** Current / next phase + Deliver chip (no outer section). */
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
      "<p><b>Phase roster</b></p>" +
      '<p class="muted">Optional phase descriptions require planning SQLite <b>v23+</b> (upgrade workspace-kit, reopen DB).</p>' +
      "</section>"
    );
  }
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
      let rows = "";
      for (const r of narrow.rows) {
        const sd = r.shortDescription != null ? String(r.shortDescription).trim() : "";
        const desc = sd.length > 0 ? escapeHtml(sd) : '<span class="muted">—</span>';
        const src = r.inCatalog === true ? "" : ' <span class="muted">(no catalog row)</span>';
        const statusLabel = escapeHtml(phaseRosterStatusLabel(r.status));
        const statusClass =
          r.status === "current"
            ? "dash-phase-roster-status dash-phase-roster-current"
            : r.status === "delivered"
              ? "dash-phase-roster-status dash-phase-roster-delivered"
              : "dash-phase-roster-status dash-phase-roster-future";
        rows +=
          "<tr><td><code>" +
          escapeHtml(r.phaseKey) +
          '</code></td><td><span class="' +
          statusClass +
          '">' +
          statusLabel +
          "</span></td><td>" +
          desc +
          src +
          "</td></tr>";
      }
      inner =
        rows.length > 0
          ? '<table class="dash-phase-catalog-table"><thead><tr><th>Phase</th><th>Status</th><th>Short description</th></tr></thead><tbody>' +
            rows +
            "</tbody></table>"
          : '<p class="muted">No matching roster rows.</p>';
    }
  }
  const table = inner;
  const btn =
    '<p style="margin-top:8px"><button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="register-phase-catalog">Register future phase</button>' +
    ' <span class="muted">Plan a future release phase; the kit keeps planning metadata aligned.</span></p>';
  return (
    '<section class="dash-card dash-phase-catalog" aria-label="Phase catalog">' +
    "<p><b>Phase roster</b></p>" +
    table +
    btn +
    "</section>"
  );
}

function renderPhaseDeliverBlockInner(
  ws: Record<string, unknown>,
  readyExecutionSummary: Record<string, unknown>
): string {
  const curRaw = ws.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  const cur = curRaw.length > 0 ? escapeHtml(curRaw) : "—";
  const nextTrim = ws.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const nextMeaningful = nextTrim.length > 0 && nextTrim !== curRaw;
  const nextDisplay = nextMeaningful ? escapeHtml(nextTrim) : "Not Planned";

  const parsedPhase = parseDashboardKitPhaseKey(ws.currentKitPhase);
  const readyInPhase = countReadyExecutionTasksInCurrentPhase(ws, readyExecutionSummary);
  const deliverEnabled = parsedPhase !== null && readyInPhase > 0;
  const deliverTitle = deliverEnabled
    ? DELIVER_TOOLTIP_ENABLED
    : parsedPhase === null
      ? DELIVER_TOOLTIP_NO_PHASE
      : DELIVER_TOOLTIP_NO_READY;

  const deliverBtn =
    '<button type="button" class="dash-deliver-chip"' +
    (deliverEnabled ? ' data-wc-action="deliver-phase-prompt"' : "") +
    (curRaw.length > 0 ? ' data-wc-kit-phase="' + escapeHtmlAttr(curRaw) + '"' : "") +
    (deliverEnabled ? "" : " disabled") +
    ' title="' +
    escapeHtmlAttr(deliverTitle) +
    '">Deliver</button>';

  return (
    '<p class="dash-overview-phase-row">' +
    '<span class="dash-overview-phase-text"><b>Current Phase</b> ' +
    cur +
    "</span>" +
    deliverBtn +
    "</p>" +
    "<p><b>Next Phase</b> " +
    nextDisplay +
    "</p>"
  );
}

/**
 * First dashboard card: role + temperament when configured, then current/next phase and Deliver.
 */
function renderRoleTemperamentAndPhaseSection(
  ag: unknown,
  ws: Record<string, unknown> | null,
  readyExecutionSummary?: Record<string, unknown>
): string {
  const rt = renderRoleTemperamentLines(ag);
  const phaseInner = ws !== null ? renderPhaseDeliverBlockInner(ws, readyExecutionSummary ?? {}) : "";
  if (rt === "" && phaseInner === "") {
    return "";
  }
  return (
    '<section class="dash-card dash-role-temperament-phase" aria-label="Role, temperament, and phase">' +
    rt +
    phaseInner +
    "</section>"
  );
}

/** Blockers and pending decisions (phase + Deliver live on first card). */
function renderWorkspaceBlockersPendingSection(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return (
      '<section class="dash-card dashboard-overview" aria-label="Workspace status">' +
      '<p class="muted">No workspace status from kit SQLite (<code>get-workspace-status</code>) — run <code>pnpm run wk doctor</code> or ensure planning DB migrated to user_version 10+.</p>' +
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
function renderStatusSectionHtml(d: Record<string, unknown>, ss: Record<string, unknown>): string {
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
    (phaseRaw !== undefined && phaseRaw !== null && phaseRaw !== ""
      ? kvRow("Phase", escapeHtml(String(phaseRaw)))
      : "") +
    (tierRaw ? kvRow("Guidance tier", escapeHtml(tierRaw)) : "") +
    "</div></section>";

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
    "<b>Note:</b> These totals reflect <code>stateSummary</code> (store-wide statuses). " +
    "<b>Overview</b> pills and <b>Task Engine</b> queue sections use execution-queue rollups " +
    "(same family as <code>getNextActions</code>) and exclude <code>wishlist_intake</code> from ready/proposed.</p>" +
    "</section>";

  return workspaceCard + agentCard + planningCard + countsCard;
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
};

const PHASE_NOTE_TYPES_CONVERTIBLE = new Set(["task-suggestion", "follow-up"]);

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
      "<p><b>Phase notes</b></p>" +
      '<p class="muted">Phase journal unavailable: <code>' +
      code +
      "</code> " +
      msg +
      "</p>" +
      "</section>"
    );
  }

  const listData = (listOk ? list.data : {}) as Record<string, unknown>;
  const ctxData = ctxOk ? ((ctx.data ?? {}) as Record<string, unknown>) : {};

  const phaseKey =
    typeof listData.phaseKey === "string"
      ? listData.phaseKey
      : typeof ctxData.phaseKey === "string"
        ? ctxData.phaseKey
        : "—";
  const phaseKeySource = typeof listData.phaseKeySource === "string" ? listData.phaseKeySource : "";
  const notes = Array.isArray(listData.notes) ? (listData.notes as unknown[]) : [];
  const ctxNoteCount = Array.isArray(ctxData.notes) ? ctxData.notes.length : 0;

  let rows = "";
  for (const raw of notes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    const id = typeof n.id === "string" ? n.id : "";
    const summary = typeof n.summary === "string" ? n.summary : "";
    const noteType = typeof n.noteType === "string" ? n.noteType : "";
    const priority = typeof n.priority === "string" ? n.priority : "";
    const status = typeof n.status === "string" ? n.status : "";
    const details = typeof n.details === "string" ? n.details : null;
    const convertedTaskId = typeof n.convertedTaskId === "string" ? n.convertedTaskId : null;

    const dismissBtn =
      status === "active" && id.length > 0
        ? '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="phase-note-dismiss" data-note-id="' +
          escapeHtmlAttr(id) +
          '" data-note-priority="' +
          escapeHtmlAttr(priority) +
          '" title="dismiss-phase-note">Dismiss</button>'
        : "";

    const canConvert =
      status === "active" && id.length > 0 && !convertedTaskId && PHASE_NOTE_TYPES_CONVERTIBLE.has(noteType);

    const convertBtn = canConvert
      ? '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="phase-note-convert" data-note-id="' +
        escapeHtmlAttr(id) +
        '" title="convert-phase-note-to-task">Convert</button>'
      : "";

    const convertedLine =
      convertedTaskId && convertedTaskId.length > 0
        ? '<p class="muted wc-phase-note-converted">Converted → <button type="button" class="dash-row-action dash-row-action-tertiary" data-wc-action="task-detail" data-task-id="' +
          escapeHtmlAttr(convertedTaskId) +
          '">' +
          escapeHtml(convertedTaskId) +
          "</button></p>"
        : "";

    rows +=
      '<div class="dash-row dash-phase-note-row">' +
      '<div class="dash-row-label">' +
      "<b>" +
      escapeHtml(noteType) +
      "</b> · " +
      escapeHtml(priority) +
      (summary ? "<br/>" + escapeHtml(summary) : "") +
      (details
        ? '<span class="muted"><br/>' +
          escapeHtml(details.length > 400 ? `${details.slice(0, 400)}…` : details) +
          "</span>"
        : "") +
      convertedLine +
      "</div>" +
      '<div class="dash-row-actions">' +
      convertBtn +
      dismissBtn +
      "</div>" +
      "</div>";
  }

  const meta =
    '<p class="muted dash-phase-notes-meta">' +
    "<b>Phase key</b> " +
    escapeHtml(phaseKey) +
    (phaseKeySource ? " · " + escapeHtml(phaseKeySource) : "") +
    (ctxOk ? " · <b>Context preview</b> " + String(ctxNoteCount) + " note(s)" : "") +
    "</p>";

  const addBtn =
    '<button type="button" class="dash-row-action dash-row-action-primary" data-wc-action="phase-note-add" title="add-phase-note">Add note</button>';

  const chatBtn =
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="phase-notes-chat" title="Open phase notes chat guide">Chat guide</button>';

  const proposeBtn =
    '<button type="button" class="dash-row-action dash-row-action-secondary" data-wc-action="phase-notes-propose-persist" title="propose-tasks-from-phase-notes persist:true">Persist convertible suggestions</button>';

  const empty = notes.length === 0 ? '<p class="muted">No phase notes listed for this phase (active filter).</p>' : "";

  return (
    '<section class="dash-card dash-phase-notes" aria-label="Phase notes">' +
    "<p><b>Phase notes</b></p>" +
    "<p>Journal entries scoped to the workspace current phase — mutations run through workspace-kit.</p>" +
    meta +
    empty +
    (notes.length > 0 ? '<div class="dash-row-list">' + rows + "</div>" : "") +
    '<div class="dash-phase-notes-actions">' +
    addBtn +
    chatBtn +
    proposeBtn +
    "</div>" +
    "</section>"
  );
}

/** Inner HTML for #root from a `workspace-kit run dashboard-summary`–shaped payload (or extension error object). */
export function renderDashboardRootInnerHtml(
  payload: unknown,
  planningWizardPanel?: PlanningInterviewWizardPanel | null,
  editorIntegration?: EditorIntegrationRenderState | null,
  phaseJournal?: DashboardPhaseJournalBundle | null
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
  let readyImpTop = Array.isArray(ris.top) ? (ris.top as unknown[]) : [];
  let readyExeTop = Array.isArray(res.top) ? (res.top as unknown[]) : [];
  let readyImpCount = typeof ris.count === "number" ? ris.count : readyImpTop.length;
  let readyExeCount = typeof res.count === "number" ? res.count : readyExeTop.length;
  const oldReadyOnly = !("readyImprovementsSummary" in d) && !("readyExecutionSummary" in d);
  if (oldReadyOnly && Array.isArray(d.readyQueueTop) && (d.readyQueueTop as unknown[]).length > 0) {
    readyExeTop = (d.readyQueueTop as unknown[]).slice(0, 15);
    readyExeCount =
      typeof d.readyQueueCount === "number" ? (d.readyQueueCount as number) : readyExeTop.length;
    readyImpTop = [];
    readyImpCount = 0;
  }
  const pis = (d.proposedImprovementsSummary as Record<string, unknown> | undefined) ?? {};
  const piCount = typeof pis.count === "number" ? pis.count : 0;
  const piTop = Array.isArray(pis.top) ? (pis.top as unknown[]) : [];
  const pes = (d.proposedExecutionSummary as Record<string, unknown> | undefined) ?? {};
  const peCount = typeof pes.count === "number" ? pes.count : 0;
  const peTop = Array.isArray(pes.top) ? (pes.top as unknown[]) : [];
  const tcrs = (d.transcriptChurnResearchSummary as Record<string, unknown> | undefined) ?? {};
  const tcrCount = typeof tcrs.count === "number" ? tcrs.count : 0;
  const tcrTop = Array.isArray(tcrs.top) ? (tcrs.top as unknown[]) : [];
  const rqb = d.readyQueueBreakdown as
    | { improvement?: unknown; other?: unknown; schemaVersion?: unknown }
    | undefined;
  const rqbImp = typeof rqb?.improvement === "number" ? rqb.improvement : null;
  const rqbOther = typeof rqb?.other === "number" ? rqb.other : null;
  const breakdownLine =
    rqbImp !== null && rqbOther !== null && rqbImp + rqbOther > 0
      ? '<p class="muted">Ready Queue · ' +
        String(rqbImp) +
        " Improvement" +
        (rqbImp === 1 ? "" : "s") +
        " · " +
        String(rqbOther) +
        " Other</p>"
      : "";

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
          "term-comp"
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
          "term-can"
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
    '<button type="button" class="dash-quick-action-btn" data-wc-action="add-wishlist-item" title="Create a wishlist intake task (same flow as /add-wishlist-item)">Add wishlist item</button>' +
    '<button type="button" class="dash-quick-action-btn" data-wc-action="collaboration-hub" title="Chat + CLI for collaboration profiles; chat does not replace policyApproval">Collaboration profiles</button>' +
    '<button type="button" class="dash-quick-action-btn" data-wc-action="transcript-churn-research-chat" title="Transcript churn research playbook">Research churn</button>' +
    '<button type="button" class="dash-quick-action-btn dash-quick-action-primary" data-wc-action="generate-features-chat" title="New chat with /generate-features as text (same as slash command)">Generate Features</button>' +
    "</div>";

  const tasksBlock =
    '<section class="dash-card dashboard-tasks-block" aria-label="Task queue rollups">' +
    tasksQuickActionsPanel +
    renderFilterChipBar() +
    renderStatusRollup(
      "status-ready-imp",
      "<b>Ready · Improvements</b> (" + String(readyImpCount) + ")",
      renderReadyPhaseBuckets(ris.phaseBuckets, readyImpTop, "No ready improvements.", "rdy-imp"),
      readyImpCount === 0,
      readyImpCount > 0,
      "ready"
    ) +
    renderStatusRollup(
      "status-ready-exe",
      "<b>Ready · Execution</b> (" + String(readyExeCount) + ")",
      breakdownLine +
        renderExecutionReadyScopeFootnote() +
        renderReadyPhaseBuckets(res.phaseBuckets, readyExeTop, "No ready execution tasks.", "rdy-exe"),
      /* Always render body so execution-queue scope footnote appears even when count is 0. */
      false,
      readyExeCount > 0,
      "ready"
    ) +
    renderStatusRollup(
      "status-prop-imp",
      "<b>Proposed · Improvements</b> (" + String(piCount) + ")",
      renderProposedPhaseBuckets(pis.phaseBuckets, piCount, piTop, "prop-imp"),
      piCount === 0,
      false,
      "proposed"
    ) +
    renderStatusRollup(
      "status-prop-exe",
      "<b>Proposed · Execution</b> (" + String(peCount) + ")",
      renderProposedExecutionPhaseBuckets(pes.phaseBuckets, peCount, peTop, "prop-exe"),
      peCount === 0,
      false,
      "proposed"
    ) +
    renderStatusRollup(
      "status-tc-research",
      "<b>Research · Transcript churn</b> (" + String(tcrCount) + ")",
      renderTranscriptChurnResearchPhaseBuckets(tcrs.phaseBuckets, tcrCount, tcrTop, "tc-churn"),
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
        "blk"
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
  /** Prefer execution → then open wishlist when execution queue is empty → then ready improvements. */
  const recNextCard = readyExeTop[0]
    ? renderRecommendedNextCard(readyExeTop[0], "execution")
    : firstWishlistOpen
      ? renderRecommendedNextWishlistCard(firstWishlistOpen)
      : readyImpTop[0]
        ? renderRecommendedNextCard(readyImpTop[0], "improvement")
        : "";

  const totalReadyCount = readyImpCount + readyExeCount;
  const totalProposedCount = piCount + peCount;
  const totalBlockedCount = Number(blockedSummary.count ?? 0);
  const totalDoneCount =
    typeof (d.completedSummary as Record<string, unknown> | undefined)?.count === "number"
      ? ((d.completedSummary as Record<string, unknown>).count as number)
      : 0;

  const phaseSystemSlice =
    d.systemStatus && typeof d.systemStatus === "object"
      ? ((d.systemStatus as Record<string, unknown>).phase as Record<string, unknown> | undefined)
      : undefined;

  const overviewContent =
    recNextCard +
    renderStatPills(totalReadyCount, totalProposedCount, totalBlockedCount, totalDoneCount) +
    renderEditorIntegrationSection(editorIntegration) +
    renderRoleTemperamentAndPhaseSection(d.agentGuidance, ws as Record<string, unknown> | null, res) +
    renderPhaseCatalogOverviewSection(phaseSystemSlice) +
    renderWorkspaceBlockersPendingSection(ws as Record<string, unknown> | null) +
    renderTeamExecutionSection(d.teamExecution) +
    renderSubagentRegistrySection(d.subagentRegistry);

  const taskEngineContent =
    renderPhaseNotesOverviewSection(phaseJournal ?? null) +
    tasksBlock +
    wishlistSection +
    renderPlanningSession(planningSession, planningWizardPanel);

  const statusContent = renderStatusSectionHtml(d, ss);

  const configContent =
    '<section class="dash-card" aria-label="Config">' +
    "<p><b>Config</b></p>" +
    '<p class="muted">Configuration keys are managed in the <b>Config</b> sidebar panel. ' +
    "Open it via the Workflow Cannon activity bar, or run <code>wk config</code> from the terminal.</p>" +
    '<p class="muted">Common keys: <code>kit.agentGuidance</code> · <code>kit.currentPhase</code> · ' +
    "<code>kit.agentRole</code> · <code>kit.planningGenerationPolicy</code></p>" +
    "</section>";

  const caeContent = renderCaePhaseReadinessContent(
    ws as Record<string, unknown> | null,
    readyExeCount,
    readyImpCount,
    totalBlockedCount,
    totalProposedCount,
    d.agentGuidance
  );

  // ── Tab shell ──────────────────────────────────────────────────────────────

  return (
    '<div class="wc-dashboard-tab-shell">' +
    renderAgentStatusBanner(d.agentStatus) +
    '<div class="wc-tab-bar" role="tablist">' +
    '<button type="button" class="wc-tab-btn wc-tab-active" role="tab" data-wc-tab="overview">Overview</button>' +
    '<button type="button" class="wc-tab-btn" role="tab" data-wc-tab="task-engine">Task Engine' +
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
    '<div class="wc-tab-panel" data-wc-tab="cae" role="tabpanel" style="display:none">' + caeContent + "</div>" +
    "</div>"
  );
}
