/**
 * Pure HTML for the Editor status dashboard tab (tests target these exports).
 */

import { escapeHtml } from "../dashboard/render-dashboard.js";

export type RenderStatusTabOptions = {
  /** VS Code workspace folder short name (primary folder when multi-root). */
  editorWorkspaceFolderLabel?: string;
};

function fmtIso(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function policyHuman(p: unknown): string {
  if (p === "require") return "Require planning token on writes";
  if (p === "warn") return "Warn when token omitted";
  if (p === "off") return "Off";
  return typeof p === "string" ? p : "—";
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
export function renderStatusTabInnerHtml(
  payload: Record<string, unknown>,
  options?: RenderStatusTabOptions
): string {
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
  const ident = sys?.identity as Record<string, unknown> | undefined;
  const parts: string[] = [];

  let displayTitle = "Workflow Cannon";
  if (ident && typeof ident.projectName === "string" && ident.projectName.trim().length > 0) {
    displayTitle = ident.projectName.trim();
  } else if (ident && typeof ident.packageName === "string" && ident.packageName.trim().length > 0) {
    displayTitle = ident.packageName.trim();
  }

  const subtitleBits: string[] = [];
  const folder = options?.editorWorkspaceFolderLabel?.trim();
  if (folder && folder.length > 0) {
    subtitleBits.push("Editor folder · " + escapeHtml(folder));
  }
  if (sys && typeof sys.generatedAt === "string") {
    subtitleBits.push("Snapshot · " + escapeHtml(fmtIso(sys.generatedAt)));
  }
  const pg = d.planningGeneration;
  const pol = d.planningGenerationPolicy;
  if (typeof pg === "number" && Number.isFinite(pg)) {
    subtitleBits.push(
      "Planning sync · #" +
        escapeHtml(String(pg)) +
        " · " +
        escapeHtml(policyHuman(pol))
    );
  }

  parts.push(
    '<header class="wc-status-head"><h1 class="wc-title">' +
      escapeHtml(displayTitle) +
      '</h1><p class="wc-sub">' +
      subtitleBits.join(" · ") +
      "</p></header>"
  );

  if (ident && typeof ident === "object") {
    const pkg =
      typeof ident.packageName === "string" && ident.packageName.length > 0 ? ident.packageName : "—";
    const rootV =
      typeof ident.rootPackageVersion === "string" && ident.rootPackageVersion.length > 0
        ? ident.rootPackageVersion
        : "—";
    const wk =
      typeof ident.workspaceKitVersion === "string" && ident.workspaceKitVersion.length > 0
        ? ident.workspaceKitVersion
        : "—";
    const body =
      kvRow("Package name", escapeHtml(pkg)) +
      kvRow("Package version", escapeHtml(rootV)) +
      kvRow("Workspace-kit version", escapeHtml(wk)) +
      '<p class="wc-hint">Project title comes from your kit profile (generated project context). Package fields are from the repo root <code>package.json</code>; workspace-kit version is read from <code>node_modules</code> when installed.</p>';
    parts.push(card("This workspace", body));
  }

  const ps = sys?.planningStore as Record<string, unknown> | undefined;
  if (ps && typeof ps === "object") {
    const backend = ps.backend === "sqlite" ? "SQLite" : String(ps.backend ?? "—");
    const dbp =
      typeof ps.databaseRelativePath === "string" && ps.databaseRelativePath.length > 0
        ? ps.databaseRelativePath
        : "—";
    const body =
      kvRow("Storage", escapeHtml(backend)) +
      kvRow("Planning database file", "<code>" + escapeHtml(dbp) + "</code>") +
      '<p class="wc-hint">Tasks and planning data live here; path follows your kit config with a safe default.</p>';
    parts.push(card("Planning data", body));
  }

  if (ag && typeof ag === "object") {
    const tier = ag.tier != null ? String(ag.tier) : "—";
    const role = typeof ag.displayLabel === "string" ? ag.displayLabel : "—";
    const temp = typeof ag.temperamentLabel === "string" ? ag.temperamentLabel : "—";
    const profile = typeof ag.temperamentProfileId === "string" ? ag.temperamentProfileId : "";
    const presentation = ag.agentPresentation && typeof ag.agentPresentation === "object"
      ? (ag.agentPresentation as Record<string, unknown>)
      : null;
    const workLog = typeof presentation?.workLog === "string" ? presentation.workLog : "—";
    const rationale = typeof presentation?.rationale === "string" ? presentation.rationale : "—";
    const detail = typeof presentation?.finalAnswerDetail === "string" ? presentation.finalAnswerDetail : "—";
    const body =
      kvRow("Role", escapeHtml(role) + " (tier " + escapeHtml(tier) + ")") +
      kvRow("Temperament", escapeHtml(temp) + (profile ? " · " + escapeHtml(profile) : "")) +
      kvRow(
        "Presentation",
        "Work-log " + escapeHtml(workLog) + " · Rationale " + escapeHtml(rationale) + " · Final " + escapeHtml(detail)
      ) +
      '<p class="wc-hint">Advisory only — does not replace CLI policy or JSON <code>policyApproval</code>.</p>';
    parts.push(card("Agent profile", body));
  }

  if (!sys || typeof sys !== "object") {
    parts.push(
      card(
        "System posture",
        '<p class="wc-muted">No <code>systemStatus</code> block — upgrade workspace-kit (<code>dashboard-summary</code> schema v5+) for phase checks, doctor list, modules, and CAE lines.</p>'
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
        : '<p class="wc-muted">No drift notes.</p>';
    const match =
      typeof phase.configMatchesWorkspaceStatus === "boolean"
        ? phase.configMatchesWorkspaceStatus
          ? "Yes"
          : "No"
        : "—";
    const expStale =
      typeof phase.exportStale === "boolean" ? (phase.exportStale ? "Stale — refresh export" : "Up to date") : "—";
    const body =
      '<p class="wc-phase-badge ' +
      (phaseOk ? "wc-ok" : "wc-bad") +
      '">' +
      (phaseOk ? "Phase info loaded" : escapeHtml(String(phase.message ?? "Phase check failed"))) +
      "</p>" +
      kvRow("Canonical phase", escapeHtml(canon)) +
      kvRow("Active → next phase", escapeHtml(cur) + " → " + escapeHtml(nxt)) +
      kvRow("Config matches workspace snapshot", escapeHtml(match)) +
      kvRow("Maintainer YAML export", escapeHtml(expStale)) +
      "<p><b>Drift & hints</b></p>" +
      driftHtml;
    const cat = phase.phaseCatalog as Record<string, unknown> | undefined;
    const catSupported = cat && cat.supported === true;
    const catPhases = catSupported && Array.isArray(cat.phases) ? (cat.phases as unknown[]) : [];
    let catRows = "";
    for (const raw of catPhases) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const row = raw as Record<string, unknown>;
      const pk = typeof row.phaseKey === "string" ? row.phaseKey : "";
      if (!pk) {
        continue;
      }
      const sd = row.shortDescription != null ? String(row.shortDescription).trim() : "";
      const desc = sd.length > 0 ? escapeHtml(sd) : "—";
      catRows += "<tr><td><code>" + escapeHtml(pk) + "</code></td><td>" + desc + "</td></tr>";
    }
    const catBlock =
      catSupported && catRows.length > 0
        ? "<p><b>Phase roster</b></p><table class=\"wc-mini-table\"><thead><tr><th>Key</th><th>Description</th></tr></thead><tbody>" +
          catRows +
          "</tbody></table>"
        : catSupported
          ? '<p class="wc-muted">Phase roster: no catalog-only rows yet (current/next still listed in kit phase fields above).</p>'
          : '<p class="wc-muted">Phase roster descriptions need planning SQLite v23+.</p>';
    parts.push(card("Phase & workspace", body + catBlock));
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
      (dOk ? "Contract checks passed" : "Issues found: " + String(count)) +
      "</b></p>" +
      (issueRows ? "<ul>" + issueRows + "</ul>" : "") +
      '<p class="wc-hint">These are shipped-file contract checks (similar to <code>wk doctor</code>), not your TypeScript build.</p>';
    parts.push(card("Kit contract files", body));
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
      kvRow("Turned on (" + String(en.length) + ")", enTxt) + kvRow("Turned off", disTxt);
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
      '<p class="wc-hint">Separate from any <code>data.cae</code> block on the CLI response when shadow preflight runs.</p>';
    parts.push(card("Context activation (CAE)", body));
  }

  const ss = d.stateSummary as Record<string, unknown> | undefined;
  if (ss && typeof ss === "object") {
    const body =
      kvRow("Ready · Active · Blocked", escapeHtml(String(ss.ready ?? "—")) + " · " + escapeHtml(String(ss.in_progress ?? "—")) + " · " + escapeHtml(String(ss.blocked ?? "—"))) +
      kvRow("Active tasks (total)", escapeHtml(String(ss.total ?? "—")));
    parts.push(card("Task counts", body));
  }

  return parts.join("");
}
