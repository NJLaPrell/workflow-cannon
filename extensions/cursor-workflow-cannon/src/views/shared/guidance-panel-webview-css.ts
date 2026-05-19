/** Guidance panel webview styles (gp-*, drawer) — shared with embedded dashboard CAE tab. */
export const GUIDANCE_PANEL_WEBVIEW_CSS = `
html, body { margin: 0; min-height: 100%; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); font-size: 13px; line-height: 1.42; }
    .gp-shell { max-width: 1180px; margin: 0 auto; padding: 18px 22px 28px; }
    .gp-head, .gp-band { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .gp-head { border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding-bottom: 14px; }
    .gp-kicker { margin: 0 0 4px; opacity: .72; text-transform: uppercase; font-size: 11px; }
    h1 { margin: 0; font-size: 22px; font-weight: 650; }
    h2 { margin: 0 0 10px; font-size: 15px; }
    p { margin: 4px 0; }
    .gp-action-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 10px; align-items: center; }
    .gp-tabs { display: flex; gap: 4px; margin: 16px 0 12px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); }
    .gp-tabs button { background: transparent; color: var(--vscode-foreground); border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; cursor: pointer; }
    .gp-tabs button.is-active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-button-background); }
    .gp-inline-result { min-height: 18px; margin: 4px 0 12px; opacity: .88; }
    .gp-inline-result.gp-ok, .gp-inline-result.gp-warn { border: 0; }
    .gp-tab-panel { display: none; }
    .gp-tab-panel.is-active { display: block; }
    .gp-callout { display: flex; gap: 12px; align-items: baseline; margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-left-width: 4px; }
    .gp-callout span { opacity: .84; }
    .gp-ok { border-color: var(--vscode-testing-iconPassed, #3fb950); }
    .gp-warn { border-color: var(--vscode-inputValidation-warningBorder, #d29922); }
    .gp-bad { border-color: var(--vscode-errorForeground, #f85149); }
    .gp-pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .gp-pill { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 999px; padding: 4px 8px; }
    .gp-pill b { font-weight: 650; }
    .gp-grid { display: grid; gap: 10px; margin: 12px 0; }
    .gp-status-grid { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 1px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); margin: 12px 0; }
    .gp-status-grid div { padding: 9px 11px; background: var(--vscode-sideBar-background); }
    .gp-status-grid b, .gp-status-grid span { display: block; }
    .gp-status-grid span { margin-top: 4px; word-break: break-word; }
    .gp-warning-list { border-left: 3px solid var(--vscode-inputValidation-warningBorder, #d29922); padding-left: 10px; margin: 10px 0 12px; }
    .gp-warning-list p { display: flex; gap: 8px; margin: 4px 0; }
    .gp-table-tools { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 150px; gap: 8px; margin: 10px 0; }
    .gp-table-tools input, .gp-table-tools select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 4px; padding: 6px 8px; }
    .gp-source { display: inline-block; padding: 2px 6px; border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 999px; }
    .gp-source-default { opacity: .78; }
    .gp-source-workspace, .gp-source-override { border-color: var(--vscode-focusBorder); }
    .gp-row-actions { display: flex; flex-wrap: wrap; gap: 4px; min-width: 220px; align-items: center; }
    .gp-group-row td { background: var(--vscode-sideBar-background); font-weight: 700; text-transform: uppercase; font-size: 11px; opacity: .82; }
    .gp-bad-text { color: var(--vscode-errorForeground); }
    .gp-editor { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 12px; margin: 12px 0; }
    .gp-form-grid { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 8px; }
    .gp-form-grid label, .gp-editor-block { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
    .gp-form-grid input, .gp-form-grid select, .gp-editor-block input, .gp-editor-block textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 4px; padding: 6px 8px; font: inherit; font-weight: 400; }
    .gp-editor-block { margin-top: 8px; }
    .gp-markdown-preview { border: 1px dashed var(--vscode-widget-border, rgba(127,127,127,.35)); min-height: 36px; padding: 8px 10px; margin-top: 8px; }
    .gp-markdown-preview h3, .gp-markdown-preview h4 { margin: 0 0 6px; }
    .gp-picker { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 8px; margin: 10px 0; }
    .gp-picker-group { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 8px; }
    .gp-picker-group legend { font-weight: 700; font-size: 11px; text-transform: uppercase; }
    .gp-pick { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 5px 0; }
    .gp-pick b { font-size: 11px; font-weight: 500; opacity: .78; }
    .gp-grid-4 { grid-template-columns: repeat(4, minmax(120px, 1fr)); }
    .gp-grid-3 { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
    .gp-grid div { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 10px 12px; }
    .gp-grid b, .gp-grid span { display: block; }
    .gp-grid span { margin-top: 5px; font-size: 20px; font-weight: 650; }
    .gp-muted { opacity: .74; }
    .gp-versions-dump { margin: 12px 0 0; padding: 10px 12px; max-height: 420px; overflow: auto; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); border-radius: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35)); padding: 8px 9px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; opacity: .76; }
    .gp-bulk-col { width: 30px; text-align: center; }
    small { display: block; opacity: .74; margin-top: 3px; }
    code { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .wc-drawer-host { position: fixed; inset: 0; z-index: 20000; pointer-events: none; }
    .wc-drawer-host--hidden { display: none !important; }
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-scrim,
    .wc-drawer-host:not(.wc-drawer-host--hidden) .wc-drawer-panel {
      pointer-events: auto;
    }
    .wc-drawer-scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
    .wc-drawer-panel {
      position: absolute; left: 8px; right: 8px; bottom: 8px; max-height: 78vh; overflow: auto;
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
      border-radius: 8px; padding: 10px 12px 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    }
    .wc-drawer-title { margin: 0 0 6px 0; font-size: 14px; font-weight: 600; }
    .wc-drawer-desc { margin: 0 0 10px 0; opacity: 0.9; line-height: 1.35; }
    .wc-drawer-validation { margin: 0 0 8px 0; padding: 6px 8px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .wc-drawer-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    .wc-drawer-field-label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 4px; }
    .wc-drawer-input, .wc-drawer-textarea, .wc-drawer-select {
      width: 100%; box-sizing: border-box; font-family: var(--vscode-font-family); font-size: 12px;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, rgba(127,127,127,.35)); border-radius: 4px; padding: 4px 6px;
    }
    .wc-drawer-textarea { resize: vertical; min-height: 48px; }
    .wc-drawer-summary-body { font-size: 12px; line-height: 1.4; padding: 6px 8px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .wc-drawer-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 720px) { .gp-head, .gp-band { align-items: flex-start; flex-direction: column; } .gp-grid-4, .gp-grid-3, .gp-status-grid, .gp-table-tools, .gp-form-grid, .gp-picker { grid-template-columns: 1fr; } .gp-tabs { overflow-x: auto; } }
`;
