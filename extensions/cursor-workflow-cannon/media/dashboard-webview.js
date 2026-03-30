"use strict";
(() => {
  // src/views/dashboard/render-dashboard.ts
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderReadyList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="muted">No ready tasks.</p>';
    }
    return "<pre>" + items.map((x) => {
      const row = x;
      const pri = row?.priority ? " [" + escapeHtml(String(row.priority)) + "]" : "";
      return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? "")) + pri;
    }).join("\n") + "</pre>";
  }
  function renderWishlistOpenList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="muted">No open wishlist items.</p>';
    }
    return '<p class="muted"><b>Open wishlist preview</b></p><pre>' + items.map((x) => {
      const row = x;
      return "- " + escapeHtml(String(row?.id ?? "")) + " " + escapeHtml(String(row?.title ?? ""));
    }).join("\n") + "</pre>";
  }
  function renderBlockedList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="muted">No blocked tasks.</p>';
    }
    return "<pre>" + items.map((x) => {
      const row = x;
      const deps = Array.isArray(row?.blockedBy) ? row.blockedBy.join(", ") : "";
      return "- " + escapeHtml(String(row?.taskId ?? "")) + " blocked by " + escapeHtml(deps);
    }).join("\n") + "</pre>";
  }
  function renderPlanningSession(ps) {
    if (!ps || typeof ps !== "object") {
      return '<p class="muted"><b>Planning session</b> \u2014</p>';
    }
    const o = ps;
    const pct = typeof o.completionPct === "number" ? o.completionPct : "\u2014";
    return "<p><b>Planning session</b> " + escapeHtml(String(o.planningType ?? "")) + " \xB7 " + escapeHtml(String(o.status ?? "")) + " \xB7 " + pct + '% critical</p><pre class="muted">' + escapeHtml(String(o.resumeCli ?? "")) + "</pre>";
  }
  function renderDashboardRootInnerHtml(payload) {
    if (payload === null || payload === void 0) {
      return "<p>No payload</p>";
    }
    const p = payload;
    if (p.ok !== true) {
      const guidance = p.code === "policy-denied" ? "\n\nPolicy denied: provide policyApproval rationale/session scope where required." : "";
      return '<pre class="bad">' + escapeHtml(JSON.stringify(payload, null, 2) + guidance) + "</pre>";
    }
    const d = p.data ?? {};
    const ss = d.stateSummary || {};
    const sn = d.suggestedNext;
    const ws = d.workspaceStatus ?? null;
    const wishlist = d.wishlist || {};
    const wishlistOpenTop = Array.isArray(wishlist.openTop) ? wishlist.openTop : [];
    const planningSession = d.planningSession;
    const blockedSummary = d.blockedSummary || {};
    const blockedTop = Array.isArray(blockedSummary.top) ? blockedSummary.top.slice(0, 3) : [];
    const readyTop = Array.isArray(d.readyQueueTop) ? d.readyQueueTop.slice(0, 3) : [];
    return "<p><b>Phase</b> " + escapeHtml(String(ws?.currentKitPhase ?? "\u2014")) + '</p><p class="muted">' + escapeHtml(String(ws?.activeFocus ?? "")) + '</p><p class="ok">Tasks \xB7 proposed ' + String(ss.proposed ?? 0) + " \xB7 ready " + String(ss.ready ?? 0) + " \xB7 in progress " + String(ss.in_progress ?? 0) + " \xB7 blocked " + String(ss.blocked ?? 0) + " \xB7 done " + String(ss.completed ?? 0) + "</p><p><b>Wishlist</b> (W### \u2014 ideation; not in ready queue until converted to tasks) \xB7 open " + String(wishlist.openCount ?? 0) + " / total " + String(wishlist.totalCount ?? 0) + "</p>" + renderWishlistOpenList(wishlistOpenTop) + "<p><b>Blocked</b> " + String(blockedSummary.count ?? 0) + "</p>" + renderBlockedList(blockedTop) + "<p><b>Ready preview</b> " + String(d.readyQueueCount ?? 0) + "</p>" + renderReadyList(readyTop) + "<p><b>Suggested next</b> " + (sn && (sn.id != null || sn.title != null) ? escapeHtml(String(sn.id ?? "") + " \u2014 " + String(sn.title ?? "")) : "\u2014") + "</p>" + renderPlanningSession(planningSession) + '<p class="muted">Store updated ' + escapeHtml(String(d.taskStoreLastUpdated ?? "")) + "</p>";
  }

  // src/views/dashboard/dashboard-webview.ts
  function main() {
    const vscode = acquireVsCodeApi();
    const root = document.getElementById("root");
    const btn = document.getElementById("btn");
    const validate = document.getElementById("validate");
    const tasks = document.getElementById("tasks");
    const config = document.getElementById("config");
    if (!root || !btn || !validate || !tasks || !config) {
      document.body.innerHTML = '<p class="bad">Workflow Cannon dashboard: missing DOM nodes (root or buttons).</p>';
      return;
    }
    btn.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
    validate.addEventListener("click", () => vscode.postMessage({ type: "validateConfig" }));
    tasks.addEventListener("click", () => vscode.postMessage({ type: "openTasks" }));
    config.addEventListener("click", () => vscode.postMessage({ type: "openConfig" }));
    window.addEventListener("message", (ev) => {
      const msg = ev.data;
      if (msg?.type !== "dashboard") {
        return;
      }
      try {
        root.innerHTML = renderDashboardRootInnerHtml(msg.payload);
      } catch (err) {
        root.innerHTML = '<pre class="bad">Dashboard render error: ' + String(err).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>";
      }
    });
    vscode.postMessage({ type: "dashboard-ready" });
  }
  main();
})();
