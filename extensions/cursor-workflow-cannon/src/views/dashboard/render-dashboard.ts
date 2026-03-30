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

function renderReadyList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">No ready tasks.</p>';
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
  const blockedTop = Array.isArray(blockedSummary.top) ? (blockedSummary.top as unknown[]).slice(0, 3) : [];
  const readyTop = Array.isArray(d.readyQueueTop) ? (d.readyQueueTop as unknown[]).slice(0, 3) : [];

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
    "<p class=\"ok\">Tasks · proposed " +
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
    "<p><b>Wishlist</b> (W### — ideation; not in ready queue until converted to tasks) · open " +
    String(wishlist.openCount ?? 0) +
    " / total " +
    String(wishlist.totalCount ?? 0) +
    "</p>" +
    renderWishlistOpenList(wishlistOpenTop) +
    "<p><b>Blocked</b> " +
    String(blockedSummary.count ?? 0) +
    "</p>" +
    renderBlockedList(blockedTop) +
    "<p><b>Ready preview</b> " +
    String(d.readyQueueCount ?? 0) +
    "</p>" +
    renderReadyList(readyTop) +
    "<p><b>Suggested next</b> " +
    (sn && (sn.id != null || sn.title != null)
      ? escapeHtml(String(sn.id ?? "") + " — " + String(sn.title ?? ""))
      : "—") +
    "</p>" +
    renderPlanningSession(planningSession) +
    '<p class="muted">Store updated ' +
    escapeHtml(String(d.taskStoreLastUpdated ?? "")) +
    "</p>"
  );
}
