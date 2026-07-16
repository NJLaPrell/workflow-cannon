import { escapeHtml, escapeHtmlAttr } from "../dashboard/render-dashboard.js";
import {
  GUIDANCE_LIBRARY_ARTIFACT_TYPES,
  guidanceLibrarySourceChip,
  isGuidanceLibraryArtifactId
} from "./render-guidance.js";

export type GuidanceAuthoringPanelHost = "dashboard" | "standalone";

export type GuidanceAuthoringPanelRenderOptions = {
  /** Dashboard CAE tab hosts the file-first Library; standalone keeps the legacy Artifacts editor. */
  host?: GuidanceAuthoringPanelHost;
};

const WC_BTN_MD_PRI = "wc-btn wc-btn-md wc-btn-primary";
const WC_BTN_MD_SEC = "wc-btn wc-btn-md wc-btn-secondary";
const WC_BTN_SM_SEC = "wc-btn wc-btn-sm wc-btn-secondary";

/** Mirrors `CAE_WORKSPACE_ARTIFACT_TYPES` for authoring UI (extension does not import kit core). */
const WORKSPACE_CAE_ARTIFACT_TYPES = [
  "playbook",
  "runbook",
  "checklist",
  "review-template",
  "reasoning-template",
  "policy-doc"
] as const;

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

function callout(tone: "ok" | "warn" | "bad", title: string, message: string, actions: Array<{ label: string; action: string }> = []): string {
  const buttons = actions.length
    ? `<div class="gp-action-row">${actions
        .map((action) => `<button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="${escapeHtmlAttr(action.action)}">${escapeHtml(action.label)}</button>`)
        .join("")}</div>`
    : "";
  return `<section class="gp-callout gp-${tone}"><b>${escapeHtml(title)}</b><span>${escapeHtml(message)}</span>${buttons}</section>`;
}

function authoringMutationBlockReason(data: UnknownRecord): string | null {
  const readiness = asRecord(data.readiness);
  const health = asRecord(data.health);
  const validation = asRecord(data.validation);
  const activeVersion = asRecord(data.activeVersion);
  const recentMutations = asRecord(data.recentMutations);
  const registryStore = String(health.registryStore ?? readiness.registryStore ?? "unknown");
  const registryStatus = String(health.registryStatus ?? "unknown");
  const recentMutationCode = String(recentMutations.code ?? "");
  if (health.caeEnabled === false) return "Guidance is disabled for this workspace.";
  if (registryStatus && registryStatus !== "ok" && registryStatus !== "unknown") return `Guidance set is ${registryStatus}.`;
  if (registryStore !== "sqlite" && registryStore !== "unknown") return "Guidance authoring is read-only until the registry store is SQLite.";
  if (registryStore === "sqlite" && recentMutations.available === false && recentMutationCode === "cae-kit-sqlite-unavailable") return "Native SQLite is unavailable.";
  if (registryStore === "sqlite" && activeVersion.isActive === false) return "No active SQLite guidance set is available.";
  if (validation.ok === false) return String(validation.message ?? validation.code ?? "Registry validation failed.");
  if (readiness.canMutate !== true) return String(readiness.denialReason ?? "Mutations are disabled for this workspace.");
  return null;
}

function canMutateAuthoring(data: UnknownRecord): boolean {
  return authoringMutationBlockReason(data) === null;
}

function countWorkspaceActiveArtifacts(data: UnknownRecord): number {
  let n = 0;
  for (const raw of asArray(asRecord(data.artifacts).rows)) {
    const row = asRecord(raw);
    const source = String(row.source ?? "");
    const status = String(row.status ?? row.lifecycleStatus ?? "").toLowerCase();
    if (source === "workspace" && status === "active") n += 1;
  }
  return n;
}

const PREVIEW_COMMAND_SUGGESTIONS = [
  "run-transition",
  "list-tasks",
  "get-next-actions",
  "dashboard-summary",
  "cae-guidance-preview",
  "cae-registry-validate",
  "cae-export-guidance-pack",
  "cae-import-guidance-pack-dry-run",
  "cae-reconcile-defaults"
];

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
    return callout("bad", "Guidance is disabled", "Set kit.cae.enabled to true, then refresh.", [{ label: "Refresh", action: "refresh" }]);
  }
  if (registryStatus && registryStatus !== "ok" && registryStatus !== "unknown") {
    return callout("bad", `Guidance set is ${registryStatus}`, "Run registry validation and repair the listed issue before authoring.", [
      { label: "Validate Registry", action: "validate-registry" },
      { label: "Refresh", action: "refresh" }
    ]);
  }
  if (registryStore !== "sqlite" && registryStore !== "unknown") {
    return callout("warn", "Authoring is read-only", "Switch kit.cae.registryStore to sqlite to enable guided mutations.", [{ label: "Refresh", action: "refresh" }]);
  }
  if (registryStore === "sqlite" && recentMutations.available === false && recentMutationCode === "cae-kit-sqlite-unavailable") {
    return callout("bad", "Native SQLite is unavailable", "Rebuild better-sqlite3 for the editor Node, then refresh.", [{ label: "Refresh", action: "refresh" }]);
  }
  if (registryStore === "sqlite" && activeVersion.isActive === false) {
    return callout("bad", "No active guidance set", "Initialize or activate a SQLite guidance-set version before authoring.", [{ label: "Refresh", action: "refresh" }]);
  }
  if (validation.ok === false) {
    return callout("bad", "Registry validation failed", String(validation.message ?? validation.code ?? "Fix validation errors before editing."), [
      { label: "Validate Registry", action: "validate-registry" },
      { label: "Refresh", action: "refresh" }
    ]);
  }
  if (readiness.canMutate === false) {
    return callout("warn", "Authoring is in review mode", String(readiness.denialReason ?? "Mutations are disabled for this workspace."), [{ label: "Refresh", action: "refresh" }]);
  }
  if (issues.length > 0) {
    return callout("warn", "Warnings need review", String(asRecord(issues[0]).message ?? asRecord(issues[0]).code ?? "Review warnings before editing."), [
      { label: "Validate Registry", action: "validate-registry" }
    ]);
  }
  return callout("ok", "Guidance authoring is ready", "Active set, validation, and SQLite authoring surface are available.");
}

function renderOverview(data: UnknownRecord, host: GuidanceAuthoringPanelHost): string {
  const sourcesTab = host === "dashboard" ? "library" : "artifacts";
  const sourcesTabLabel = host === "dashboard" ? "Library" : "Artifacts";
  const active = asRecord(data.activeVersion);
  const health = asRecord(data.health);
  const counts = asRecord(data.counts);
  const artifactStatuses = asRecord(counts.artifactStatuses);
  const activationStatuses = asRecord(counts.activationStatuses);
  const families = asRecord(counts.activationFamilies);
  const validation = asRecord(data.validation);
  const warnings = asArray(data.validationWarnings);
  const recentMutations = asRecord(data.recentMutations);
  const recentRows = asArray(recentMutations.rows);
  const latestMutation = asRecord(recentRows[0]);
  const activeVersionId = String(active.versionId ?? health.activeRegistryVersionId ?? "No active version");
  const wsActiveArtifacts = countWorkspaceActiveArtifacts(data);
  const showOnboarding = wsActiveArtifacts === 0 && canMutateAuthoring(data);
  const onboarding = showOnboarding
    ? `<section class="gp-callout gp-warn"><b>First workspace Guidance</b><span>You have no active workspace-owned artifacts yet. Pick a starter from the ${sourcesTabLabel} tab, duplicate a default row, then bind a draft activation and run Preview before publishing.</span><div class="gp-action-row"><button type="button" class="${WC_BTN_MD_PRI}" data-gp-tab-target="${escapeHtmlAttr(sourcesTab)}" data-gp-action="new-artifact">Open ${escapeHtml(sourcesTabLabel)}</button><button type="button" class="${WC_BTN_MD_SEC}" data-gp-tab-target="activations" data-gp-action="new-activation">Open Activation editor</button></div></section>`
    : "";
  const warningRows = warnings.length
    ? `<div class="gp-warning-list">${warnings
        .slice(0, 4)
        .map((raw) => {
          const warning = asRecord(raw);
          return `<p><b>${escapeHtml(String(warning.code ?? "warning"))}</b><span>${escapeHtml(String(warning.detail ?? warning.message ?? "Review this validation warning."))}</span></p>`;
        })
        .join("")}</div>`
    : "";
  return `<section class="gp-tab-panel is-active" id="gp-tab-overview" data-gp-panel="overview">
  <div class="gp-band">
    <div><h2>Overview</h2><p>${escapeHtml(activeVersionId)}</p></div>
    <div class="gp-pill-row">
      ${pill("Artifacts", active.artifactCount ?? 0, "ok")}
      ${pill("Activations", active.activationCount ?? 0, "ok")}
      ${pill("Drafts", activationStatuses.draft ?? 0, Number(activationStatuses.draft ?? 0) > 0 ? "warn" : "ok")}
      ${pill("Validation", validation.ok === true ? "ok" : String(validation.code ?? "unknown"), validation.ok === true ? "ok" : "bad")}
    </div>
  </div>
  <div class="gp-action-row">
    <button type="button" class="${WC_BTN_MD_PRI}" data-gp-tab-target="${escapeHtmlAttr(sourcesTab)}" data-gp-action="new-artifact">${host === "dashboard" ? "Open Library" : "New Artifact"}</button>
    <button type="button" class="${WC_BTN_MD_PRI}" data-gp-tab-target="activations" data-gp-action="new-activation">New Activation</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-tab-target="preview" data-gp-action="preview-guidance">Preview Guidance</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="validate-registry">Validate Registry</button>
  </div>
  ${onboarding}
  <div id="gp-action-result" class="gp-inline-result" role="status" aria-live="polite"></div>
  <div class="gp-status-grid">
    <div><b>CAE</b><span>${health.caeEnabled === false ? "disabled" : "enabled"}</span></div>
    <div><b>Registry store</b><span>${escapeHtml(String(health.registryStore ?? "sqlite"))}</span></div>
    <div><b>Active version</b><span>${escapeHtml(activeVersionId)}</span></div>
    <div><b>Validation warnings</b><span>${numberText(warnings.length)}</span></div>
    <div><b>Recent mutations</b><span>${numberText(recentMutations.count ?? counts.recentMutationCount)}</span></div>
    <div><b>Latest mutation</b><span>${escapeHtml(String(latestMutation.commandName ?? latestMutation.command_name ?? "none"))}</span></div>
  </div>
  ${warningRows}
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
  const canMutate = canMutateAuthoring(data);
  const active = asRecord(data.activeVersion);
  const registryDigest = String(active.registryDigest ?? asRecord(data.validation).registryContentHash ?? "");
  const activeVersionId = String(active.versionId ?? "");
  const templates = asArray(data.workspaceArtifactMarkdownTemplates).map((raw) => {
    const row = asRecord(raw);
    return {
      id: String(row.id ?? ""),
      artifactType: String(row.artifactType ?? "playbook"),
      title: String(row.title ?? ""),
      contentMarkdown: String(row.contentMarkdown ?? "")
    };
  });
  const templatesJson = JSON.stringify(templates).replace(/</g, "\\u003c");
  const usedBy = new Map<string, number>();
  for (const rawActivation of asArray(asRecord(data.activations).rows)) {
    const activation = asRecord(rawActivation);
    for (const rawRef of asArray(activation.artifactRefs)) {
      const artifactId = String(asRecord(rawRef).artifactId ?? "");
      if (artifactId) usedBy.set(artifactId, (usedBy.get(artifactId) ?? 0) + 1);
    }
  }
  const rows = asArray(asRecord(data.artifacts).rows).slice(0, 80);
  const body = rows.length
    ? rows
        .map((raw) => {
          const row = asRecord(raw);
          const artifactId = String(row.artifactId ?? "");
          const source = String(row.source ?? "");
          const status = String(row.status ?? row.lifecycleStatus ?? "");
          const changed = String(row.updatedAt ?? row.lastChangedAt ?? row.changedAt ?? active.createdAt ?? "n/a");
          const searchable = [artifactId, row.title, row.artifactType, row.path, source, status].map((value) => String(value ?? "").toLowerCase()).join(" ");
          return `<tr data-gp-artifact-row data-gp-search="${escapeHtmlAttr(searchable)}" data-gp-source="${escapeHtmlAttr(source)}" data-gp-status="${escapeHtmlAttr(status)}" data-gp-artifact-id="${escapeHtmlAttr(artifactId)}" data-gp-artifact-title="${escapeHtmlAttr(String(row.title ?? ""))}" data-gp-artifact-type="${escapeHtmlAttr(String(row.artifactType ?? ""))}" data-gp-artifact-path="${escapeHtmlAttr(String(row.path ?? ""))}">
  <td><code>${escapeHtml(artifactId)}</code><small>${escapeHtml(String(row.title ?? "Untitled artifact"))}</small></td>
  <td>${escapeHtml(String(row.artifactType ?? ""))}</td>
  <td><span class="gp-source gp-source-${escapeHtmlAttr(source || "unknown")}">${escapeHtml(source || "unknown")}</span></td>
  <td><code>${escapeHtml(String(row.path ?? ""))}</code></td>
  <td>${numberText(usedBy.get(artifactId) ?? 0)}</td>
  <td>${escapeHtml(status || "unknown")}${row.fileExists === false ? '<small class="gp-bad-text">missing file</small>' : ""}</td>
  <td>${escapeHtml(changed)}</td>
  <td>${renderArtifactActions(row, canMutate)}</td>
</tr>`;
        })
        .join("")
    : '<tr><td colspan="8">No artifacts found.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-artifacts" data-gp-panel="artifacts">
  <div class="gp-band"><h2>Artifacts</h2><span id="gp-artifact-count" class="gp-muted">${numberText(rows.length)} artifacts</span></div>
  <div class="gp-table-tools">
    <input id="gp-artifact-search" type="search" placeholder="Search artifacts" />
    <select id="gp-artifact-source"><option value="">All sources</option><option value="default">Default</option><option value="workspace">Workspace</option><option value="override">Override</option></select>
    <select id="gp-artifact-status"><option value="">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="retired">Retired</option><option value="missing-file">Missing file</option></select>
  </div>
  <section class="gp-editor" id="gp-artifact-editor" data-gp-active-version="${escapeHtmlAttr(activeVersionId)}" data-gp-registry-digest="${escapeHtmlAttr(registryDigest)}">
    <script type="application/json" id="gp-artifact-templates-json">${templatesJson}</script>
    <div class="gp-band"><h3>Artifact Editor</h3><span class="gp-muted">${canMutate ? "Workspace mutations enabled" : "Read-only"}</span></div>
    <div class="gp-form-grid">
      <label>Artifact ID<input id="gp-artifact-id" placeholder="workspace.example.playbook" /></label>
      <label>Type<select id="gp-artifact-type">${WORKSPACE_CAE_ARTIFACT_TYPES.map(
        (t) => `<option value="${escapeHtmlAttr(t)}">${escapeHtml(t)}</option>`
      ).join("")}</select></label>
      <label>Starter<select id="gp-artifact-template"><option value="">Custom</option>${templates
        .filter((t) => t.id)
        .map(
          (t) =>
            `<option value="${escapeHtmlAttr(t.id)}">${escapeHtml(t.title || t.id)} (${escapeHtml(t.artifactType)})</option>`
        )
        .join("")}</select></label>
      <label>Title<input id="gp-artifact-title" placeholder="Example Playbook" /></label>
      <label>Tags<input id="gp-artifact-tags" placeholder="ops, release" /></label>
      <label>Path / slug<input id="gp-artifact-slug" placeholder="example-playbook" /></label>
      <label>Fragment<input id="gp-artifact-fragment" placeholder="#section" /></label>
    </div>
    <input id="gp-artifact-source-id" type="hidden" />
    <label class="gp-editor-block">Markdown<textarea id="gp-artifact-content" rows="7" placeholder="# Example Playbook"></textarea></label>
    <label class="gp-editor-block">Note<input id="gp-artifact-note" placeholder="Why this artifact change is needed" /></label>
    <div class="gp-action-row">
      <button type="button" class="${WC_BTN_MD_PRI}" id="gp-artifact-create" data-gp-action="artifact-create"${canMutate ? "" : " disabled"}>Create</button>
      <button type="button" class="${WC_BTN_MD_PRI}" id="gp-artifact-update" data-gp-action="artifact-update"${canMutate ? "" : " disabled"}>Update</button>
      <button type="button" class="${WC_BTN_MD_SEC}" id="gp-artifact-duplicate" data-gp-action="artifact-duplicate-submit"${canMutate ? "" : " disabled"}>Duplicate</button>
      <button type="button" class="${WC_BTN_MD_SEC}" id="gp-artifact-retire" data-gp-action="artifact-retire-submit"${canMutate ? "" : " disabled"}>Retire</button>
      <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="artifact-preview-form">Preview Markdown</button>
      <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="artifact-clear-form">Clear</button>
    </div>
    <div id="gp-artifact-preview" class="gp-markdown-preview"></div>
  </section>
  <table><thead><tr><th>Artifact</th><th>Type</th><th>Source</th><th>Path</th><th>Used by</th><th>Status</th><th>Changed</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table>
</section>`;
}

function rowButton(label: string, action: string, row: UnknownRecord, enabled: boolean): string {
  return `<button type="button" class="${WC_BTN_SM_SEC}" data-gp-action="${escapeHtmlAttr(action)}" data-gp-artifact-id="${escapeHtmlAttr(String(row.artifactId ?? ""))}" data-gp-artifact-path="${escapeHtmlAttr(String(row.path ?? ""))}"${enabled ? "" : " disabled"}>${escapeHtml(label)}</button>`;
}

function renderArtifactActions(row: UnknownRecord, canMutate: boolean): string {
  const source = String(row.source ?? "");
  const status = String(row.status ?? row.lifecycleStatus ?? "");
  const hasPath = typeof row.path === "string" && row.path.trim().length > 0;
  const active = status === "active";
  const isDefault = source === "default";
  const isWorkspace = source === "workspace";
  const isOverride = source === "override" || typeof row.overrideOfId === "string";
  const buttons = [
    rowButton("Open", "artifact-open", row, hasPath && row.fileExists !== false),
    rowButton("Preview", "artifact-preview", row, active),
    rowButton("Duplicate", "artifact-duplicate", row, canMutate && (isDefault || isWorkspace) && active),
    rowButton("Edit", "artifact-edit", row, canMutate && (isWorkspace || isOverride) && active),
    rowButton("Retire", "artifact-retire", row, canMutate && (isWorkspace || isOverride) && active),
    rowButton("Hide Default", "artifact-hide-default", row, canMutate && isDefault && active),
    rowButton("Remove Override", "artifact-remove-override", row, canMutate && isOverride)
  ];
  return `<div class="gp-row-actions">${buttons.join("")}</div>`;
}

function renderActivations(data: UnknownRecord): string {
  const canMutate = canMutateAuthoring(data);
  const active = asRecord(data.activeVersion);
  const rows = asArray(asRecord(data.activations).rows).slice(0, 80);
  const familyOrder = ["policy", "think", "do", "review"];
  const body = rows.length
    ? familyOrder
        .flatMap((family) => {
          const familyRows = rows.map(asRecord).filter((row) => String(row.family ?? "") === family);
          if (familyRows.length === 0) return [];
          return [
            `<tr class="gp-group-row"><td colspan="10">${escapeHtml(family)} · ${numberText(familyRows.length)}</td></tr>`,
            ...familyRows.map((row) => renderActivationRow(row, canMutate))
          ];
        })
        .join("")
    : '<tr><td colspan="10">No activations found.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-activations" data-gp-panel="activations">
  <div class="gp-band"><h2>Activations</h2><span id="gp-activation-count" class="gp-muted">${numberText(rows.length)} activations</span></div>
  <div class="gp-table-tools">
    <input id="gp-activation-search" type="search" placeholder="Search activations" />
    <select id="gp-activation-family"><option value="">All families</option><option value="policy">Policy</option><option value="think">Think</option><option value="do">Do</option><option value="review">Review</option></select>
    <select id="gp-activation-status"><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft (authoring)</option><option value="disabled">Disabled</option><option value="hidden">Hidden</option><option value="retired">Retired</option></select>
  </div>
  <div class="gp-action-row">
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="activation-bulk-select-visible">Select visible rows</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="activation-bulk-clear">Clear selection</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="activation-bulk-disable"${canMutate ? "" : " disabled"}>Disable selected</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="activation-bulk-retire"${canMutate ? "" : " disabled"}>Retire selected</button>
  </div>
  ${renderActivationEditor(data, canMutate, active)}
  <table><thead><tr><th class="gp-bulk-col"></th><th>Activation</th><th>Lifecycle</th><th>Priority</th><th>Scope</th><th>Artifacts</th><th>Ack</th><th>Source</th><th>Warnings</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table>
</section>`;
}

function renderActivationEditor(data: UnknownRecord, canMutate: boolean, active: UnknownRecord): string {
  const registryDigest = String(active.registryDigest ?? asRecord(data.validation).registryContentHash ?? "");
  const activeVersionId = String(active.versionId ?? "");
  const artifacts = asArray(asRecord(data.artifacts).rows).map(asRecord).filter((row) => String(row.status ?? row.lifecycleStatus ?? "") === "active");
  const types = Array.from(new Set(artifacts.map((row) => String(row.artifactType ?? "artifact")))).sort();
  const picker = types.length
    ? types
        .map((type) => {
          const rows = artifacts.filter((row) => String(row.artifactType ?? "artifact") === type);
          return `<fieldset class="gp-picker-group"><legend>${escapeHtml(type)}</legend>${rows
            .map((row) => {
              const artifactId = String(row.artifactId ?? "");
              const source = String(row.source ?? "unknown");
              const status = String(row.status ?? row.lifecycleStatus ?? "unknown");
              return `<label class="gp-pick"><input type="checkbox" data-gp-activation-artifact data-gp-artifact-type="${escapeHtmlAttr(type)}" value="${escapeHtmlAttr(artifactId)}" /> <span><code>${escapeHtml(artifactId)}</code><small>${escapeHtml(String(row.title ?? artifactId))}</small></span><b>${escapeHtml(source)} · ${escapeHtml(status)}</b></label>`;
            })
            .join("")}</fieldset>`;
        })
        .join("")
    : '<p class="gp-muted">No active artifacts are available for draft activation refs.</p>';
  return `<section class="gp-editor" id="gp-activation-editor" data-gp-active-version="${escapeHtmlAttr(activeVersionId)}" data-gp-registry-digest="${escapeHtmlAttr(registryDigest)}">
    <div class="gp-band"><h3>Activation Editor</h3><span class="gp-muted">${canMutate ? "Draft mutations enabled" : "Read-only"}</span></div>
    <div class="gp-form-grid">
      <label>Activation ID<input id="gp-activation-id" placeholder="workspace.activation.draft.example" /></label>
      <label>Family<select id="gp-activation-family-field"><option value="policy">policy</option><option value="think">think</option><option value="do" selected>do</option><option value="review">review</option></select></label>
      <label>Priority<input id="gp-activation-priority" type="number" min="0" max="9999" value="1" /></label>
      <label>Lifecycle<select id="gp-activation-lifecycle"><option value="draft">draft</option></select></label>
      <label>Acknowledgement<select id="gp-activation-ack-strength"><option value="none">none</option><option value="surface">surface</option><option value="recommend">recommend</option><option value="ack_required">ack required</option><option value="satisfy_required">satisfy required</option></select></label>
      <label>Ack token<input id="gp-activation-ack-token" placeholder="policy-token" /></label>
    </div>
    <div class="gp-form-grid">
      <label>Scope preset<select id="gp-activation-scope-preset"><option value="always">Always</option><option value="command-exact">Command exact</option><option value="command-prefix">Command prefix</option><option value="task-tag">Task tag</option><option value="task-id-pattern">Task ID pattern</option><option value="phase-key">Phase key</option><option value="command-arg-equals">Command arg equals</option></select></label>
      <label>Scope value<input id="gp-activation-scope-value" placeholder="run-task" /></label>
      <label>Arg path / tag match<input id="gp-activation-scope-path" placeholder="taskId or args.foo" /></label>
    </div>
    <p class="gp-muted" style="margin:0 0 0.25rem 0">Optional second row — combined with AND (all conditions must match).</p>
    <div class="gp-form-grid">
      <label>Scope preset (row 2)<select id="gp-activation-scope-preset-2"><option value="">(none)</option><option value="always">Always</option><option value="command-exact">Command exact</option><option value="command-prefix">Command prefix</option><option value="task-tag">Task tag</option><option value="task-id-pattern">Task ID pattern</option><option value="phase-key">Phase key</option><option value="command-arg-equals">Command arg equals</option></select></label>
      <label>Scope value (row 2)<input id="gp-activation-scope-value-2" placeholder="e.g. phase key or second command" /></label>
      <label>Arg path / tag match (row 2)<input id="gp-activation-scope-path-2" placeholder="taskId or args.foo" /></label>
    </div>
    <details class="gp-editor-block"><summary>Advanced JSON</summary><textarea id="gp-activation-scope-json" rows="6" placeholder='{"conditions":[{"kind":"always"}]}'></textarea></details>
    <div class="gp-picker" id="gp-activation-artifact-picker">${picker}</div>
    <label class="gp-editor-block">Note<input id="gp-activation-note" placeholder="Why this draft activation is needed" /></label>
    <div class="gp-action-row">
      <button type="button" class="${WC_BTN_MD_PRI}" data-gp-action="activation-create-submit"${canMutate ? "" : " disabled"}>Create Draft</button>
      <button type="button" class="${WC_BTN_MD_PRI}" data-gp-action="activation-update-submit"${canMutate ? "" : " disabled"}>Update Draft</button>
      <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="activation-clear-form">Clear</button>
    </div>
  </section>`;
}

function renderActivationRow(row: UnknownRecord, canMutate: boolean): string {
  const activationId = String(row.activationId ?? "");
  const family = String(row.family ?? "");
  const status = String(row.status ?? row.lifecycleState ?? "");
  const source = String(row.source ?? "");
  const refs = asArray(row.artifactRefs).map((ref) => String(asRecord(ref).artifactId ?? "")).filter(Boolean);
  const ack = asRecord(row.acknowledgement);
  const warnings = asArray(row.statusWarnings).map((warning) => String(warning));
  const searchable = [activationId, family, status, source, row.scopeSummary, refs.join(" "), warnings.join(" ")].map((value) => String(value ?? "").toLowerCase()).join(" ");
  return `<tr data-gp-activation-row data-gp-search="${escapeHtmlAttr(searchable)}" data-gp-family="${escapeHtmlAttr(family)}" data-gp-status="${escapeHtmlAttr(status)}" data-gp-activation-id="${escapeHtmlAttr(activationId)}" data-gp-activation-family="${escapeHtmlAttr(family)}" data-gp-activation-priority="${escapeHtmlAttr(String(row.priority ?? ""))}" data-gp-activation-scope-json="${escapeHtmlAttr(String(row.scopeJson ?? ""))}" data-gp-activation-refs="${escapeHtmlAttr(refs.join(","))}" data-gp-activation-ack-strength="${escapeHtmlAttr(String(ack.strength ?? "none"))}" data-gp-activation-ack-token="${escapeHtmlAttr(String(ack.token ?? ""))}">
  <td class="gp-bulk-col"><input type="checkbox" aria-label="Select activation" data-gp-activation-bulk="${escapeHtmlAttr(activationId)}" data-gp-bulk-status="${escapeHtmlAttr(status)}" /></td>
  <td><code>${escapeHtml(activationId)}</code><small>${escapeHtml(family)}</small></td>
  <td>${escapeHtml(status || "unknown")}</td>
  <td>${escapeHtml(String(row.priority ?? ""))}</td>
  <td>${escapeHtml(String(row.scopeSummary ?? "n/a"))}</td>
  <td>${escapeHtml(refs.join(", "))}</td>
  <td>${ack.strength ? `${escapeHtml(String(ack.strength))}<small>${escapeHtml(String(ack.token ?? ""))}</small>` : "none"}</td>
  <td><span class="gp-source gp-source-${escapeHtmlAttr(source || "unknown")}">${escapeHtml(source || "unknown")}</span></td>
  <td>${warnings.length ? warnings.map((warning) => `<small class="gp-bad-text">${escapeHtml(warning)}</small>`).join("") : "none"}</td>
  <td>${renderActivationActions(row, canMutate)}</td>
</tr>`;
}

function renderActivationActions(row: UnknownRecord, canMutate: boolean): string {
  const activationId = String(row.activationId ?? "");
  const status = String(row.status ?? "");
  const source = String(row.source ?? "");
  const isEditable = source === "workspace" || source === "override" || status === "draft";
  const button = (label: string, action: string, enabled: boolean) =>
    `<button type="button" class="${WC_BTN_SM_SEC}" data-gp-action="${escapeHtmlAttr(action)}" data-gp-activation-id="${escapeHtmlAttr(activationId)}"${enabled ? "" : " disabled"}>${escapeHtml(label)}</button>`;
  return `<div class="gp-row-actions">${[
    button("Edit", "activation-edit", canMutate && isEditable),
    button("Duplicate", "activation-duplicate", canMutate && status !== "retired"),
    button("Preview", "activation-preview", status !== "retired"),
    button("Activate Draft", "activation-activate-draft", canMutate && status === "draft"),
    button("Disable", "activation-disable", canMutate && status === "active"),
    button("Retire", "activation-retire", canMutate && status !== "retired")
  ].join("")}</div>`;
}

function renderPreview(data: UnknownRecord): string {
  const validation = asRecord(data.validation);
  const active = asRecord(data.activeVersion);
  const phase = String(asRecord(data.health).currentPhase ?? "82");
  const cmdOptions = PREVIEW_COMMAND_SUGGESTIONS.map((c) => `<option value="${escapeHtmlAttr(c)}"></option>`).join("");
  return `<section class="gp-tab-panel" id="gp-tab-preview" data-gp-panel="preview">
  <div class="gp-band"><h2>Preview</h2><span class="gp-muted">Draft overlay evidence</span></div>
  <section class="gp-callout gp-ok"><b>Conflict assistant</b><span>When counts tie within the same family, higher priority wins. Policy can block advisory families — check <b>Conflicts</b> and same-family subset in the result. Narrow scope, raise priority, or split activations if the draft is shadowed.</span></section>
  <div class="gp-status-grid">
    <div><b>Registry digest</b><span><code>${escapeHtml(String(validation.registryContentHash ?? active.registryDigest ?? "unavailable"))}</code></span></div>
    <div><b>Active version</b><span>${escapeHtml(String(active.versionId ?? "n/a"))}</span></div>
    <div><b>Readiness</b><span id="gp-preview-readiness">Not run</span></div>
  </div>
  <section class="gp-editor" id="gp-preview-editor">
    <div class="gp-form-grid">
      <label>Command<input id="gp-preview-command" list="gp-preview-cmd-suggestions" value="run-transition" autocomplete="off" /></label>
      <datalist id="gp-preview-cmd-suggestions">${cmdOptions}</datalist>
      <label>Task ID<input id="gp-preview-task-id" placeholder="T100080" /></label>
      <label>Phase<input id="gp-preview-phase" value="${escapeHtmlAttr(phase)}" /></label>
    </div>
    <label class="gp-editor-block">Command args JSON<textarea id="gp-preview-command-args" rows="4" placeholder='{"action":"complete"}'></textarea></label>
    <div class="gp-action-row">
      <button type="button" class="${WC_BTN_MD_PRI}" data-gp-action="preview-run-draft">Preview Draft</button>
      <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="preview-copy-evidence">Copy Evidence</button>
    </div>
  </section>
  <div id="gp-preview-result" class="gp-preview-result"><p class="gp-muted">Run a draft preview from the activation editor to see impact, warnings, sample matches (kind + matched flag), same-family conflicts, and publish evidence.</p></div>
</section>`;
}

function renderPortability(canMutate: boolean): string {
  return `<section class="gp-tab-panel" id="gp-tab-portability" data-gp-panel="portability">
  <div class="gp-band"><h2>Portability & defaults</h2><span class="gp-muted">Reconcile · export · import dry-run</span></div>
  <section class="gp-callout gp-ok"><b>Capabilities</b><span>Dashboard edits require <code>kit.cae.adminMutations</code> and a CAE mutation confirmation. Sensitive lifecycle moves (activate, retire, rollback, import) still go through <code>workspace-kit run</code> with JSON <code>policyApproval</code> where the command is gated — chat text is not approval. <b>CAE rationale</b> is collected as <code>caeMutationApproval</code> (host prompt + modal confirm); it is <em>not</em> the same object as Tier A/B <code>policyApproval</code> on <code>wk run</code>.</span></section>
  <div class="gp-action-row">
    <button type="button" class="${WC_BTN_MD_PRI}" data-gp-action="portability-reconcile">Compare package defaults</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="portability-export"${canMutate ? "" : " disabled"}>Export pack to tmp</button>
    <button type="button" class="${WC_BTN_MD_SEC}" data-gp-action="portability-import-dry"${canMutate ? "" : " disabled"}>Dry-run import from tmp</button>
  </div>
  <p class="gp-muted">Export writes <code>.workspace-kit/tmp/guidance-pack.json</code> (created on demand). Dry-run reads that relative path.</p>
  <pre id="gp-portability-out" class="gp-versions-dump">Click a button to load kit output.</pre>
</section>`;
}

function renderVersions(data: UnknownRecord): string {
  const active = asRecord(data.activeVersion);
  const vid = String(active.versionId ?? "n/a");
  return `<section class="gp-tab-panel" id="gp-tab-versions" data-gp-panel="versions">
  <div class="gp-band"><h2>Registry versions</h2><span class="gp-muted">Read-only · <code>cae-list-registry-versions</code></span></div>
  <div class="gp-action-row">
    <button type="button" class="${WC_BTN_MD_PRI}" data-gp-action="versions-refresh">Refresh version list</button>
  </div>
  <p class="gp-muted">Active version from last authoring snapshot: <code>${escapeHtml(vid)}</code>. Open the <b>Audit</b> tab for the mutation timeline (command, actor, note).</p>
  <pre id="gp-versions-json" class="gp-versions-dump">Click “Refresh version list” to load rows from kit SQLite.</pre>
</section>`;
}

const GUIDANCE_LIBRARY_CLIENT_SCRIPT = `<script>
(function(){
  var panel=document.querySelector('[data-gp-panel="library"]');
  if(!panel)return;
  function vscodeApi(){return window.__wfcVscode||(typeof acquireVsCodeApi==='function'?(window.__wfcVscode=acquireVsCodeApi()):null);}
  panel.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('[data-gp-library-action]'):null;
    if(!btn||btn.disabled)return;
    var api=vscodeApi();
    if(!api)return;
    var action=btn.getAttribute('data-gp-library-action')||'';
    var ctx=panel.querySelector('[data-gp-library-mutation-context]');
    var concurrency={};
    if(ctx){
      var v=ctx.getAttribute('data-gp-active-version');if(v)concurrency.expectedActiveVersionId=v;
      var d=ctx.getAttribute('data-gp-registry-digest');if(d)concurrency.expectedRegistryDigest=d;
    }
    if(action==='create'){
      api.postMessage({type:'artifactAction',action:'library-create',concurrency:concurrency});
      return;
    }
    if(action==='duplicate'){
      api.postMessage({type:'artifactAction',action:'library-duplicate',artifactId:btn.getAttribute('data-gp-artifact-id')||'',artifactTitle:btn.getAttribute('data-gp-artifact-title')||'',artifactType:btn.getAttribute('data-gp-artifact-type')||'',artifactPath:btn.getAttribute('data-gp-artifact-path')||'',concurrency:concurrency});
    }
  });
})();
</script>`;

function libraryNumberText(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? String(n) : "0";
}


function renderDashboardGuidanceLibraryPanel(data: UnknownRecord, canMutate: boolean): string {
  const active = asRecord(data.activeVersion);
  const registryDigest = String(active.registryDigest ?? asRecord(data.validation).registryContentHash ?? "");
  const activeVersionId = String(active.versionId ?? "");
  const rows = asArray(asRecord(data.artifacts).rows)
    .map(asRecord)
    .filter((row) => isGuidanceLibraryArtifactId(String(row.artifactId ?? "")))
    .slice(0, 120);
  const typeCounts = new Map<string, number>();
  for (const artifactType of GUIDANCE_LIBRARY_ARTIFACT_TYPES) {
    typeCounts.set(artifactType, 0);
  }
  for (const row of rows) {
    const artifactType = String(row.artifactType ?? "");
    if (typeCounts.has(artifactType)) {
      typeCounts.set(artifactType, (typeCounts.get(artifactType) ?? 0) + 1);
    }
  }
  const typeChips = GUIDANCE_LIBRARY_ARTIFACT_TYPES.map((artifactType) => {
    const count = typeCounts.get(artifactType) ?? 0;
    return `<span class="gp-pill gp-type-chip" data-gp-library-type="${escapeHtmlAttr(artifactType)}"><span>${escapeHtml(artifactType)}</span><b>${libraryNumberText(count)}</b></span>`;
  }).join("");
  const body = rows.length
    ? rows
        .map((row) => {
          const artifactId = String(row.artifactId ?? "");
          const artifactType = String(row.artifactType ?? "");
          const sourceChip = guidanceLibrarySourceChip(artifactId);
          const status = String(row.status ?? row.lifecycleStatus ?? "");
          const changed = String(row.updatedAt ?? row.lastChangedAt ?? row.changedAt ?? "n/a");
          const path = String(row.path ?? "");
          const title = String(row.title ?? "");
          const activeRow = status === "active";
          const canDuplicate = canMutate && activeRow && (artifactId.startsWith("cae.") || artifactId.startsWith("workspace."));
          const searchable = [artifactId, title, artifactType, path, sourceChip, status]
            .map((value) => String(value ?? "").toLowerCase())
            .join(" ");
          const hasPath = path.trim().length > 0;
          const canOpen = hasPath && row.fileExists !== false;
          return `<tr data-gp-artifact-row data-gp-search="${escapeHtmlAttr(searchable)}" data-gp-source="${escapeHtmlAttr(sourceChip)}" data-gp-status="${escapeHtmlAttr(status)}" data-gp-artifact-id="${escapeHtmlAttr(artifactId)}" data-gp-artifact-title="${escapeHtmlAttr(title)}" data-gp-artifact-type="${escapeHtmlAttr(artifactType)}" data-gp-artifact-path="${escapeHtmlAttr(path)}">
  <td><code>${escapeHtml(artifactId)}</code><small>${escapeHtml(title || "Untitled source")}</small></td>
  <td><span class="gp-pill gp-type-chip gp-type-${escapeHtmlAttr(artifactType || "unknown")}">${escapeHtml(artifactType || "unknown")}</span></td>
  <td><span class="gp-source gp-source-${escapeHtmlAttr(sourceChip)}">${escapeHtml(sourceChip)}</span></td>
  <td><code>${escapeHtml(path)}</code></td>
  <td>${escapeHtml(status || "unknown")}${row.fileExists === false ? '<small class="gp-bad-text">missing file</small>' : ""}</td>
  <td>${escapeHtml(changed)}</td>
  <td><div class="gp-row-actions"><button type="button" class="${WC_BTN_SM_SEC}" data-gp-action="artifact-open" data-gp-artifact-id="${escapeHtmlAttr(artifactId)}" data-gp-artifact-path="${escapeHtmlAttr(path)}"${canOpen ? "" : " disabled"}>Open</button><button type="button" class="${WC_BTN_SM_SEC}" data-gp-library-action="duplicate" data-gp-artifact-id="${escapeHtmlAttr(artifactId)}" data-gp-artifact-title="${escapeHtmlAttr(title)}" data-gp-artifact-type="${escapeHtmlAttr(artifactType)}" data-gp-artifact-path="${escapeHtmlAttr(path)}"${canDuplicate ? "" : " disabled"}>Duplicate</button></div></td>
</tr>`;
        })
        .join("")
    : '<tr><td colspan="7">No library sources found for <code>cae.*</code> or <code>workspace.*</code>.</td></tr>';
  return `<section class="gp-tab-panel" id="gp-tab-library" data-gp-panel="library">
  <div class="gp-band"><h2>Library</h2><span id="gp-artifact-count" class="gp-muted">${libraryNumberText(rows.length)} sources</span></div>
  <p class="gp-muted">File-first CAE and workspace sources. <b>Create</b> or <b>Duplicate</b> collects identity fields only, then opens the artifact file in the editor — no inline markdown body.</p>
  <div class="gp-library-mutation-context" data-gp-library-mutation-context data-gp-active-version="${escapeHtmlAttr(activeVersionId)}" data-gp-registry-digest="${escapeHtmlAttr(registryDigest)}"></div>
  <div class="gp-action-row">
    <button type="button" class="${WC_BTN_MD_PRI}" data-gp-library-action="create"${canMutate ? "" : " disabled"}>Create workspace artifact</button>
  </div>
  <div class="gp-pill-row gp-library-type-chips" aria-label="Artifact types">${typeChips}</div>
  <div class="gp-table-tools">
    <input id="gp-artifact-search" type="search" placeholder="Search library" />
    <select id="gp-artifact-source"><option value="">All sources</option><option value="cae">cae</option><option value="workspace">workspace</option></select>
    <select id="gp-artifact-status"><option value="">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="retired">Retired</option><option value="missing-file">Missing file</option></select>
  </div>
  <table><thead><tr><th>Source</th><th>Type</th><th>Namespace</th><th>Path</th><th>Status</th><th>Changed</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table>
  ${GUIDANCE_LIBRARY_CLIENT_SCRIPT}
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

export function renderGuidanceAuthoringPanelInnerHtml(
  result: unknown,
  options?: GuidanceAuthoringPanelRenderOptions
): string {
  const envelope = asRecord(result);
  const data = asRecord(envelope.data);
  const title = String(asRecord(data.product).productName ?? "Guidance");
  const canMutate = canMutateAuthoring(data);
  const host = options?.host ?? "standalone";
  const sourcesPanel = host === "dashboard" ? renderDashboardGuidanceLibraryPanel(data, canMutate) : renderArtifacts(data);
  const sourcesTab = host === "dashboard" ? "library" : "artifacts";
  const sourcesTabLabel = host === "dashboard" ? "Library" : "Artifacts";
  return `<main class="gp-shell">
  <header class="gp-head">
    <div><p class="gp-kicker">Workflow Cannon</p><h1>${escapeHtml(title)}</h1></div>
    <button type="button" id="gp-refresh" class="${WC_BTN_MD_PRI}" data-gp-action="refresh">Refresh</button>
  </header>
  ${renderStateCallout(data, envelope)}
  <nav class="gp-tabs" aria-label="Guidance authoring sections">
    <button type="button" class="is-active" data-gp-tab="overview">Overview</button>
    <button type="button" data-gp-tab="${escapeHtmlAttr(sourcesTab)}">${escapeHtml(sourcesTabLabel)}</button>
    <button type="button" data-gp-tab="activations">Activations</button>
    <button type="button" data-gp-tab="versions">Versions</button>
    <button type="button" data-gp-tab="preview">Preview</button>
    <button type="button" data-gp-tab="portability">Portability</button>
    <button type="button" data-gp-tab="audit">Audit</button>
  </nav>
  ${renderOverview(data, host)}
  ${sourcesPanel}
  ${renderActivations(data)}
  ${renderVersions(data)}
  ${renderPreview(data)}
  ${renderPortability(canMutate)}
  ${renderAudit(data)}
</main>`;
}
