/**
 * Pure dashboard HTML generation — unit-tested; applied in the webview via postMessage { html } from the host.
 */

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape first, then turn paired `**segments**` into `<b>…</b>` (safe for webview HTML). */
export function renderMarkdownBoldAfterEscape(escapedPlain: string): string {
  return escapedPlain.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

export function renderActiveFocusHtml(raw: string): string {
  return renderMarkdownBoldAfterEscape(escapeHtml(raw));
}

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
            ? '<button type="button" class="dash-row-action" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task detail (markdown)">Detail</button>'
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
    '<p class="muted"><b>Open Wishlist Preview</b> · <span class="muted">Chat</span> prefills Cursor with the intake playbook prompt.</p>' +
    '<div class="dash-row-list" role="list">' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown };
        const id = String(row?.id ?? "").trim();
        const title = escapeHtml(String(row?.title ?? ""));
        const label = escapeHtml(id) + (id ? " " : "") + title;
        const idAttr = escapeHtml(id);
        return (
          '<div class="dash-row" role="listitem">' +
          '<span class="dash-row-label">- ' +
          label +
          "</span>" +
          '<button type="button" class="dash-row-action" data-wc-action="wishlist-chat" data-wishlist-id="' +
          idAttr +
          '" title="Prefill Cursor chat with wishlist intake playbook (this item)">Chat</button>' +
          "</div>"
        );
      })
      .join("") +
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
    '<button type="button" class="dash-row-action" data-wc-action="proposed-imp-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
    "</div>"
  );
}

function renderProposedImprovementsList(count: number, items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">No proposed improvements (<code>type: improvement</code> or <code>imp-*</code> + <code>status: proposed</code>). Run <code>generate-recommendations</code> / accept triage per playbook. Confirm: <code>workspace-kit run list-tasks '{}'</code>.</p>`;
  }
  const more =
    count > items.length
      ? '<p class="muted">Showing ' + String(items.length) + " of " + String(count) + " · Tasks sidebar <b>Improvements</b> or <code>list-tasks</code>.</p>"
      : "";
  return (
    more +
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> runs <code>run-transition</code> (modal rationale + planning token when required).</p>' +
    '<div class="dash-row-list" role="list">' +
    items.map((x) => renderProposedImprovementRow(x as { id?: unknown; title?: unknown; phase?: unknown })).join("") +
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
    '<button type="button" class="dash-row-action" data-wc-action="proposed-exe-accept" data-task-id="' +
    idAttr +
    '" title="Accept → ready (confirms policy rationale)">Accept</button>' +
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
    '<p class="muted"><b>Row actions</b> · <span class="muted">Accept</span> runs <code>run-transition</code> when required.</p>' +
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
            ? '<button type="button" class="dash-row-action" data-wc-action="task-detail" data-task-id="' +
              idAttr +
              '" title="Open task detail (markdown)">Detail</button>'
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

/**
 * When `dashboard-summary` includes `phaseBuckets`, one `<details>` per phase (closed until expanded).
 */
function renderReadyPhaseBuckets(phaseBuckets: unknown, fallbackTop: unknown, emptyMessage: string): string {
  const buckets = phaseBucketsNonEmpty(phaseBuckets);
  if (buckets.length === 0) {
    return renderTaskRowList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    buckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const body = renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return '<details class="phase-bucket"><summary>' + summary + "</summary>" + body + "</details>";
      })
      .join("") +
    "</div>"
  );
}

function renderProposedPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown
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
    '<div class="phase-stack">' +
    buckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedImprovementsList(c, b.top ?? []);
        return '<details class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
      })
      .join("") +
    "</div>"
  );
}

/** Proposed execution uses the same row shape as improvements for phase bodies. */
function renderProposedExecutionPhaseBuckets(
  phaseBuckets: unknown,
  totalCount: number,
  fallbackTop: unknown
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
    '<div class="phase-stack">' +
    bucketsPe
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedExecutionList(c, b.top ?? []);
        return '<details class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
      })
      .join("") +
    "</div>"
  );
}

function renderBlockedPhaseBuckets(phaseBuckets: unknown, fallbackTop: unknown, totalBlocked: number): string {
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
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : renderBlockedList(b.top ?? []);
        return '<details class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
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
  emptyMessage: string
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
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderTaskRowList(b.top ?? [], "No tasks in this phase.");
        return (
          '<details class="phase-bucket terminal-phase-bucket"><summary>' +
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

function renderPlanningSession(ps: unknown): string {
  if (!ps || typeof ps !== "object") {
    return (
      '<section class="dash-card" aria-label="Planning session">' +
      "<p><b>Planning Session</b></p>" +
      '<p class="muted">No in-flight <code>build-plan</code> snapshot. When <code>.workspace-kit/planning/build-plan-session.json</code> exists, this card shows progress and a resume command.</p>' +
      '<p class="muted"><b>Stale</b> — When the interview completes or the session file is removed, this card clears until a new session starts (use Refresh).</p>' +
      "</section>"
    );
  }
  const o = ps as Record<string, unknown>;
  const pct = typeof o.completionPct === "number" ? String(o.completionPct) : "—";
  const crit =
    typeof o.answeredCritical === "number" && typeof o.totalCritical === "number"
      ? escapeHtml(String(o.answeredCritical)) +
        " / " +
        escapeHtml(String(o.totalCritical)) +
        " critical answered"
      : "";
  return (
    '<section class="dash-card" aria-label="Planning session resume">' +
    "<p><b>Planning Session</b> " +
    escapeHtml(String(o.planningType ?? "")) +
    " · " +
    escapeHtml(String(o.status ?? "")) +
    "</p>" +
    "<p>" +
    escapeHtml(pct) +
    "% critical complete" +
    (crit ? " · " + crit : "") +
    "</p>" +
    '<p class="muted">Updated ' +
    escapeHtml(String(o.updatedAt ?? "—")) +
    "</p>" +
    "<p><b>Resume</b> (shell):</p>" +
    '<pre class="resume-cli">' +
    escapeHtml(String(o.resumeCli ?? "")) +
    "</pre>" +
    '<p class="muted"><b>Stale</b> — Completing or discarding the interview removes this block on refresh.</p>' +
    "</section>"
  );
}

/** 3-column grid of status counts with right-aligned tabular numbers. */
function buildDashboardStateCountGridHtml(ss: Record<string, unknown>): string {
  const order: [string, string][] = [
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
          '</span><span class="dash-count-num ok">' +
          escapeHtml(String(c.n)) +
          "</span></div>"
      )
      .join("") +
    "</div>"
  );
}

function renderAgentGuidanceSection(ag: unknown): string {
  if (!ag || typeof ag !== "object") {
    return "";
  }
  const o = ag as Record<string, unknown>;
  const tier = typeof o.tier === "number" ? o.tier : null;
  const label = typeof o.displayLabel === "string" ? o.displayLabel.trim() : "";
  if (tier === null) {
    return "";
  }
  return (
    '<section class="dash-card" aria-label="Collaboration roles">' +
    "<p><b>You:</b> Maintainer</p>" +
    "<p><b>Me:</b> " +
    escapeHtml(label.length > 0 ? label : "—") +
    "</p>" +
    "</section>"
  );
}

function truncateOverviewLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) {
    return one;
  }
  return one.slice(0, Math.max(1, max - 1)) + "…";
}

/** Maintainer snapshot: phases, blockers, pending decisions (no task roll-ups). */
function renderWorkspaceOverviewSection(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return (
      '<section class="dash-card dashboard-overview" aria-label="Workspace status">' +
      '<p class="muted">No <code>docs/maintainers/data/workspace-kit-status.yaml</code> snapshot (or file not readable).</p>' +
      "</section>"
    );
  }

  const curRaw = ws.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  const cur = curRaw.length > 0 ? escapeHtml(curRaw) : "—";
  const nextTrim = ws.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const nextMeaningful = nextTrim.length > 0 && nextTrim !== curRaw;
  const nextDisplay = nextMeaningful ? escapeHtml(nextTrim) : "Not Planned";

  let html =
    '<section class="dash-card dashboard-overview" aria-label="Workspace status">' +
    "<p><b>Current Phase</b> " +
    cur +
    "</p>" +
    "<p><b>Next Phase</b> " +
    nextDisplay +
    "</p>";

  const blockers = Array.isArray(ws.blockers)
    ? (ws.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (blockers.length > 0) {
    const shown = blockers.slice(0, 2).map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more =
      blockers.length > 2
        ? " <span class=\"muted\">(+" + String(blockers.length - 2) + " more)</span>"
        : "";
    html += "<p><b>Blockers</b> " + shown.join(" · ") + more + "</p>";
  }

  const pending = Array.isArray(ws.pendingDecisions)
    ? (ws.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (pending.length > 0) {
    const shown = pending.slice(0, 2).map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more = pending.length > 2 ? " …" : "";
    html += "<p><b>Pending Decisions</b> " + shown.join(" · ") + more + "</p>";
  }

  html += "</section>";
  return html;
}

/** Dependency subgraph summary + critical path (no raw Mermaid — webview does not render diagrams). */
function renderDependencyOverviewHtml(dep: unknown): string {
  if (dep === null || dep === undefined || typeof dep !== "object") {
    return (
      '<section class="dash-card dependency-overview" aria-label="Dependency overview">' +
      '<details class="status-section">' +
      "<summary><b>Dependency Overview</b> — No Data</summary>" +
      '<div class="status-section-body">' +
      '<p class="muted">No dependency subgraph in this summary.</p>' +
      "</div></details></section>"
    );
  }
  const d = dep as Record<string, unknown>;
  const active = typeof d.activeTaskCount === "number" ? d.activeTaskCount : "—";
  const included = typeof d.includedTaskCount === "number" ? d.includedTaskCount : "—";
  const edgeCount = typeof d.edgeCount === "number" ? d.edgeCount : "—";
  const truncated = d.truncated === true;
  const perf =
    typeof d.perfNote === "string" && d.perfNote.length > 0
      ? '<p class="muted">' + escapeHtml(d.perfNote) + "</p>"
      : "";
  const path = Array.isArray(d.criticalPathReady)
    ? (d.criticalPathReady as unknown[]).map((x) => String(x))
    : [];
  const pathLine =
    path.length > 0
      ? "<p><b>Critical Path (Ready Frontier)</b> " + escapeHtml(path.join(" → ")) + "</p>"
      : '<p class="muted"><b>Critical Path (Ready Frontier)</b> — None (no ready tasks in the subgraph).</p>';
  const truncNote = truncated ? '<p class="muted">Truncated subgraph for large queues (N&gt;50 active tasks).</p>' : "";
  const summaryLine =
    "<b>Dependency Overview</b> · " +
    escapeHtml(String(included)) +
    " / " +
    escapeHtml(String(active)) +
    " Tasks · " +
    escapeHtml(String(edgeCount)) +
    " Edges";
  const body =
    perf +
    truncNote +
    pathLine +
    '<p class="muted a11y-note">Graph diagram is not rendered here — use <code>workspace-kit run get-dependency-graph</code> for Mermaid or tooling.</p>';
  return (
    '<section class="dash-card dependency-overview" aria-label="Dependency overview">' +
    '<details class="status-section">' +
    "<summary>" +
    summaryLine +
    "</summary>" +
    '<div class="status-section-body">' +
    body +
    "</div></details></section>"
  );
}

/** Closed-by-default roll-up for a dashboard status band (ready / proposed / blocked / terminal). */
function renderStatusRollup(summaryInnerHtml: string, bodyHtml: string, emptyOnly?: boolean): string {
  const body = emptyOnly ? '<p class="muted">No Items</p>' : bodyHtml;
  return (
    '<details class="status-section">' +
    "<summary>" +
    summaryInnerHtml +
    "</summary>" +
    '<div class="status-section-body">' +
    body +
    "</div>" +
    "</details>"
  );
}

/** Inner HTML for #root from a `workspace-kit run dashboard-summary`–shaped payload (or extension error object). */
export function renderDashboardRootInnerHtml(payload: unknown): string {
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
        "<b>Completed</b> (" + String(compCount) + ")",
        renderTerminalTaskPhaseBuckets(cs?.phaseBuckets, compTop, compCount, "No completed tasks."),
        compCount === 0
      ) +
      renderStatusRollup(
        "<b>Cancelled</b> (" + String(cancCount) + ")",
        renderTerminalTaskPhaseBuckets(ks?.phaseBuckets, cancTop, cancCount, "No cancelled tasks."),
        cancCount === 0
      );
    return (
      '<section class="dashboard-terminal-tasks" aria-label="Completed and cancelled tasks">' + inner + "</section>"
    );
  })();

  const tasksBlock =
    '<section class="dash-card dashboard-tasks-block" aria-label="Task queue rollups">' +
    "<p><b>Tasks</b></p>" +
    buildDashboardStateCountGridHtml(ss) +
    renderStatusRollup(
      "<b>Ready · Improvements</b> (" + String(readyImpCount) + ")",
      renderReadyPhaseBuckets(ris.phaseBuckets, readyImpTop, "No ready improvements."),
      readyImpCount === 0
    ) +
    renderStatusRollup(
      "<b>Ready · Execution</b> (" + String(readyExeCount) + ")",
      breakdownLine + renderReadyPhaseBuckets(res.phaseBuckets, readyExeTop, "No ready execution tasks."),
      readyExeCount === 0
    ) +
    renderStatusRollup(
      "<b>Proposed · Improvements</b> (" + String(piCount) + ")",
      renderProposedPhaseBuckets(pis.phaseBuckets, piCount, piTop),
      piCount === 0
    ) +
    renderStatusRollup(
      "<b>Proposed · Execution</b> (" + String(peCount) + ")",
      renderProposedExecutionPhaseBuckets(pes.phaseBuckets, peCount, peTop),
      peCount === 0
    ) +
    renderStatusRollup(
      "<b>Blocked</b> (" + String(Number(blockedSummary.count ?? 0)) + ")",
      renderBlockedPhaseBuckets(
        blockedSummary.phaseBuckets,
        blockedTop,
        Number(blockedSummary.count ?? 0)
      ),
      Number(blockedSummary.count ?? 0) === 0
    ) +
    terminalSection +
    "</section>";

  const wishOpen = Number(wishlist.openCount ?? 0);
  const wishTotal = Number(wishlist.totalCount ?? 0);
  const wishlistSection =
    '<section class="dash-card" aria-label="Wishlist">' +
    '<details class="status-section">' +
    "<summary><b>Wishlist</b> · Open " +
    String(wishOpen) +
    " / Total " +
    String(wishTotal) +
    "</summary>" +
    '<div class="status-section-body">' +
    (wishOpen === 0 ? '<p class="muted">No Items</p>' : renderWishlistOpenList(wishlistOpenTop)) +
    "</div></details></section>";

  const storeSection =
    '<section class="dash-card dash-store-meta" aria-label="Task store">' +
    '<p class="muted">Store Updated ' +
    escapeHtml(String(d.taskStoreLastUpdated ?? "")) +
    "</p>" +
    "</section>";

  return (
    renderAgentGuidanceSection(d.agentGuidance) +
    renderWorkspaceOverviewSection(ws as Record<string, unknown> | null) +
    tasksBlock +
    wishlistSection +
    renderDependencyOverviewHtml(d.dependencyOverview) +
    renderPlanningSession(planningSession) +
    storeSection
  );
}
