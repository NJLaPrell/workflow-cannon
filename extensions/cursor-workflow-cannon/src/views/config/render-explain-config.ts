import { escapeHtml } from "../dashboard/render-dashboard.js";

function layerLabel(layer: string): string {
  if (layer === "kit-default") return "Default";
  if (layer === "project") return "Project";
  if (layer === "user") return "User";
  return layer;
}

function valueCell(value: unknown): string {
  if (value === undefined) return "<em>undefined</em>";
  try {
    return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
  } catch {
    return escapeHtml(String(value));
  }
}

/** Human-readable layer breakdown for explain-config CLI JSON (not raw status dump). */
export function renderExplainConfigHtml(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return '<p class="cfg-muted">No layer explanation returned.</p>';
  }
  const root = payload as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;

  const entries = data.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const rows = entries
      .map((raw) => {
        const e = raw as Record<string, unknown>;
        const path = String(e.path ?? "");
        const winning = String(e.winningLayer ?? "");
        return (
          "<tr>" +
          `<td><code>${escapeHtml(path)}</code></td>` +
          `<td>${escapeHtml(layerLabel(winning))}</td>` +
          `<td>${valueCell(e.effectiveValue)}</td>` +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="cfg-explain-panel">' +
      `<p><b>Facet:</b> <code>${escapeHtml(String(data.facet ?? ""))}</code> · ${escapeHtml(String(data.count ?? entries.length))} keys</p>` +
      '<table class="cfg-explain-table"><thead><tr><th>Key</th><th>Winning layer</th><th>Effective</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div>`
    );
  }

  const path = String(data.path ?? "");
  const alternates = data.alternates;
  if (!Array.isArray(alternates)) {
    return '<p class="cfg-muted">Unexpected explain-config shape.</p>';
  }
  const rows = alternates
    .map((raw) => {
      const a = raw as { layer?: string; value?: unknown };
      const layer = layerLabel(String(a.layer ?? ""));
      const win = data.winningLayer === a.layer ? ' class="cfg-explain-win"' : "";
      return `<tr${win}><td>${escapeHtml(layer)}</td><td>${valueCell(a.value)}</td></tr>`;
    })
    .join("");
  return (
    '<div class="cfg-explain-panel">' +
    `<p><b>Key:</b> <code>${escapeHtml(path)}</code> · <b>Effective:</b> ${valueCell(data.effectiveValue)} · ` +
    `<b>Winner:</b> ${escapeHtml(layerLabel(String(data.winningLayer ?? "")))}</p>` +
    '<table class="cfg-explain-table"><thead><tr><th>Layer</th><th>Value</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>`
  );
}
