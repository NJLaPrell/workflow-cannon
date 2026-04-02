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

function renderReadyList(items: unknown, emptyMessage = "No ready tasks."): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">' + escapeHtml(emptyMessage) + "</p>";
  }
  return (
    "<pre>" +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; priority?: unknown };
        const pri = row?.priority ? " [" + escapeHtml(String(row.priority)) + "]" : "";
        return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? "")) + pri;
      })
      .join("\n") +
    "</pre>"
  );
}

function renderWishlistOpenList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No open wishlist items.</p>';
  }
  return (
    '<p class="muted"><b>Open wishlist preview</b></p><pre>' +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown };
        return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? ""));
      })
      .join("\n") +
    "</pre>"
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
    "<pre>" +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; phase?: unknown };
        const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
        return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? "")) + ph;
      })
      .join("\n") +
    "</pre>"
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
    "<pre>" +
    items
      .map((x) => {
        const row = x as { id?: unknown; title?: unknown; phase?: unknown };
        const ph = row?.phase != null && String(row.phase).length > 0 ? " · " + escapeHtml(String(row.phase)) : "";
        return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? "")) + ph;
      })
      .join("\n") +
    "</pre>"
  );
}

function renderBlockedList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No blocked tasks.</p>';
  }
  return (
    "<pre>" +
    items
      .map((x) => {
        const row = x as { taskId?: unknown; blockedBy?: unknown };
        const deps = Array.isArray(row?.blockedBy) ? (row.blockedBy as string[]).join(", ") : "";
        return "- " + escapeHtml(String(row?.taskId ?? "")) + " blocked by " + escapeHtml(deps);
      })
      .join("\n") +
    "</pre>"
  );
}

/**
 * When `dashboard-summary` includes `phaseBuckets`, mirror the Tasks tree: one `<details>` per phase with full counts in the summary line.
 */
function renderReadyPhaseBuckets(phaseBuckets: unknown, fallbackTop: unknown, emptyMessage: string): string {
  if (!Array.isArray(phaseBuckets) || phaseBuckets.length === 0) {
    return renderReadyList(fallbackTop, emptyMessage);
  }
  return (
    '<div class="phase-stack">' +
    phaseBuckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const body = renderReadyList(b.top ?? [], "No tasks in this phase.");
        return '<details open class="phase-bucket"><summary>' + summary + "</summary>" + body + "</details>";
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
  if (!Array.isArray(phaseBuckets) || phaseBuckets.length === 0) {
    return renderProposedImprovementsList(totalCount, fallbackTop);
  }
  const sumCounts = phaseBuckets.reduce((acc, x) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCounts < totalCount
      ? '<p class="muted">Preview capped per phase · see Tasks view or <code>list-tasks</code> for full lists.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    phaseBuckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedImprovementsList(c, b.top ?? []);
        return '<details open class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
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
  if (!Array.isArray(phaseBuckets) || phaseBuckets.length === 0) {
    return renderProposedExecutionList(totalCount, fallbackTop);
  }
  const sumCountsPe = phaseBuckets.reduce((acc, x) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumCountsPe < totalCount
      ? '<p class="muted">Preview capped per phase · see Tasks view or <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    phaseBuckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderProposedExecutionList(c, b.top ?? []);
        return '<details open class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
      })
      .join("") +
    "</div>"
  );
}

function renderBlockedPhaseBuckets(phaseBuckets: unknown, fallbackTop: unknown, totalBlocked: number): string {
  if (!Array.isArray(phaseBuckets) || phaseBuckets.length === 0) {
    return renderBlockedList(fallbackTop);
  }
  const sumBlocked = phaseBuckets.reduce((acc, x) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sumBlocked < totalBlocked
      ? '<p class="muted">Preview capped per phase · full list in Tasks or <code>get-next-actions</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    phaseBuckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No blocked tasks in this phase.</p>'
            : renderBlockedList(b.top ?? []);
        return '<details open class="phase-bucket"><summary>' + summary + "</summary>" + inner + "</details>";
      })
      .join("") +
    "</div>"
  );
}

/**
 * Terminal statuses (completed / cancelled): same phase-bucket shape as ready/proposed, but `<details>` stay **closed** until expanded (matches Tasks tree defaults).
 */
function renderTerminalTaskPhaseBuckets(
  phaseBuckets: unknown,
  fallbackTop: unknown,
  totalInStatus: number,
  emptyMessage: string
): string {
  if (!Array.isArray(phaseBuckets) || phaseBuckets.length === 0) {
    return renderReadyList(fallbackTop, emptyMessage);
  }
  const sum = phaseBuckets.reduce((acc, x) => {
    const c = (x as { count?: unknown }).count;
    return acc + (typeof c === "number" ? c : 0);
  }, 0);
  const more =
    sum < totalInStatus
      ? '<p class="muted">Preview capped per phase · full list in Tasks or <code>list-tasks</code>.</p>'
      : "";
  return (
    more +
    '<div class="phase-stack">' +
    phaseBuckets
      .map((raw) => {
        const b = raw as { label?: unknown; top?: unknown; count?: unknown };
        const summary = escapeHtml(String(b.label ?? ""));
        const c = typeof b.count === "number" ? b.count : 0;
        const inner =
          c === 0
            ? '<p class="muted">No tasks in this phase.</p>'
            : renderReadyList(b.top ?? [], "No tasks in this phase.");
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
      '<section class="planning-card" aria-label="Planning session">' +
      "<p><b>Planning session</b></p>" +
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
    '<section class="planning-card" aria-label="Planning session resume">' +
    "<p><b>Planning session</b> " +
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

const MAX_OVERVIEW_ACTION_CHARS = 220;

function truncateOverviewLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) {
    return one;
  }
  return one.slice(0, Math.max(1, max - 1)) + "…";
}

/**
 * Brief maintainer snapshot: phases + status date + blockers / decisions / first next action.
 * Does not repeat task roll-ups (those stay under **Tasks**).
 */
function renderWorkspaceOverviewSection(ws: Record<string, unknown> | null): string {
  if (!ws) {
    return (
      '<section class="dashboard-overview" aria-label="Workspace status">' +
      '<p class="muted">No <code>docs/maintainers/data/workspace-kit-status.yaml</code> snapshot (or file not readable).</p>' +
      "</section>"
    );
  }

  const curRaw = ws.currentKitPhase != null ? String(ws.currentKitPhase).trim() : "";
  const cur = curRaw.length > 0 ? escapeHtml(curRaw) : "—";
  const nextTrim = ws.nextKitPhase != null ? String(ws.nextKitPhase).trim() : "";
  const hasNext = nextTrim.length > 0;

  let html =
    '<section class="dashboard-overview" aria-label="Workspace status">' +
    "<p><b>Current phase</b> " +
    cur +
    "</p>";
  if (hasNext) {
    html += "<p><b>Next phase</b> " + escapeHtml(nextTrim) + "</p>";
  }

  const lu = ws.lastUpdated != null ? String(ws.lastUpdated).trim() : "";
  if (lu.length > 0) {
    html += '<p class="muted">Status file · ' + escapeHtml(lu) + "</p>";
  }

  const blockers = Array.isArray(ws.blockers)
    ? (ws.blockers as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (blockers.length > 0) {
    const shown = blockers.slice(0, 2).map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more =
      blockers.length > 2
        ? ' <span class="muted">(+' + String(blockers.length - 2) + " more)</span>"
        : "";
    html += "<p><b>Blockers</b> " + shown.join(" · ") + more + "</p>";
  }

  const pending = Array.isArray(ws.pendingDecisions)
    ? (ws.pendingDecisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (pending.length > 0) {
    const shown = pending.slice(0, 2).map((b) => renderMarkdownBoldAfterEscape(escapeHtml(truncateOverviewLine(b, 100))));
    const more = pending.length > 2 ? " …" : "";
    html += "<p><b>Pending decisions</b> " + shown.join(" · ") + more + "</p>";
  }

  const actions = Array.isArray(ws.nextAgentActions)
    ? (ws.nextAgentActions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];
  if (actions.length > 0) {
    const t = truncateOverviewLine(actions[0], MAX_OVERVIEW_ACTION_CHARS);
    const more =
      actions.length > 1
        ? ' <span class="muted">(+' + String(actions.length - 1) + " in file)</span>"
        : "";
    html +=
      '<p class="muted"><b>Next action</b> ' + renderMarkdownBoldAfterEscape(escapeHtml(t)) + more + "</p>";
  }

  html += "</section>";
  return html;
}

/** Dependency subgraph + critical path from `dashboard-summary` `dependencyOverview` (text / Mermaid source only). */
function renderDependencyOverviewHtml(dep: unknown): string {
  if (dep === null || dep === undefined || typeof dep !== "object") {
    return (
      '<section class="dependency-overview" aria-label="Dependency overview">' +
      '<p class="muted"><b>Dependency overview</b> — no data.</p>' +
      "</section>"
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
      ? "<p><b>Critical path (ready frontier)</b> " + escapeHtml(path.join(" → ")) + "</p>"
      : '<p class="muted"><b>Critical path (ready frontier)</b> — none (no ready tasks in the subgraph).</p>';
  const mermaid = typeof d.mermaidFlowchart === "string" ? d.mermaidFlowchart : "";
  const mermaidBlock =
    mermaid.length > 0
      ? '<p class="muted"><b>Mermaid</b> (source — not auto-rendered in this panel)</p><pre class="mermaid-src" aria-label="Mermaid dependency graph">' +
        escapeHtml(mermaid) +
        "</pre>"
      : '<p class="muted"><b>Mermaid</b> — omitted when edge count is very high; use <code>get-dependency-graph</code> for tooling.</p>';
  const truncNote = truncated ? '<p class="muted">Truncated subgraph for large queues (N&gt;50 active tasks).</p>' : "";
  return (
    '<section class="dependency-overview" aria-label="Dependency overview">' +
    "<p><b>Dependency overview</b> · " +
    escapeHtml(String(included)) +
    " / " +
    escapeHtml(String(active)) +
    " tasks · " +
    escapeHtml(String(edgeCount)) +
    " edges</p>" +
    perf +
    truncNote +
    pathLine +
    mermaidBlock +
    '<p class="muted a11y-note">No interactive diagram — text and Mermaid source only (screen-reader friendly lists).</p>' +
    "</section>"
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
  const sn = d.suggestedNext as { id?: unknown; title?: unknown } | null | undefined;
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
      ? "<p class=\"muted\">Ready queue · " +
        String(rqbImp) +
        " improvement" +
        (rqbImp === 1 ? "" : "s") +
        " · " +
        String(rqbOther) +
        " other</p>"
      : "";

  return (
    renderWorkspaceOverviewSection(ws as Record<string, unknown> | null) +
    "<p><b>Tasks</b></p>" +
    "<p class=\"ok\">Counts · proposed " +
    String(ss.proposed ?? 0) +
    " · ready " +
    String(ss.ready ?? 0) +
    " · in progress " +
    String(ss.in_progress ?? 0) +
    " · blocked " +
    String(ss.blocked ?? 0) +
    " · done " +
    String(ss.completed ?? 0) +
    "</p>" +
    "<p><b>Ready · improvements</b> (" +
    String(readyImpCount) +
    ") — same store as execution queue; triage via accept → <code>ready</code></p>" +
    renderReadyPhaseBuckets(ris.phaseBuckets, readyImpTop, "No ready improvements.") +
    "<p><b>Ready · execution</b> (" +
    String(readyExeCount) +
    ")</p>" +
    breakdownLine +
    renderReadyPhaseBuckets(res.phaseBuckets, readyExeTop, "No ready execution tasks.") +
    "<p><b>Proposed · improvements</b> (backlog until accepted) · " +
    String(piCount) +
    "</p>" +
    renderProposedPhaseBuckets(pis.phaseBuckets, piCount, piTop) +
    "<p><b>Proposed · execution</b> (workspace-kit tasks awaiting promote) · " +
    String(peCount) +
    "</p>" +
    renderProposedExecutionPhaseBuckets(pes.phaseBuckets, peCount, peTop) +
    "<p><b>Blocked</b> " +
    String(blockedSummary.count ?? 0) +
    "</p>" +
    renderBlockedPhaseBuckets(blockedSummary.phaseBuckets, blockedTop, Number(blockedSummary.count ?? 0)) +
    (() => {
      const cs = d.completedSummary as Record<string, unknown> | undefined;
      const ks = d.cancelledSummary as Record<string, unknown> | undefined;
      if (!cs && !ks) {
        return "";
      }
      const compCount = typeof cs?.count === "number" ? cs.count : 0;
      const cancCount = typeof ks?.count === "number" ? ks.count : 0;
      const compTop = Array.isArray(cs?.top) ? (cs!.top as unknown[]).slice(0, 15) : [];
      const cancTop = Array.isArray(ks?.top) ? (ks!.top as unknown[]).slice(0, 15) : [];
      return (
        '<section class="dashboard-terminal-tasks" aria-label="Completed and cancelled tasks">' +
        "<p><b>Completed</b> (" +
        String(compCount) +
        ") — terminal · collapsed until expanded (same phase buckets as Tasks tree)</p>" +
        renderTerminalTaskPhaseBuckets(cs?.phaseBuckets, compTop, compCount, "No completed tasks.") +
        "<p><b>Cancelled</b> (" +
        String(cancCount) +
        ")</p>" +
        renderTerminalTaskPhaseBuckets(ks?.phaseBuckets, cancTop, cancCount, "No cancelled tasks.") +
        "</section>"
      );
    })() +
    "<p><b>Wishlist</b> · open " +
    String(wishlist.openCount ?? 0) +
    " / total " +
    String(wishlist.totalCount ?? 0) +
    "</p>" +
    renderWishlistOpenList(wishlistOpenTop) +
    "<p><b>Suggested next</b> (highest-priority ready, any type) " +
    (sn && (sn.id != null || sn.title != null)
      ? escapeHtml(String(sn.id ?? "") + " — " + String(sn.title ?? ""))
      : '<span class="muted">— none · promote tasks to <code>ready</code> or complete triage (<code>improvement</code> → accept)</span>') +
    "</p>" +
    renderDependencyOverviewHtml(d.dependencyOverview) +
    renderPlanningSession(planningSession) +
    '<p class="muted">Store updated ' +
    escapeHtml(String(d.taskStoreLastUpdated ?? "")) +
    "</p>"
  );
}
