/**
 * Pure HTML for the Config webview list — unit-tested; host swaps `#config-list-root` innerHTML.
 */

import { escapeHtml, escapeHtmlAttr } from "../dashboard/render-dashboard.js";

export type ConfigKeyRowInput = {
  key: string;
  type: string;
  description: string;
  default: unknown;
  domainScope: string;
  owningModule: string;
  exposure: string;
  sensitive: boolean;
  requiresApproval: boolean;
  requiresRestart: boolean;
  writableLayers: string[];
  allowedValues?: unknown[];
  /** Resolved effective value (after layers + defaults). */
  effectiveValue: unknown;
};

function sanitizeTrackId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 120);
}

/** Summary line: mask secrets, truncate long JSON. */
export function formatConfigValuePreview(value: unknown, sensitive: boolean, maxLen = 72): string {
  if (sensitive) {
    return "— hidden (sensitive) —";
  }
  if (value === undefined) {
    return "undefined";
  }
  let s: string;
  if (typeof value === "string") {
    s = JSON.stringify(value);
  } else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  }
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

export function editorTextForValue(value: unknown, fallbackDefault: unknown): string {
  const v = value !== undefined ? value : fallbackDefault;
  if (v === undefined) {
    return "";
  }
  return JSON.stringify(v, null, 2);
}

export function isConfigRowReadOnly(row: ConfigKeyRowInput): boolean {
  if (row.exposure === "internal") return true;
  return !row.writableLayers || row.writableLayers.length === 0;
}

function renderScopeOptions(layers: string[]): string {
  const uniq = [...new Set(layers.filter((x) => x === "project" || x === "user"))];
  if (uniq.length === 0) {
    return '<option value="project">project</option>';
  }
  return uniq
    .map((l) => `<option value="${escapeHtmlAttr(l)}">${escapeHtml(l)}</option>`)
    .join("");
}

export function renderConfigListInnerHtml(rows: ConfigKeyRowInput[]): string {
  if (rows.length === 0) {
    return '<p class="cfg-muted">No config keys returned. Is this a Workflow Cannon workspace?</p>';
  }
  return (
    '<div class="cfg-rows" role="list">' +
    rows
      .map((row) => {
        const ro = isConfigRowReadOnly(row);
        const track = sanitizeTrackId(row.key);
        const preview = formatConfigValuePreview(row.effectiveValue, row.sensitive);
        const layers = row.writableLayers?.length ? row.writableLayers : ["project"];
        const facetPill =
          row.exposure !== "public"
            ? `<span class="cfg-pill cfg-pill-warn">${escapeHtml(row.exposure)}</span>`
            : "";
        const appr = row.requiresApproval || row.sensitive ? '<span class="cfg-pill">approval</span>' : "";
        const actions = ro
          ? '<p class="cfg-muted">This key is read-only in the UI.</p>'
          : `<div class="cfg-actions">
  <label class="cfg-label">Persist to layer</label>
  <select class="cfg-select" data-role="scope" aria-label="Config layer for ${escapeHtmlAttr(row.key)}">${renderScopeOptions(layers)}</select>
  <button type="button" class="cfg-btn cfg-primary" data-wc-action="config-save" data-key="${escapeHtmlAttr(row.key)}">Apply value</button>
  <button type="button" class="cfg-btn" data-wc-action="config-unset" data-key="${escapeHtmlAttr(row.key)}">Unset on layer</button>
</div>`;
        const ta = escapeHtml(editorTextForValue(row.effectiveValue, row.default));
        const taDisabled = ro ? " disabled" : "";
        return `<div class="cfg-row" role="listitem" data-search="${escapeHtmlAttr(row.key.toLowerCase() + " " + row.description.toLowerCase())}">
  <details class="cfg-details" data-wc-track="${escapeHtmlAttr(track)}">
    <summary class="cfg-summary">
      <code class="cfg-key">${escapeHtml(row.key)}</code>
      <span class="cfg-type">${escapeHtml(row.type)}</span>
      <span class="cfg-preview">${escapeHtml(preview)}</span>
      ${facetPill}${appr}
    </summary>
    <div class="cfg-body">
      <p class="cfg-desc">${escapeHtml(row.description)}</p>
      <dl class="cfg-meta">
        <div><dt>Default</dt><dd><code>${escapeHtml(JSON.stringify(row.default))}</code></dd></div>
        <div><dt>Scope</dt><dd>${escapeHtml(row.domainScope)} · module <code>${escapeHtml(row.owningModule)}</code></dd></div>
        <div><dt>Writable layers</dt><dd>${escapeHtml(layers.join(", "))}</dd></div>
        ${row.requiresRestart ? `<div><dt>Restart</dt><dd>Changing this may require a kit / editor reload.</dd></div>` : ""}
      </dl>
      <label class="cfg-label" for="ta-${track}">Value (JSON)</label>
      <textarea id="ta-${track}" class="cfg-textarea" data-role="value" rows="6" spellcheck="false"${taDisabled}>${ta}</textarea>
      <div class="cfg-row-btns">
        <button type="button" class="cfg-btn" data-wc-action="config-explain" data-key="${escapeHtmlAttr(row.key)}">Explain layers</button>
      </div>
      ${actions}
    </div>
  </details>
</div>`;
      })
      .join("") +
    "</div>"
  );
}
