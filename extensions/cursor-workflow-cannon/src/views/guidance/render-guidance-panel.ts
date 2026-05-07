import { escapeHtml, escapeHtmlAttr } from "../dashboard/render-dashboard.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberText(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? String(n) : "0";
}

function statusTone(value: unknown): string {
  const status = String(value ?? "").toLowerCase();
  if (status === "ok" || status === "ready" || status === "active") return "ok";
  if (status === "blocked" || status === "invalid" || status === "error") return "bad";
  return "warn";
}

function pill(label: string, value: unknown, tone?: string): string {
  const cls = tone ?? statusTone(value);
  return `<span class="gp-pill gp-${escapeHtmlAttr(cls)}"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value ?? "n/a"))}</b></span>`;
}

function renderStateCallout(data: UnknownRecord, result: UnknownRecord): string {
  if (result.ok !== true) {
    return `<section class="gp-callout gp-bad"><b>Guidance authoring is unavailable</b><span>${escapeHtml(String(result.message ?? result.code ?? "Unknown failure"))}</span></section>`;
  }
  const readiness = asRecord(data.readiness);
  const health = asRecord(data.health);
  const validation = asRecord(data.validation);
  const activeVersion = asRecord(data.activeVersion);
  const recentMutations = asRecord(data.recentMutations);
  const issues = asArray(readiness.issues).concat(asArray(data.validationWarnings));
  const registryStore = String(health.registryStore ?? readiness.registryStore ?? "unknown");
  const registryStatus = String(health.registryStatus ?? "unknown");
  const recentMutationCode = String(recentMutations.code ?? "");

  if (health.caeEnabled === false) {
    return '<section class="gp-callout gp-bad"><b>Guidance is disabled</b><span>Set <code>kit.cae.enabled</code> to <code>true</code>, then refresh.</span></section>';
  }
  if (registryStatus && registryStatus !== "ok" && registryStatus !== "unknown") {
    return `<section class="gp-callout gp-bad"><b>Guidance set is ${escapeHtml(registryStatus)}</b><span>Run registry validation and repair the listed issue before authoring.</span></section>`;
  }
  if (registryStore !== "sqlite" && registryStore !== "unknown") {
    return '<section class="gp-callout gp-warn"><b>Authoring is read-only</b><span>Switch <code>kit.cae.registryStore</code> to <code>sqlite</code> to enable guided mutations.</span></section>';
  }
  if (registryStore === "sqlite" && recentMutations.available === false && recentMutationCode === "cae-kit-sqlite-unavailable") {
    return '<section class="gp-callout gp-bad"><b>Native SQLite is unavailable</b><span>Rebuild <code>better-sqlite3</code> for the editor Node, then refresh.</span></section>';
  }
  if (registryStore === "sqlite" && activeVersion.isActive === false) {
    return '<section class="gp-callout gp-bad"><b>No active guidance set</b><span>Initialize or activate a SQLite guidance-set version before authoring.</span></section>';
  }
  if (validation.ok === false) {
    return `<section class="gp-callout gp-bad"><b>Registry validation failed</b><span>${escapeHtml(String(validation.message ?? validation.code ?? "Fix validation errors before editing."))}</span></section>`;
  }
  if (readiness.canMutate === false) {
    return `<section class="gp-callout gp-warn"><b>Authoring is in review mode</b><span>${escapeHtml(String(readiness.denialReason ?? "Mutations are disabled for this workspace."))}</span></section>`;
  }
  if (issues.length > 0) {
    return `<section class="gp-callout gp-warn"><b>Warnings need review</b><span>${escapeHtml(String(asRecord(issues[0]).message ?? asRecord(issues[0]).code ?? "Review warnings before editing."))}</span></section>`;
  }
  return '<section class="gp-callout gp-ok"><b>Guidance authoring is ready</b><span>Active set, validation, and SQLite authoring surface are available.</span></section>';
}

function renderOverview(data: UnknownRecord): string {
  const active = asRecord(data.activeVersion);
  const counts = asRecord(data.counts);
  const artifactStatuses = asRecord(counts.artifactStatuses);
  const activationStatuses = asRecord(counts.activationStatuses);
  const families = asRecord(counts.activationFamilies);
  const validation = asRecord(data.validation);
  return `<section class="gp-tab-panel is-active" id="gp-tab-overview" data-gp-panel="overview">
  <div class="gp-band">
    <div><h2>Overview</h2><p>${escapeHtml(String(active.versionId ?? "No active version"))}</p></div>
    <div class="gp-pill-row">
      ${pill("Artifacts", active.artifactCount ?? 0, "ok")}
      ${pill("Activations", active.activationCount ?? 0, "ok")}
      ${pill("Drafts", activationStatuses.draft ?? 0, Number(activationStatuses.draft ?? 0) > 0 ? "warn" : "ok")}
      ${pill("Validation", validation.ok === true ? "ok" : String(validation.code ?? "unknown"), validation.ok === true ? "ok" : "bad")}
    </div>
  </div>
  <div class="gp-grid gp-grid-4">
    <div><b>Policy</b><span>${numberText(families.policy)}</span></div>
    <div><b>Think</b><span>${numberText(families.think)}</span></div>
    <div><b>Do</b><span>${numberText(families.do)}</span></div>
    <div><b>Review</b><span>${numberText(families.review)}</span></div>
  </div>
  <div class="gp-grid gp-grid-3">
    <div><b>Active sources</b><span>${numberText(artifactStatuses.active)}</span></div>
    <div><b>Missing files</b><span>${numberText(artifactStatuses["missing-file"])}</span></div>
    <div><b>Recent mutations</b><span>${numberText(counts.recentMutationCount)}</span></div>
  </div>
</section>`;
}

function renderArtifacts(data: UnknownRecord): string {
  const rows = asArray(asRecord(data.artifacts).rows).slice(0, 80);
  const body = rows.length
    ? rows
        .map((raw) => {
          const row = asRecord(raw);
          return `<tr><td><code>${escapeHtml(String(row.artifactId ?? ""))}</code><small>${escapeHtml(String(row.title ?? ""))}</small></td><td>${escapeHtml(String(row.artifactType ?? ""))}</td><td>${escapeHtml(String(row.source ?? ""))}</td><td>${escapeHtml(String(row.status ?? ""))}</td><td>${row.fileExists === false ? "missing" : "present"}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="5">No artifacts found.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-artifacts" data-gp-panel="artifacts"><h2>Artifacts</h2><table><thead><tr><th>Artifact</th><th>Type</th><th>Source</th><th>Status</th><th>File</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderActivations(data: UnknownRecord): string {
  const rows = asArray(asRecord(data.activations).rows).slice(0, 80);
  const body = rows.length
    ? rows
        .map((raw) => {
          const row = asRecord(raw);
          const refs = asArray(row.artifactRefs).map((ref) => String(asRecord(ref).artifactId ?? "")).filter(Boolean);
          return `<tr><td><code>${escapeHtml(String(row.activationId ?? ""))}</code></td><td>${escapeHtml(String(row.family ?? ""))}</td><td>${escapeHtml(String(row.lifecycleState ?? row.status ?? ""))}</td><td>${escapeHtml(String(row.priority ?? ""))}</td><td>${escapeHtml(refs.join(", "))}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="5">No activations found.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-activations" data-gp-panel="activations"><h2>Activations</h2><table><thead><tr><th>Activation</th><th>Family</th><th>Lifecycle</th><th>Priority</th><th>Artifacts</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderPreview(data: UnknownRecord): string {
  const validation = asRecord(data.validation);
  return `<section class="gp-tab-panel" id="gp-tab-preview" data-gp-panel="preview">
  <h2>Preview</h2>
  <div class="gp-band"><div><b>Registry digest</b><p><code>${escapeHtml(String(validation.registryContentHash ?? asRecord(data.activeVersion).registryDigest ?? "unavailable"))}</code></p></div><button type="button" class="gp-primary" data-gp-action="refresh">Refresh</button></div>
  <p class="gp-muted">Preview data is supplied by the Guidance side view and <code>cae-guidance-preview</code>; this shell keeps the current registry state visible while authoring.</p>
</section>`;
}

function renderAudit(data: UnknownRecord): string {
  const rows = asArray(asRecord(data.recentMutations).rows).slice(0, 20);
  const body = rows.length
    ? rows
        .map((raw) => {
          const row = asRecord(raw);
          return `<tr><td>${escapeHtml(String(row.recordedAt ?? row.recorded_at ?? ""))}</td><td>${escapeHtml(String(row.commandName ?? row.command_name ?? ""))}</td><td>${escapeHtml(String(row.actor ?? ""))}</td><td>${escapeHtml(String(row.note ?? ""))}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="4">No recent mutations.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-audit" data-gp-panel="audit"><h2>Audit</h2><table><thead><tr><th>Recorded</th><th>Command</th><th>Actor</th><th>Note</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

export function renderGuidanceAuthoringPanelInnerHtml(result: unknown): string {
  const envelope = asRecord(result);
  const data = asRecord(envelope.data);
  const title = String(asRecord(data.product).productName ?? "Guidance");
  return `<main class="gp-shell">
  <header class="gp-head">
    <div><p class="gp-kicker">Workflow Cannon</p><h1>${escapeHtml(title)}</h1></div>
    <button type="button" id="gp-refresh" class="gp-primary" data-gp-action="refresh">Refresh</button>
  </header>
  ${renderStateCallout(data, envelope)}
  <nav class="gp-tabs" aria-label="Guidance authoring sections">
    <button type="button" class="is-active" data-gp-tab="overview">Overview</button>
    <button type="button" data-gp-tab="artifacts">Artifacts</button>
    <button type="button" data-gp-tab="activations">Activations</button>
    <button type="button" data-gp-tab="preview">Preview</button>
    <button type="button" data-gp-tab="audit">Audit</button>
  </nav>
  ${renderOverview(data)}
  ${renderArtifacts(data)}
  ${renderActivations(data)}
  ${renderPreview(data)}
  ${renderAudit(data)}
</main>`;
}
