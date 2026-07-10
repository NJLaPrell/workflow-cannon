/**
 * Canonical webview control styles (R8 buttons + R9 form primitives).
 * @see .github/instructions/cursor-workflow-cannon-ui.instructions.md
 */
export const WC_BASE_CSS = `
.wc-btn:focus-visible,
.wc-tab-btn:focus-visible,
.wc-pill-ready:focus-visible,
.wc-pill-proposed:focus-visible,
.wc-pill-blocked:focus-visible,
.wc-pill-done:focus-visible,
.wc-pill-human:focus-visible,
.wc-cae-readiness-toggle:focus-visible,
.wc-filter-chip:focus-visible {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  outline-offset: 2px;
}
.wc-btn {
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wc-btn-sm { padding: 2px 8px;  font-size: 10px; font-weight: 600; }
.wc-btn-md { padding: 4px 10px; font-size: 11px; font-weight: 500; }
.wc-btn-lg { padding: 7px 12px; font-size: 12px; font-weight: 500; }

.wc-btn-primary   { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.wc-btn-primary:hover { background: var(--vscode-button-hoverBackground); }

.wc-btn-secondary { background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
                    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); }
.wc-btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }

.wc-btn-info {
  background: var(--vscode-textLink-foreground, #4fc1ff);
  color: var(--vscode-editor-background, #1e1e1e);
  border-color: var(--vscode-textLink-foreground, #4fc1ff);
}
.wc-btn-info:hover {
  background: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground, #4fc1ff));
  color: var(--vscode-editor-background, #1e1e1e);
}

.wc-btn-success {
  background: var(--vscode-testing-iconPassed, #4ec9b0);
  color: var(--vscode-editor-background, #1e1e1e);
  border-color: var(--vscode-testing-iconPassed, #4ec9b0);
}
.wc-btn-success:hover {
  background: var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-testing-iconPassed, #4ec9b0));
  color: var(--vscode-editor-background, #1e1e1e);
}

.wc-btn-danger {
  background: var(--vscode-errorForeground, #f44747);
  color: var(--vscode-editor-background, #1e1e1e);
  border-color: var(--vscode-errorForeground, #f44747);
}
.wc-btn-danger:hover {
  background: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground, #f44747));
  color: var(--vscode-editor-background, #1e1e1e);
}

.wc-btn[disabled] { opacity: 0.42; cursor: not-allowed; }

.wc-input, .wc-select, .wc-textarea {
  font: inherit;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  width: 100%;
  box-sizing: border-box;
}
.wc-select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); }
.wc-textarea { font-family: var(--vscode-editor-font-family); }
.wc-field-label { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; opacity: 0.85; }

.wc-callout {
  border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
  border-left-width: 3px;
  border-radius: 4px;
  padding: 6px 8px 6px 6px;
  margin: 8px 0;
}
.wc-callout > p:first-child { margin-top: 0; }
.wc-callout > p:last-child { margin-bottom: 0; }
.wc-callout--success { border-left-color: var(--vscode-testing-iconPassed, #4ec9b0); }
.wc-callout--info    { border-left-color: var(--vscode-textLink-foreground, #4fc1ff); }
.wc-callout--warning { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
.wc-callout--danger  { border-left-color: var(--vscode-errorForeground, #f44747); }
.wc-callout--neutral { border-left-color: var(--vscode-foreground); opacity: 0.85; }
`;
