/**
 * Shared Config panel chrome (toolbar + list host) for sidebar webview and dashboard tab.
 */

export const CONFIG_QUICK_SETTING_KEYS = [
  "kit.agentRole",
  "kit.currentPhase",
  "kit.planningGenerationPolicy",
  "kit.agentGuidance"
] as const;

export function renderConfigQuickSettingsHtml(): string {
  const buttons = CONFIG_QUICK_SETTING_KEYS.map(
    (key) =>
      `<button type="button" class="wc-btn wc-btn-sm wc-btn-secondary" data-wc-action="config-jump-key" data-key="${key}">${key}</button>`
  ).join("");
  return (
    '<div class="cfg-quick-settings" aria-label="Quick settings">' +
    "<p class=\"muted\"><b>Quick settings</b> — jump to a common key</p>" +
    `<div class="cfg-quick-settings-btns">${buttons}</div>` +
    "</div>"
  );
}

export function renderConfigPanelShellHtml(): string {
  return (
    '<section class="dash-card wc-config-panel" aria-label="Configuration">' +
    '<p><b>Workspace configuration</b></p>' +
    '<p class="muted">Canonical editor: <b>Dashboard → Config</b> tab. Edit kit and module keys below; approval-gated keys need <code>WORKSPACE_KIT_POLICY_APPROVAL</code> or dashboard policy flows.</p>' +
    renderConfigQuickSettingsHtml() +
    '<div class="cfg-toolbar">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" id="cfg-refresh">Reload</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" id="cfg-validate">Validate</button>' +
    '<input type="search" class="cfg-filter" id="cfg-filter" placeholder="Filter keys / description…" />' +
    '<label><input type="checkbox" id="cfg-maintainer" /> Maintainer keys</label>' +
    "</div>" +
    '<div id="cfg-status" class="cfg-status cfg-status-info" role="status"></div>' +
    '<div id="cfg-restart-host"></div>' +
    '<div id="cfg-explain-host" class="cfg-explain-host" aria-live="polite"></div>' +
    '<div id="config-list-root"><p class="cfg-muted cfg-loading">Loading configuration…</p></div>' +
    '<p class="cfg-footnote"><strong>Mutations</strong> run <code>workspace-kit config set|unset</code>. See <code>.ai/POLICY-APPROVAL.md</code> in the repo.</p>' +
    "</section>"
  );
}
