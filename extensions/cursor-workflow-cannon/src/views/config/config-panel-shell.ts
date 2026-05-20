/**
 * Shared Config panel chrome (toolbar + list host) for sidebar webview and dashboard tab.
 */

export function renderConfigPanelShellHtml(): string {
  return (
    '<section class="dash-card wc-config-panel" aria-label="Configuration">' +
    '<p><b>Workspace configuration</b></p>' +
    '<p class="muted">Edit kit and module keys below. Sensitive or approval-gated keys need <code>WORKSPACE_KIT_POLICY_APPROVAL</code> for the kit process.</p>' +
    '<div class="cfg-toolbar">' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-primary" id="cfg-refresh">Reload</button>' +
    '<button type="button" class="wc-btn wc-btn-md wc-btn-secondary" id="cfg-validate">Validate</button>' +
    '<input type="search" class="cfg-filter" id="cfg-filter" placeholder="Filter keys / description…" />' +
    '<label><input type="checkbox" id="cfg-maintainer" /> Maintainer keys</label>' +
    "</div>" +
    '<div id="cfg-status" class="cfg-status cfg-status-info" role="status"></div>' +
    '<div id="cfg-restart-host"></div>' +
    '<div id="config-list-root"></div>' +
    '<p class="cfg-footnote"><strong>Mutations</strong> run <code>workspace-kit config set|unset</code>. See <code>.ai/POLICY-APPROVAL.md</code> in the repo.</p>' +
    "</section>"
  );
}
