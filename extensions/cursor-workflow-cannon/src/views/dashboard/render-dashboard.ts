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

function renderPlanningSession(ps: unknown): string {
  if (!ps || typeof ps !== "object") {
    return '<p class="muted"><b>Planning session</b> —</p>';
  }
  const o = ps as Record<string, unknown>;
  const pct = typeof o.completionPct === "number" ? o.completionPct : "—";
  return (
    "<p><b>Planning session</b> " +
    escapeHtml(String(o.planningType ?? "")) +
    " · " +
    escapeHtml(String(o.status ?? "")) +
    " · " +
    pct +
    "% critical</p>" +
    '<pre class="muted">' +
    escapeHtml(String(o.resumeCli ?? "")) +
    "</pre>"
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
    "<p><b>Current phase</b> " +
    escapeHtml(String(ws?.currentKitPhase ?? "—")) +
    "</p>" +
    "<p><b>Next phase</b> " +
    escapeHtml(String(ws?.nextKitPhase ?? "—")) +
    "</p>" +
    '<p class="muted focus-md">' +
    renderActiveFocusHtml(String(ws?.activeFocus ?? "")) +
    "</p>" +
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
    renderReadyList(readyImpTop, "No ready improvements.") +
    "<p><b>Ready · execution</b> (" +
    String(readyExeCount) +
    ")</p>" +
    breakdownLine +
    renderReadyList(readyExeTop, "No ready execution tasks.") +
    "<p><b>Proposed · improvements</b> (backlog until accepted) · " +
    String(piCount) +
    "</p>" +
    renderProposedImprovementsList(piCount, piTop) +
    "<p><b>Proposed · execution</b> (workspace-kit tasks awaiting promote) · " +
    String(peCount) +
    "</p>" +
    renderProposedExecutionList(peCount, peTop) +
    "<p><b>Blocked</b> " +
    String(blockedSummary.count ?? 0) +
    "</p>" +
    renderBlockedList(blockedTop) +
    "<p><b>Wishlist</b> (W### — ideation; convert to tasks for the queue) · open " +
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
    renderPlanningSession(planningSession) +
    '<p class="muted">Store updated ' +
    escapeHtml(String(d.taskStoreLastUpdated ?? "")) +
    "</p>"
  );
}
