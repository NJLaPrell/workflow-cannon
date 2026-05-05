/**
 * Pure HTML for the Editor status dashboard tab (tests target these exports).
 */

import { escapeHtml } from "../dashboard/render-dashboard.js";

function fmtIso(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function card(title: string, bodyInner: string): string {
  return (
    '<section class="wc-card">' +
    '<h2 class="wc-card-title">' +
    escapeHtml(title) +
    "</h2>" +
    '<div class="wc-card-body">' +
    bodyInner +
    "</div></section>"
  );
}

function kvRow(label: string, value: string): string {
  return (
    '<div class="wc-kv"><span class="wc-kv-label">' +
    escapeHtml(label) +
    '</span><span class="wc-kv-val">' +
    value +
    "</span></div>"
  );
}

/** Render inner HTML for `#wc-status-root` (no outer document shell). */
export function renderStatusTabInnerHtml(payload: Record<string, unknown>): string {
  const ok = payload.ok === true;
  if (!ok) {
    const code = typeof payload.code === "string" ? payload.code : "unknown";
    const msg = typeof payload.message === "string" ? payload.message : "dashboard-summary failed";
    return (
      '<div class="wc-status-error">' +
      "<p><b>" +
      escapeHtml(code) +
      "</b></p>" +
      "<p>" +
      escapeHtml(msg) +
      "</p></div>"
    );
  }

  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return '<p class="wc-muted">No data.</p>';
  }
  const d = data as Record<string, unknown>;
  const sys = d.systemStatus as Record<string, unknown> | undefined;
  const ag = d.agentGuidance as Record<string, unknown> | null | undefined;

  const parts: string[] = [];

  parts.push(
    '<header class="wc-status-head"><h1 class="wc-title">Workflow Cannon status</h1>' +
      '<p class="wc-sub">' +
      (sys && typeof sys.generatedAt === "string"
        ? "Snapshot · " + escapeHtml(fmtIso(sys.generatedAt))
        : "") +
      "</p></header>"
  );

  if (ag && typeof ag === "object") {
    const tier = ag.tier != null ? String(ag.tier) : "—";
    const role = typeof ag.displayLabel === "string" ? ag.displayLabel : "—";
    const temp = typeof ag.temperamentLabel === "string" ? ag.temperamentLabel : "—";
    const profile = typeof ag.temperamentProfileId === "string" ? ag.temperamentProfileId : "";
    const body =
      kvRow("Role (tier)", escapeHtml(role) + " (" + escapeHtml(tier) + ")") +
      kvRow("Temperament", escapeHtml(temp) + (profile ? " · " + escapeHtml(profile) : "")) +
      '<p class="wc-hint">Advisory profile — does not replace policy or JSON policyApproval on gated runs.</p>';
    parts.push(card("Session", body));
  }

  if (!sys || typeof sys !== "object") {
    parts.push(
      card(
        "System posture",
        '<p class="wc-muted">No <code>systemStatus</code> block — upgrade workspace-kit (dashboard-summary schema v5+) for phase/doctor/modules/CAE lines.</p>'
      )
    );
    return parts.join("");
  }

  const phase = sys.phase as Record<string, unknown> | undefined;
  if (phase && typeof phase === "object") {
    const phaseOk = phase.ok === true;
    const canon =
      phase.canonicalPhaseKey != null && String(phase.canonicalPhaseKey).length > 0
        ? String(phase.canonicalPhaseKey)
        : "—";
    const cur = phase.currentKitPhase != null ? String(phase.currentKitPhase) : "—";
    const nxt = phase.nextKitPhase != null ? String(phase.nextKitPhase) : "—";
    const drift = Array.isArray(phase.driftMessages)
      ? (phase.driftMessages as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const driftHtml =
      drift.length > 0
        ? "<ul>" + drift.map((x) => "<li>" + escapeHtml(x) + "</li>").join("") + "</ul>"
        : '<p class="wc-muted">No drift messages.</p>';
    const match =
      typeof phase.configMatchesWorkspaceStatus === "boolean"
        ? phase.configMatchesWorkspaceStatus
          ? "yes"
          : "no"
        : "—";
    const expStale =
      typeof phase.exportStale === "boolean" ? (phase.exportStale ? "stale" : "fresh") : "—";
    const body =
      '<p class="wc-phase-badge ' +
      (phaseOk ? "wc-ok" : "wc-bad") +
      '">' +
      (phaseOk ? "Phase read OK" : escapeHtml(String(phase.message ?? "phase error"))) +
      "</p>" +
      kvRow("Canonical phase", escapeHtml(canon)) +
      kvRow("Current / next", escapeHtml(cur) + " → " + escapeHtml(nxt)) +
      kvRow("Config vs workspace-status", escapeHtml(match)) +
      kvRow("DB export", escapeHtml(expStale)) +
      "<p><b>Drift</b></p>" +
      driftHtml;
    parts.push(card("Phase & workspace", body));
  }

  const doctor = sys.doctor as Record<string, unknown> | undefined;
  if (doctor && typeof doctor === "object") {
    const dOk = doctor.ok === true;
    const count = typeof doctor.issueCount === "number" ? doctor.issueCount : 0;
    const issues = Array.isArray(doctor.issues) ? doctor.issues : [];
    const issueRows = issues
      .slice(0, 24)
      .map((row) => {
        const r = row as Record<string, unknown>;
        const p = typeof r.path === "string" ? r.path : "";
        const reason = typeof r.reason === "string" ? r.reason : "";
        return "<li><code>" + escapeHtml(p) + "</code> — " + escapeHtml(reason) + "</li>";
      })
      .join("");
    const body =
      '<p class="' +
      (dOk ? "wc-ok" : "wc-bad") +
      '"><b>' +
      (dOk ? "Doctor contract checks passed" : "Doctor contract issues: " + String(count)) +
      "</b></p>" +
      (issueRows ? "<ul>" + issueRows + "</ul>" : "");
    parts.push(card("Doctor", body));
  }

  const mods = sys.modules as Record<string, unknown> | undefined;
  if (mods && typeof mods === "object") {
    const en = Array.isArray(mods.enabledModuleIds)
      ? (mods.enabledModuleIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const dis = Array.isArray(mods.disabledModuleIds)
      ? (mods.disabledModuleIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const enTxt =
      en.length > 0 ? en.map((x) => escapeHtml(x)).join(", ") : '<span class="wc-muted">none</span>';
    const disTxt =
      dis.length > 0 ? dis.map((x) => escapeHtml(x)).join(", ") : '<span class="wc-muted">none</span>';
    const body =
      kvRow("Enabled (" + String(en.length) + ")", enTxt) + kvRow("Disabled", disTxt);
    parts.push(card("Modules", body));
  }

  const caeLines = Array.isArray(sys.caeLines)
    ? sys.caeLines.filter((x): x is string => typeof x === "string")
    : [];
  if (caeLines.length > 0) {
    const body =
      "<ul>" +
      caeLines.map((line) => "<li>" + escapeHtml(line) + "</li>").join("") +
      "</ul>" +
      '<p class="wc-hint">CLI merges shadow CAE trace hints under <code>data.cae</code> when preflight runs.</p>';
    parts.push(card("CAE posture", body));
  }

  const ss = d.stateSummary as Record<string, unknown> | undefined;
  if (ss && typeof ss === "object") {
    const body =
      kvRow("Ready / in progress / blocked", escapeHtml(String(ss.ready ?? "—")) + " / " + escapeHtml(String(ss.in_progress ?? "—")) + " / " + escapeHtml(String(ss.blocked ?? "—"))) +
      kvRow("Total active-ish", escapeHtml(String(ss.total ?? "—")));
    parts.push(card("Task engine counts", body));
  }

  return parts.join("");
}
