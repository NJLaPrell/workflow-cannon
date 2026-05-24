---
description: "Webview UX rules for the cursor-workflow-cannon extension (Dashboard, Status, Config, Guidance, Drawer). Auto-attached when editing any view source under extensions/cursor-workflow-cannon/src/views/."
applyTo: "extensions/cursor-workflow-cannon/src/views/**/*.{ts,tsx,html,css}"
---

# Webview Styleguide — Agent Rules

Audience: agents only. Apply these rules verbatim when writing or modifying webview HTML/CSS. Do not deliberate; if a rule conflicts with existing code, the rule wins and the existing code is technical debt to migrate when touched.

## Rule index

| ID | Topic |
| --- | --- |
| R1 | Naming + class prefixes |
| R2 | Theme tokens + intent palette + forbidden hex |
| R3 | Typography (allowed/forbidden sizes, scale, escaping) |
| R4 | Spacing (allowed/forbidden values, assignments) |
| R5 | Radii |
| R6 | Borders + focus + drawer shadow |
| R7 | Surface backgrounds |
| R8 | Buttons (canonical system, legacy alias map) |
| R9 | Form controls |
| R10 | Component vocabulary (card, section, KV, chip, stat, tag, tab-badge, callout, row) |
| R11 | Drawer (markup contract, behaviors, field kinds) |
| R12 | Dashboard refresh contract |
| R13 | Accessibility |
| R14 | Shared CSS refactor target |
| R15 | CSP + inline assets |
| R16 | Migration policy |
| R17 | Human copy (product voice) |
| R18 | Loading indicators (spinner, drawer busy, button busy) |

## Files this guide governs

- [extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts)
- [extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts)
- [extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-input-drawer.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-input-drawer.ts)
- [extensions/cursor-workflow-cannon/src/views/status/StatusDashboardPanel.ts](../../extensions/cursor-workflow-cannon/src/views/status/StatusDashboardPanel.ts)
- [extensions/cursor-workflow-cannon/src/views/status/render-status-tab.ts](../../extensions/cursor-workflow-cannon/src/views/status/render-status-tab.ts)
- [extensions/cursor-workflow-cannon/src/views/config/ConfigViewProvider.ts](../../extensions/cursor-workflow-cannon/src/views/config/ConfigViewProvider.ts)
- [extensions/cursor-workflow-cannon/src/views/guidance/GuidancePanel.ts](../../extensions/cursor-workflow-cannon/src/views/guidance/GuidancePanel.ts)
- [extensions/cursor-workflow-cannon/src/views/guidance/render-guidance-panel.ts](../../extensions/cursor-workflow-cannon/src/views/guidance/render-guidance-panel.ts)
- [extensions/cursor-workflow-cannon/src/views/shared/guidance-panel-webview-css.ts](../../extensions/cursor-workflow-cannon/src/views/shared/guidance-panel-webview-css.ts)

---

## R1. Naming

- R1.1 New CSS classes MUST be prefixed `wc-`.
- R1.2 Existing prefixes `dash-`, `cfg-`, `gp-` MUST NOT be extended with new members. Treat them as frozen aliases.
- R1.3 Class names use `kebab-case`. Modifier syntax: `wc-{component}--{intent|variant}` (double dash). Exception: state booleans use `wc-{component}-{state}` (single dash) for parity with existing `wc-filter-active`, `wc-section-empty`.
- R1.4 Stable hooks for JS/host MUST use `data-wc-*` attributes, not classes. Existing examples: `data-wc-action`, `data-wc-track`, `data-wc-filter`, `data-wc-drawer-action`, `data-wc-drawer-field`, `data-wc-drawer-workflow`.

## R2. Theme tokens

R2.1 All color/background/border values MUST resolve through `var(--vscode-*)`. Hex literals are allowed only as the fallback inside `var(--vscode-*, #hex)`.

R2.2 Token map (use the right-hand value verbatim):

| Role | Value |
| --- | --- |
| Sidebar bg | `var(--vscode-sideBar-background)` |
| Editor-panel bg | `var(--vscode-editor-background)` |
| Card bg | `var(--vscode-textCodeBlock-background)` |
| Overlay/drawer bg | `var(--vscode-editorWidget-background)` |
| Foreground | `var(--vscode-foreground)` |
| Muted foreground | `var(--vscode-descriptionForeground, var(--vscode-foreground))` |
| Border | `var(--vscode-widget-border, rgba(127,127,127,.35))` |
| Hover surface | `var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.10))` |
| Focus ring | `var(--vscode-focusBorder)` |
| Primary btn bg | `var(--vscode-button-background)` |
| Primary btn fg | `var(--vscode-button-foreground)` |
| Primary btn hover | `var(--vscode-button-hoverBackground)` |
| Btn border | `var(--vscode-button-border, var(--vscode-contrastBorder, transparent))` |
| Secondary btn bg | `var(--vscode-button-secondaryBackground, var(--vscode-button-background))` |
| Secondary btn fg | `var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))` |
| Secondary btn hover | `var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground))` |
| Input bg | `var(--vscode-input-background)` |
| Input fg | `var(--vscode-input-foreground)` |
| Input border | `var(--vscode-input-border, var(--vscode-widget-border))` |
| Dropdown bg | `var(--vscode-dropdown-background)` |
| Dropdown fg | `var(--vscode-dropdown-foreground)` |
| Badge bg | `var(--vscode-badge-background)` |
| Badge fg | `var(--vscode-badge-foreground)` |
| Code bg | `var(--vscode-textCodeBlock-background)` |

R2.3 Intent palette (use these — do not introduce new accent colors):

| Intent | Value | Aliases (read-only — do not emit on new code) |
| --- | --- | --- |
| `success` | `var(--vscode-testing-iconPassed, #4ec9b0)` | dashboard `ready`, guidance `gp-ok` |
| `info` | `var(--vscode-textLink-foreground, #4fc1ff)` | dashboard `proposed`, wishlist next |
| `warning` | `var(--vscode-editorWarning-foreground, #cca700)` | dashboard `blocked`, guidance `gp-warn` |
| `danger` | `var(--vscode-errorForeground, #f44747)` | CAE bad score, guidance `gp-bad` |
| `neutral` | `var(--vscode-foreground)` with `opacity: 0.55` | dashboard `done`, `research`, `terminal` |

R2.4 Forbidden hex fallbacks (drift from R2.3): `#3fb950`, `#d29922`, `#f85149`. If encountered, replace with R2.3 values when touching the file.

## R3. Typography

R3.1 Body rule per host:

```css
/* sidebar surfaces (DashboardViewProvider, ConfigViewProvider) */
body { font-family: var(--vscode-font-family); font-size: 12px; line-height: 1.4; color: var(--vscode-foreground); }

/* editor-panel surfaces (GuidancePanel, future panels) */
body { font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.42; color: var(--vscode-foreground); }

code { font-family: var(--vscode-editor-font-family); font-size: 11px; }
```

R3.2 Allowed font sizes (px): `22, 15, 14, 13, 12, 11, 10`.
R3.3 Forbidden font sizes (px): `9, 9.5, 10.5, 18`. Round `9` and `9.5` → `10`; round `10.5` → `11`; round `18` → `15`.

R3.4 Type scale:

| Role | Size | Weight | Use |
| --- | --- | --- | --- |
| h1 | `22px` | `650` | Editor-panel title (Guidance only) |
| h2 | `15px` | `600` | Card title in editor panels |
| h3 | `14px` | `600` | Drawer title, Status `h2` |
| body | `12px` (sidebar) / `13px` (editor) | `400` | Default |
| sm | `11px` | `400` | Meta, code, secondary labels |
| xs | `10px` | `600` | Action button labels, tab badges, tags, stat-pill labels |
| num | `15px` | `700` | Stat-pill numerals — MUST also set `font-variant-numeric: tabular-nums` |

R3.5 Inline emphasis MUST use `<b>`. `<strong>` and `<em>` are reserved for upstream-markdown content rendered through `renderMarkdownBoldAfterEscape` and similar helpers.

R3.6 All user-facing text strings MUST be passed through `escapeHtml`/`escapeHtmlAttr` (from [render-dashboard.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts)) or `escapeDrawerHtml` (from [dashboard-input-drawer.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-input-drawer.ts)) before interpolation.

## R4. Spacing

R4.1 Spacing values MUST come from this set (px): `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32`.
R4.2 Forbidden spacing values: `1, 3, 5, 7, 9, 11, 13, 15, 17, 18, 22, 28`. The drawer panel border (`1px`) and the existing `1px 6px` chip padding are grandfathered; do not emit new uses.

R4.3 Canonical spacing assignments:

| Use | Value |
| --- | --- |
| Sidebar shell padding | `2px 8px 8px` |
| Editor-panel shell padding | `16px 20px 24px` |
| Editor-panel max width | `1180px` (`margin: 0 auto`) |
| Card padding | `8px` |
| Card vertical gap (`margin`) | `10px 0` |
| Row padding | `4px 6px` |
| Row vertical gap (flex `gap`) | `4px` |
| Action cluster gap | `6px` |
| Chip / tag gap | `4px` |
| Drawer panel padding | `10px 12px 12px` |
| Drawer field gap | `8px` |
| KV row vertical gap | `2px` |

## R5. Radii

| Component | Radius |
| --- | --- |
| Card (`.wc-card`) | `6px` |
| Drawer panel (`.wc-drawer-panel`) | `6px` |
| Button — any size | `4px` |
| Input / select / textarea | `4px` |
| Stat pill, tab badge | `7px` |
| Inline tag, agent chip | `4px` |
| Filter chip | `12px` (oval) |

## R6. Borders

- R6.1 Default border: `1px solid var(--vscode-widget-border, rgba(127,127,127,.35))`.
- R6.2 Accent left-border (state-coded section, blocker card, decision, callout): `3px solid {intent}` + `padding-left: 6px` on the bordered element.
- R6.3 Focus state: rely on `:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px }`. Do not remove user-agent focus styling without a replacement.
- R6.4 Drawer panel shadow: `0 6px 24px rgba(0,0,0,0.35)`. Scrim: `background: rgba(0,0,0,0.5)`.

## R7. Surfaces

- R7.1 Sidebar webviews (`DashboardViewProvider`, `ConfigViewProvider`) MUST set `body { background: var(--vscode-sideBar-background) }`.
- R7.2 Editor-panel webviews (`GuidancePanel`, future panels) MUST set `body { background: var(--vscode-editor-background) }`.
- R7.3 Cards inside any surface MUST set `background: var(--vscode-textCodeBlock-background)`.
- R7.4 Drawer panel MUST set `background: var(--vscode-editorWidget-background); color: var(--vscode-editorWidget-foreground)`.
- R7.5 Hover surfaces MUST use `var(--vscode-toolbar-hoverBackground, rgba(127,127,127,.10))`.

## R8. Buttons

R8.1 Canonical button system: `.wc-btn` base × one size class × one intent class.

```css
.wc-btn {
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
}
.wc-btn-sm { padding: 2px 8px;  font-size: 10px; font-weight: 600; }
.wc-btn-md { padding: 4px 10px; font-size: 11px; font-weight: 500; }
.wc-btn-lg { padding: 7px 12px; font-size: 12px; font-weight: 500; }

.wc-btn-primary   { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.wc-btn-primary:hover { background: var(--vscode-button-hoverBackground); }

.wc-btn-secondary { background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
                    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); }
.wc-btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }

.wc-btn[disabled] { opacity: 0.42; cursor: not-allowed; }
```

R8.2 Existing button classes are aliases. New code MUST emit `wc-btn` markup; do not extend the alias families.

| Legacy class | Canonical replacement |
| --- | --- |
| `.dash-row-action` | `.wc-btn .wc-btn-sm .wc-btn-primary` |
| `.dash-row-action-secondary`, `-tertiary`, `-info` | `.wc-btn .wc-btn-sm .wc-btn-secondary` |
| `.wc-rec-start-btn` | `.wc-btn .wc-btn-sm .wc-btn-primary` |
| `.wc-rec-wl-view` | `.wc-btn .wc-btn-sm .wc-btn-secondary` |
| `.cfg-btn` | `.wc-btn .wc-btn-md .wc-btn-secondary` |
| `.cfg-btn.cfg-primary` | `.wc-btn .wc-btn-md .wc-btn-primary` |
| `.gp-action-row button` | `.wc-btn .wc-btn-lg .wc-btn-secondary` |
| `.gp-primary` | `.wc-btn .wc-btn-lg .wc-btn-primary` |
| `.wc-drawer-btn-secondary` | `.wc-btn .wc-btn-md .wc-btn-secondary` |
| `.wc-drawer-btn-primary` | `.wc-btn .wc-btn-md .wc-btn-primary` |

R8.3 `.wc-filter-chip` is NOT a button alias. It is a distinct component (R10.4).

R8.4 Every `<button>` MUST set `type="button"` (otherwise it submits forms inside the drawer). Already enforced in [render-dashboard.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts).

R8.5 Buttons whose visible text is shorter than 4 characters or icon-only MUST set `aria-label`.

## R9. Form controls

```css
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
```

Aliases: `.cfg-textarea` → `.wc-textarea`; `.cfg-select` → `.wc-select`; `.wc-drawer-input` → `.wc-input`; `.wc-drawer-select` → `.wc-select`; `.wc-drawer-textarea` → `.wc-textarea`.

## R10. Component vocabulary

R10.1 Card — `.wc-card` (alias `.dash-card`):
```css
.wc-card { border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.35));
           border-radius: 6px; padding: 8px; margin: 10px 0;
           background: var(--vscode-textCodeBlock-background); }
```
Card title MUST be `<p><b>Title</b></p>` until `.wc-card-title` is introduced.

R10.2 Collapsible section — `.wc-section` (alias `details.status-section`):
- Open-state preserved via `data-wc-track="<stable-id>"` (already implemented in [render-dashboard.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts) `wcTrackAttr`).
- Intent set via `data-wc-intent="success|info|warning|danger|neutral"` (alias for the existing `data-wc-filter` values).
- Empty variant: add class `wc-section-empty` (`opacity: 0.32; pointer-events: none`).

R10.3 KV row — `.wc-kv` containing `.wc-kv-label` and `.wc-kv-val`. Container uses `.wc-kv-block`. Mirrors current `.wc-status-kv*`.

R10.4 Filter chip — `.wc-chip` (alias `.wc-filter-chip`):
```css
.wc-chip { padding: 2px 9px; font-size: 11px; font-weight: 500;
           border-radius: 12px; cursor: pointer;
           border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.45));
           background: transparent; color: var(--vscode-foreground); opacity: 0.6; }
.wc-chip:hover { opacity: 0.85; }
.wc-chip-active { opacity: 1; background: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  border-color: var(--vscode-button-border, var(--vscode-contrastBorder, transparent)); }
```
Intent variants override active background to transparent and tint border + text via R2.3.

R10.5 Stat pill — `.wc-stat` containing `.wc-stat-num` (R3.4 num) and `.wc-stat-lbl` (R3.4 xs). 4-column grid. Clickable variant uses `<button class="wc-stat wc-stat--clickable">`; hover MUST tint border to the intent color.

R10.6 Tag (inline label) — `.wc-tag` + `.wc-tag--{intent}`. `4px` radius, `10px` text, `padding: 1px 6px`.

R10.7 Tab badge — `.wc-tab-badge` + `.wc-tab-badge--{intent}`. `7px` radius, `10px` text, `min-width: 15px`.

R10.8 Callout — `.wc-callout` + `.wc-callout--{intent}` (alias `.gp-callout`, `.gp-ok|warn|bad`). Left border `3px solid {intent}` per R6.2; box border `1px solid var(--vscode-widget-border)`.

R10.9 Row — `.wc-row` (alias `.dash-row`). `display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 4px 6px; border-radius: 4px; background: var(--vscode-textCodeBlock-background)`.

## R11. Drawer

R11.1 The drawer markup contract is owned by [dashboard-input-drawer.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-input-drawer.ts) (`DrawerFormSpec`, `renderDrawerFormHtml`). New mutation flows MUST construct a `DrawerFormSpec` and POST `wcDrawerOpen` rather than calling `vscode.window.showInputBox` / `showQuickPick`.

R11.2 Drawer CSS MUST be sourced from a single shared constant (target: `src/views/shared/wc-drawer-css.ts` exporting `WC_DRAWER_CSS`). Until that file exists, copy the block verbatim from [DashboardViewProvider.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts); keep [GuidancePanel.ts](../../extensions/cursor-workflow-cannon/src/views/guidance/GuidancePanel.ts) in sync when it embeds the same drawer host.

R11.3 Required attributes:
- Panel: `role="dialog"`, `aria-modal="true"`, `data-wc-drawer-workflow="<workflowId>"`.
- Scrim: `data-wc-drawer-action="backdrop"` and `aria-hidden` toggled with the host class `wc-drawer-host--hidden`.
- Footer buttons: `data-wc-drawer-action="cancel"` / `"submit"`.
- Fields: `data-wc-drawer-field="<id>"`.

R11.4 Required behaviors (already in shells; preserve when modifying):
- Escape key → posts `{ type: "drawerCancel" }`.
- Backdrop click → posts `{ type: "drawerCancel" }`.
- Submit button → harvests every `[data-wc-drawer-field]` value into `{ type: "drawerSubmit", values }`.
- Submit MUST show drawer busy overlay per **R18.4–R18.5** before posting `drawerSubmit`.

R11.5 Field kinds are `text | textarea | select | summary` (`DrawerFormField` union). Do not invent new kinds without extending the union and the renderer.

## R12. Dashboard refresh contract

R12.1 First load installs the full HTML; subsequent updates MUST swap only `#root` via `postMessage` so `<details open>` state is preserved (`dashboardRootShellReady` flag in [DashboardViewProvider.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts)). Clear footer refresh busy state (`setButtonBusy`) when applying `wcReplaceRoot` (R18.3).

R12.2 Every collapsible whose state must survive a refresh MUST carry `data-wc-track="<stable-id>"` (use the `wcTrackAttr` helper).

R12.3 Embedded panel HTML coming from another renderer (e.g. `renderStatusTabInnerHtml`) MUST be passed through an id-namespacing helper (`namespaceEmbeddedCaePanelHtml` pattern) before insertion to avoid duplicate `id` attributes.

## R13. Accessibility

- R13.1 Color is never the sole signal. Pair every intent color with a text label or an icon glyph (existing pattern: CAE check `✓` / `!`, status-section labels `ready`/`blocked`).
- R13.2 Minimum legible text size is `10px`; do not go smaller.
- R13.3 Interactive elements MUST be reachable via Tab and visibly focused (R6.3).
- R13.4 Drawer is a modal: focus MUST be trappable inside `.wc-drawer-panel` while open. (Current shells rely on Escape to exit; do not regress that.)

## R14. Refactor target (when adding new shared CSS)

Land shared CSS at:
- `src/views/shared/wc-base-css.ts` exporting `WC_BASE_CSS` — tokens, body, buttons (R8.1), inputs (R9), card (R10.1), chip (R10.4), tag (R10.6), tab-badge (R10.7), callout (R10.8), row (R10.9), loading spinner (R18.1).
- `src/views/shared/wc-drawer-css.ts` exporting `WC_DRAWER_CSS` (R11.2, drawer busy overlay R18.4).
- `src/views/shared/guidance-panel-webview-css.ts` exporting `GUIDANCE_PANEL_WEBVIEW_CSS` — frozen `gp-*` layout, tables, forms, and drawer hooks shared by **GuidancePanel** and the dashboard **CAE** tab embed (`DashboardViewProvider` composes it after dashboard/status CSS; see `test/dashboard-guidance-stylesheet.test.mjs`).

Each `*ViewProvider.ts` then composes `<style>${WC_BASE_CSS}${WC_DRAWER_CSS}${GUIDANCE_PANEL_WEBVIEW_CSS?}${LOCAL_CSS}</style>` as applicable. Local CSS holds only surface-specific layout (e.g. dashboard `.dash-quick-actions`, `.wc-dash-cae-host` embed overrides, status `.wc-status-tab-embedded`).

## R15. CSP and inline assets

- R15.1 Webview CSP MUST include `style-src 'unsafe-inline'` and `script-src ${webview.cspSource} 'unsafe-inline'`. Do not relax `default-src 'none'`.
- R15.2 Bootstrap JS MUST be inlined in the HTML (current pattern). Do not introduce external script URLs.
- R15.3 Images, if added, MUST be served from `extensionUri` via `webview.asWebviewUri` and added to `localResourceRoots`.

## R16. Migration policy

When modifying a file that contains a legacy class:
1. Leave the legacy class name where it appears in unmodified rows.
2. For any row you author or rewrite, emit the canonical class names from §R8 / §R9 / §R10.
3. If the legacy CSS rule is the only remaining definition for a class you replaced, delete that rule.
4. Do not perform repository-wide renames in unrelated files unless explicitly requested.

## R17. Human copy (product voice)

The Dashboard, Status, Config, and Guidance webviews are **operator-facing product UI**, not agent runbooks. Copy MUST stay minimal and intentional.

R17.1 **No unsolicited meta copy.** Do not add muted paragraphs, “Note:” callouts, footnotes, or scope explanations unless the user or an approved spec explicitly requests that exact text. Forbidden patterns include explaining kit/data-model semantics (execution queue vs wishlist, `stateSummary` vs rollups, `wishlist_intake`, persistence backends, policy lanes) in the webview body.

R17.2 **No CLI or command references in webview copy.** Do not tell operators to run `wk`, `wk run`, `pnpm exec`, `workspace-kit`, `list-tasks`, `get-next-actions`, or other terminal commands inside rendered HTML. Navigation belongs in labels, buttons, tabs, and row actions — not command strings. (`<code>` in copy is for displaying **user data** such as phase keys or task ids, not tool invocations.)

R17.3 **Allowed copy without prior approval:** section titles, counts in summaries (`Ready (3)`), button labels, empty states (`No ready tasks.`, `No Items`), field labels, validation errors tied to the current action, and short `title` / `aria-label` tooltips that describe the control (not the kit).

R17.4 **When truncation or preview limits exist:** rely on expandable `<details>` phase buckets and row lists; do not add “preview capped” or “use CLI for full list” helper lines unless explicitly requested.

R17.5 **Agent/admin lanes stay out of operator chrome.** Policy approval, `policyApproval`, CAE mutation rationale, and maintainer delivery mechanics belong in drawer copy only when that drawer is part of an approved governance flow — not as ambient dashboard footnotes.

## R18. Loading indicators

Use the shared spinner whenever the webview waits on the extension host or kit (drawer submit, refresh, inline saves). Do not leave controls looking idle during multi-second work.

R18.1 **Spinner markup + CSS** (canonical — copy verbatim; target home: `WC_BASE_CSS` in R14):

```css
@keyframes wc-spin {
  to { transform: rotate(360deg); }
}
.wc-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--vscode-widget-border, rgba(127,127,127,.35));
  border-top-color: var(--vscode-button-background, #0078d4);
  border-radius: 50%;
  animation: wc-spin 0.75s linear infinite;
  flex-shrink: 0;
}
.wc-spinner-inline {
  width: 12px;
  height: 12px;
  border-width: 2px;
}
.wc-btn-loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
```

R18.2 **Inline status row** — pair spinner + short label in a flex row (`display: inline-flex; align-items: center; gap: 6px; font-size: 11px`). Example: `.dash-phase-saving` with `<span class="wc-spinner wc-spinner-inline" aria-hidden="true"></span> Saving…`. Container SHOULD set `aria-live="polite"`.

R18.3 **Button busy** — before posting a host message that triggers kit I/O, call `setButtonBusy(el, true, '<label>')` (dashboard bootstrap in [DashboardViewProvider.ts](../../extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts)). Pattern:

```html
<span class="wc-btn-loading">
  <span class="wc-spinner wc-spinner-inline" aria-hidden="true"></span>
  <span>Refreshing…</span>
</span>
```

- Preserve original button HTML in `data-wc-original-html`; restore with `setButtonBusy(el, false)` when the operation completes (e.g. after `wcReplaceRoot`).
- Refresh footer button label: **Refreshing…**

R18.4 **Drawer busy overlay** — on drawer submit, call `setDrawerBusy(true)` **before** `{ type: "drawerSubmit" }`. Inject (once per open drawer) into `.wc-drawer-panel`:

```html
<div class="wc-drawer-loading" aria-live="polite">
  <div class="wc-spinner" aria-hidden="true"></div>
  <span class="wc-drawer-loading-label">Updating task phase…</span>
</div>
```

Drawer overlay CSS (with drawer block in R11.2):

```css
.wc-drawer-panel--busy .wc-drawer-fields,
.wc-drawer-panel--busy .wc-drawer-footer,
.wc-drawer-panel--busy .wc-drawer-header {
  pointer-events: none;
  opacity: 0.45;
}
.wc-drawer-loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
  backdrop-filter: blur(1px);
}
.wc-drawer-loading[hidden] { display: none !important; }
.wc-drawer-loading-label { font-size: 12px; font-weight: 600; text-align: center; line-height: 1.35; }
```

R18.5 **Drawer busy behaviors** (preserve when modifying shells):
- While `.wc-drawer-panel--busy` is set: disable all `[data-wc-drawer-action]` buttons; **suppress** Escape, backdrop, and Cancel (do not post `drawerCancel`).
- On `{ type: "wcDrawerValidation" }`: call `setDrawerBusy(false)` before showing the error.
- On `{ type: "wcDrawerClose" }`: overlay is destroyed with the drawer host — no extra cleanup.
- Set local UI lock `setUiInteraction('drawer-busy', true|false)` while overlay is visible (defers `wcReplaceRoot` per R12.1).

R18.6 **Default overlay labels** (`drawerBusyLabelForWorkflow` — operator copy, not CLI):
- `assign-task-phase` → **Updating task phase…**
- `accept-proposed` → **Accepting and assigning phase…**
- `register-phase-catalog` → **Updating phase catalog…**
- `add-wishlist` → **Creating wishlist item…**
- `add-phase-note` → **Adding phase note…**
- fallback → **Running kit command…**

R18.7 **Forbidden:** disabling a control with no visible progress; inventing new spinner sizes or colors outside R18.1; using `aria-hidden="true"` on the status label (only the decorative ring is hidden).
