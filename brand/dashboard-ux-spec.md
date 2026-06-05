# Workflow Cannon — Dashboard UX Spec
**Version 2.0 · June 2026**
Supersedes the ad-hoc CSS in `render-dashboard.ts` for the components listed below.
All CSS variables use the VS Code webview token mapping from `brand.md §Extension`.

---

## 1. Design Principles (Dashboard)

| Principle | Rule |
|---|---|
| **Activity first** | What an agent is doing *right now* is always the most prominent information. |
| **Color = health** | Green = running, Amber = waiting/review, Red = blocked, Grey = idle/done. Never use color for decoration alone. |
| **Gradient signals** | Active states earn a tinted background gradient. Idle states are flat. |
| **Animate sparingly** | Only truly live states (status = active/running) get motion. Everything else is static. |
| **VSCode-safe** | All colors reference `--vscode-*` tokens. No hardcoded colors in `.ts` output. |

---

## 2. CSS Token Mapping

Declare once at the top of the webview `<style>` block, after the existing `--vscode-*` mappings:

```css
/* Workflow Cannon design tokens — dashboard */
:root {
  --wc-accent:        var(--vscode-button-background, #FF5F1F);
  --wc-accent-hover:  var(--vscode-button-hoverBackground, #FF8A4C);
  --wc-fg:            var(--vscode-foreground, #F0F0F0);
  --wc-muted:         color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  --wc-border:        var(--vscode-widget-border, rgba(127,127,127,.35));
  --wc-surface:       var(--vscode-editor-background, #1A1A1A);
  --wc-bg:            var(--vscode-sideBar-background, #0F0F0F);

  /* Status palette — fixed, do not map to VSCode tokens */
  --wc-green:  #22C55E;
  --wc-amber:  #F59E0B;
  --wc-red:    #EF4444;
  --wc-blue:   #3B82F6;

  /* Status tints (background use) */
  --wc-green-tint:  rgba(34, 197, 94,  0.07);
  --wc-amber-tint:  rgba(245,158, 11,  0.07);
  --wc-red-tint:    rgba(239, 68, 68,  0.07);
  --wc-blue-tint:   rgba( 59,130,246,  0.07);

  /* Status borders */
  --wc-green-border: rgba(34, 197, 94,  0.20);
  --wc-amber-border: rgba(245,158, 11,  0.20);
  --wc-red-border:   rgba(239, 68, 68,  0.20);
  --wc-blue-border:  rgba( 59,130,246,  0.20);
}
```

---

## 3. Banner

### Spec

**Purpose:** Persistent panel header. Always visible at the top of the dashboard webview, above the tab bar.
**Height:** 72–96px (flex, content-driven). Never less than 72px, never more than 96px.
**Position:** Pinned — `position: sticky; top: 0; z-index: 10`.

### Layout (left → right)

| Zone | Content | Width |
|---|---|---|
| Mark | Cannon SVG mark, 28×28px | fixed, flex-shrink: 0 |
| Identity | Wordmark "Workflow Cannon" (13px/800) + tagline "workspace-kit" (9.5px/500 muted) | flex-shrink: 0 |
| Divider | 1px vertical rule, 32px tall | fixed |
| Status zone | Status dot + label + current task text | flex: 1 |

### Status zone rules

The status zone reflects `agentStatus.kind` from the render data:

| `kind` value | Dot color | Label text | Dot animation |
|---|---|---|---|
| `active` / `running` | `--wc-green` | "Running" | Pulsing (see keyframe) |
| `awaiting_input` / `waiting` | `--wc-amber` | "Awaiting input" | None |
| `blocked` | `--wc-red` | "Blocked" | None |
| `awaiting_instruction` / `idle` | `--wc-muted` (grey) | "Idle" | None |
| `done` | `--wc-blue` | "Done" | None |

The banner background gets a matching color glow:

```
active  → background: linear-gradient(135deg, var(--wc-green-tint) 0%, var(--wc-surface) 60%)
waiting → background: linear-gradient(135deg, var(--wc-amber-tint) 0%, var(--wc-surface) 60%)
blocked → background: linear-gradient(135deg, var(--wc-red-tint)   0%, var(--wc-surface) 60%)
idle    → background: var(--wc-surface)   (no gradient, flat)
```

### CSS

```css
/* Keyframe — declare once, shared */
@keyframes wc-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}

.wc-banner {
  display:         flex;
  align-items:     center;
  gap:             10px;
  width:           100%;
  box-sizing:      border-box;
  min-height:      72px;
  max-height:      96px;
  padding:         10px 12px;
  border-top:      2px solid var(--wc-accent);
  border-bottom:   1px solid var(--wc-border);
  position:        sticky;
  top:             0;
  z-index:         10;
  /* background set inline via data-agent-status-kind */
  transition:      background 0.5s ease;
}

/* Per-state backgrounds — applied as CSS class or inline style */
.wc-banner[data-agent-status-kind="active"]  { background: linear-gradient(135deg, var(--wc-green-tint) 0%, var(--wc-surface) 60%); }
.wc-banner[data-agent-status-kind="waiting"] { background: linear-gradient(135deg, var(--wc-amber-tint) 0%, var(--wc-surface) 60%); }
.wc-banner[data-agent-status-kind="blocked"] { background: linear-gradient(135deg, var(--wc-red-tint)   0%, var(--wc-surface) 60%); }
.wc-banner[data-agent-status-kind="idle"],
.wc-banner[data-agent-status-kind="awaiting_instruction"] { background: var(--wc-surface); }

.wc-banner-mark    { flex-shrink: 0; width: 28px; height: 28px; opacity: 0.95; }

.wc-banner-identity {
  flex-shrink:     0;
  display:         flex;
  flex-direction:  column;
  gap:             2px;
}
.wc-banner-name {
  font-size:       13px;
  font-weight:     800;
  color:           var(--wc-fg);
  letter-spacing:  -0.01em;
  line-height:     1;
}
.wc-banner-tagline {
  font-size:       9.5px;
  font-weight:     500;
  color:           var(--wc-muted);
  letter-spacing:  0.04em;
  line-height:     1;
}

.wc-banner-divider {
  width:           1px;
  height:          32px;
  background:      var(--wc-border);
  flex-shrink:     0;
}

.wc-banner-status {
  flex:            1;
  min-width:       0;
  display:         flex;
  flex-direction:  column;
  gap:             3px;
}
.wc-banner-status-row {
  display:         flex;
  align-items:     center;
  gap:             6px;
}

/* Status dot */
.wc-status-dot {
  width:           7px;
  height:          7px;
  border-radius:   50%;
  flex-shrink:     0;
  /* color set via CSS var or inline */
}
.wc-status-dot--active  { background: var(--wc-green); box-shadow: 0 0 5px var(--wc-green); animation: wc-pulse 1.6s ease-in-out infinite; }
.wc-status-dot--waiting { background: var(--wc-amber); box-shadow: 0 0 5px var(--wc-amber); }
.wc-status-dot--blocked { background: var(--wc-red);   box-shadow: 0 0 5px var(--wc-red);   }
.wc-status-dot--idle    { background: var(--wc-muted); }
.wc-status-dot--done    { background: var(--wc-blue);  }

.wc-banner-status-label {
  font-size:       11px;
  font-weight:     600;
  line-height:     1;
  /* color matches dot — set class or inline: */
  /* --active: var(--wc-green) / --waiting: var(--wc-amber) / etc. */
}
.wc-banner-status-label--active  { color: var(--wc-green); }
.wc-banner-status-label--waiting { color: var(--wc-amber); }
.wc-banner-status-label--blocked { color: var(--wc-red);   }
.wc-banner-status-label--idle    { color: var(--wc-muted); }
.wc-banner-status-label--done    { color: var(--wc-blue);  }

.wc-banner-task {
  font-size:       10.5px;
  color:           var(--wc-muted);
  white-space:     nowrap;
  overflow:        hidden;
  text-overflow:   ellipsis;
  line-height:     1.3;
}
```

### HTML template

```html
<!-- data-agent-status-kind drives the background class -->
<header class="wc-banner" data-agent-status-kind="{{kind}}">
  <!-- Inline the SVG mark directly for correct sizing -->
  <svg class="wc-banner-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="14" cy="46" r="10" fill="none" stroke="#FF5F1F" stroke-width="3.5"/>
    <circle cx="14" cy="46" r="3" fill="#FF5F1F"/>
    <rect x="12" y="22" width="42" height="14" rx="7" fill="#FF5F1F"/>
    <rect x="8"  y="26" width="12" height="14" rx="3" fill="#CC3D00"/>
    <rect x="50" y="24" width="8"  height="10" rx="3" fill="#CC3D00"/>
  </svg>

  <div class="wc-banner-identity">
    <span class="wc-banner-name">Workflow Cannon</span>
    <span class="wc-banner-tagline">workspace-kit</span>
  </div>

  <div class="wc-banner-divider"></div>

  <div class="wc-banner-status">
    <div class="wc-banner-status-row">
      <span class="wc-status-dot wc-status-dot--{{statusClass}}"></span>
      <span class="wc-banner-status-label wc-banner-status-label--{{statusClass}}">{{statusLabel}}</span>
    </div>
    <span class="wc-banner-task">{{currentTaskId}} · {{currentTaskTitle}}</span>
  </div>
</header>
```

Where `{{kind}}` = raw `agentStatus.kind`, `{{statusClass}}` = one of `active | waiting | blocked | idle | done`, `{{statusLabel}}` = human label string, `{{currentTaskId}}` + `{{currentTaskTitle}}` from the top `agentStatusRenderRows` entry.

---

## 4. Tab Bar — Segmented Control (Option A)

### Spec

**Replaces:** `.wc-tab-bar` / `.wc-tab-btn` / `.wc-tab-active`
**Tabs:** Overview · Planning · Queue · Status · Config · CAE (6 tabs)
**Active state:** Orange filled block behind the active tab button
**Badge:** Numeric count chip on Queue tab (ready = green, blocked = red)
**Icon prefix:** Optional — one Unicode glyph per tab, 10px, 70% opacity

### CSS

```css
/* Remove old .wc-tab-bar and .wc-tab-btn rules, replace with: */

.wc-tab-bar {
  display:          flex;
  align-items:      center;
  background:       var(--wc-surface);
  border:           1px solid var(--wc-border);
  border-radius:    6px;
  padding:          3px;
  gap:              2px;
  margin:           8px 10px;
  overflow-x:       auto;
  -ms-overflow-style: none;
  scrollbar-width:  none;
}
.wc-tab-bar::-webkit-scrollbar { display: none; }

.wc-tab-btn {
  flex:             1;
  min-width:        0;
  display:          flex;
  align-items:      center;
  justify-content:  center;
  gap:              3px;
  padding:          5px 6px;
  border:           none;
  border-radius:    4px;
  background:       transparent;
  color:            var(--wc-muted);
  font-size:        11px;
  font-weight:      500;
  font-family:      inherit;
  cursor:           pointer;
  white-space:      nowrap;
  transition:       background 0.15s, color 0.15s;
}
.wc-tab-btn:hover {
  color:            var(--wc-fg);
  background:       rgba(255,255,255,0.04);
}
.wc-tab-btn.wc-tab-active {
  background:       var(--wc-accent);
  color:            #ffffff;
  font-weight:      600;
}
.wc-tab-btn.wc-tab-active:hover {
  background:       var(--wc-accent-hover);
}

/* Tab icon prefix */
.wc-tab-icon {
  font-size:        10px;
  opacity:          0.7;
  flex-shrink:      0;
}
.wc-tab-btn.wc-tab-active .wc-tab-icon { opacity: 0.9; }

/* Badge chip */
.wc-tab-badge {
  display:          inline-flex;
  align-items:      center;
  justify-content:  center;
  min-width:        14px;
  height:           14px;
  padding:          0 3px;
  border-radius:    999px;
  font-size:        9px;
  font-weight:      700;
  line-height:      1;
  flex-shrink:      0;
}
.wc-tab-badge-ready   { background: rgba(34,197,94, 0.20); color: var(--wc-green); }
.wc-tab-badge-blocked { background: rgba(239,68,68, 0.20); color: var(--wc-red);   }
```

### HTML template

```html
<div class="wc-tab-bar" role="tablist">
  <button class="wc-tab-btn wc-tab-active" role="tab" data-wc-tab="overview">
    <span class="wc-tab-icon">◎</span>Overview
  </button>
  <button class="wc-tab-btn" role="tab" data-wc-tab="planning">
    <span class="wc-tab-icon">⬡</span>Planning
  </button>
  <button class="wc-tab-btn" role="tab" data-wc-tab="task-engine">
    <span class="wc-tab-icon">▤</span>Queue
    <!-- conditional badge: -->
    <span class="wc-tab-badge wc-tab-badge-ready">3</span>
  </button>
  <button class="wc-tab-btn" role="tab" data-wc-tab="status">
    <span class="wc-tab-icon">◈</span>Status
  </button>
  <button class="wc-tab-btn" role="tab" data-wc-tab="config">
    <span class="wc-tab-icon">⚙</span>Config
  </button>
  <button class="wc-tab-btn" role="tab" data-wc-tab="cae">
    <span class="wc-tab-icon">⚑</span>CAE
  </button>
</div>
```

**JS behavior:** No change from current — the existing `data-wc-tab` click handler adds/removes `wc-tab-active`. The class name is unchanged.

---

## 5. Generic Card

### Spec

Cards are the primary layout container for grouped dashboard content.
Three variants — standard, accent (recommended next), expandable.

```css
/* Base card */
.wc-card {                         /* replaces old .dash-card */
  background:     var(--wc-surface);
  border:         1px solid var(--wc-border);
  border-radius:  6px;
  padding:        10px 12px;
  margin-bottom:  10px;
}
.wc-card > * { margin: 0; }

/* Card header */
.wc-card-header {
  display:          flex;
  align-items:      center;
  justify-content:  space-between;
  margin-bottom:    8px;
  gap:              8px;
}

/* Card title */
.wc-card-title {
  font-size:        12px;
  font-weight:      700;
  color:            var(--wc-fg);
  display:          flex;
  align-items:      center;
  gap:              6px;
  min-width:        0;
  line-height:      1.3;
}
.wc-card-title-icon {
  font-size:        10px;
  opacity:          0.65;
  flex-shrink:      0;
}

/* Card actions */
.wc-card-actions {
  display:          flex;
  gap:              4px;
  flex-shrink:      0;
}

/* Card body */
.wc-card-body {
  font-size:        11.5px;
  color:            var(--wc-fg);
  opacity:          0.85;
  line-height:      1.5;
}
.wc-card-body p { margin: 0 0 6px; }
.wc-card-body p:last-child { margin-bottom: 0; }

/* Card footer */
.wc-card-footer {
  margin-top:       10px;
  padding-top:      8px;
  border-top:       1px solid var(--wc-border);
  display:          flex;
  align-items:      center;
  gap:              6px;
}
.wc-card-meta {
  font-size:        10px;
  color:            var(--wc-muted);
  flex:             1;
}

/* --- Accent variant (Recommended Next, warnings, highlighted items) --- */
.wc-card-accent {
  border-left:      3px solid var(--wc-accent);
  background:       linear-gradient(135deg,
    rgba(255,95,31,0.06) 0%,
    var(--wc-surface) 60%);
}

/* --- Expandable card (details/summary) --- */
.wc-card details { margin: 0; }
.wc-card-summary {
  list-style:       none;
  cursor:           pointer;
  display:          flex;
  align-items:      center;
  justify-content:  space-between;
  user-select:      none;
  padding:          0;  /* inherits .wc-card padding */
}
.wc-card-summary::-webkit-details-marker { display: none; }
.wc-card-chevron {
  font-size:        10px;
  color:            var(--wc-muted);
  transition:       transform 0.2s;
  flex-shrink:      0;
}
details[open] .wc-card-chevron { transform: rotate(90deg); }

/* --- Status chips --- */
.wc-chip {
  display:          inline-flex;
  align-items:      center;
  padding:          2px 7px;
  border-radius:    999px;
  font-size:        10px;
  font-weight:      600;
  line-height:      1.3;
  white-space:      nowrap;
  flex-shrink:      0;
}
.wc-chip-ready    { background: rgba(34,197,94, 0.12); color: var(--wc-green); }
.wc-chip-blocked  { background: rgba(239,68,68, 0.12); color: var(--wc-red);   }
.wc-chip-waiting  { background: rgba(245,158,11,0.12); color: var(--wc-amber); }
.wc-chip-active   { background: rgba(255,95,31, 0.12); color: var(--wc-accent);}
.wc-chip-default  { background: rgba(255,255,255,0.07); color: var(--wc-muted); border: 1px solid var(--wc-border); }
```

### Migration note

`dash-card` → `wc-card`. The old class remains for backward compat during the transition — add `wc-card` as a second class or rename it once all uses are updated.

---

## 6. Agent Activity Card — Tree Card

This is a full replacement of `renderAgentStatusBanner()` and its associated CSS.

### Data model (unchanged)

`agentStatusRenderRows(d)` returns `{ kind, label, rows: DashboardAgentRenderRow[] }`.
Each row has `{ label, role, detail, phase, lastActivity, kind, taskId, subagent: boolean }`.

### Render strategy (new)

1. **Group rows**: The first non-subagent row is the "main agent" card header. Subsequent non-subagent rows (team workers) each get their own card. Subagent rows (`row.subagent === true`) are rendered inside the card of the most recent non-subagent row.
2. **Status class**: Map `row.kind` to a CSS status modifier (`active | waiting | blocked | idle | done`) using the table in §3 above.
3. **Current action ("Now")**: `row.detail` is the primary content — displayed in a prominent inset block.
4. **Task chip**: `row.taskId` in monospace orange, truncated task title beside it.
5. **Subagent tree**: If a card has subagent children, render them inside a `.wc-agent-tree` container with connecting lines. The expand/collapse toggle is the parent card click area.

### CSS

```css
/* --- Section heading --- */
.wc-agent-section-label {
  font-size:        9.5px;
  font-weight:      700;
  letter-spacing:   0.12em;
  text-transform:   uppercase;
  color:            var(--wc-muted);
  margin:           12px 0 6px;
  opacity:          0.7;
}

/* --- Agent card container --- */
.wc-agent-card {
  border-radius:    6px;
  overflow:         hidden;
  margin-bottom:    8px;
  border:           1px solid var(--wc-border);
  background:       var(--wc-surface);
  transition:       border-color 0.3s, background 0.3s;
}

/* Status-driven border + background tint */
.wc-agent-card[data-status="active"]  { border-color: var(--wc-green-border); background: linear-gradient(160deg, var(--wc-green-tint) 0%, var(--wc-surface) 50%); }
.wc-agent-card[data-status="waiting"] { border-color: var(--wc-amber-border); background: linear-gradient(160deg, var(--wc-amber-tint) 0%, var(--wc-surface) 50%); }
.wc-agent-card[data-status="blocked"] { border-color: var(--wc-red-border);   background: linear-gradient(160deg, var(--wc-red-tint)   0%, var(--wc-surface) 50%); }
.wc-agent-card[data-status="done"]    { border-color: var(--wc-blue-border);  background: linear-gradient(160deg, var(--wc-blue-tint)  0%, var(--wc-surface) 50%); }

/* Top color bar */
.wc-agent-card-bar {
  height:           2px;
  background:       linear-gradient(90deg, var(--wc-bar-color, var(--wc-muted)) 0%, transparent 100%);
}
.wc-agent-card[data-status="active"]  .wc-agent-card-bar { --wc-bar-color: var(--wc-green); }
.wc-agent-card[data-status="waiting"] .wc-agent-card-bar { --wc-bar-color: var(--wc-amber); }
.wc-agent-card[data-status="blocked"] .wc-agent-card-bar { --wc-bar-color: var(--wc-red);   }
.wc-agent-card[data-status="done"]    .wc-agent-card-bar { --wc-bar-color: var(--wc-blue);  }

/* Card header (parent agent row) */
.wc-agent-card-header {
  padding:          8px 10px;
  display:          flex;
  flex-direction:   column;
  gap:              6px;
  cursor:           pointer;  /* if card has subagents */
}
.wc-agent-card-header--no-expand { cursor: default; }

/* Header row 1: dot + label + status chip + role + expand toggle */
.wc-agent-card-row1 {
  display:          flex;
  align-items:      center;
  gap:              6px;
}
.wc-agent-card-name {
  font-size:        11px;
  font-weight:      700;
  color:            var(--wc-fg);
  flex:             1;
  white-space:      nowrap;
  overflow:         hidden;
  text-overflow:    ellipsis;
}
.wc-agent-card-status-chip {
  font-size:        9.5px;
  font-weight:      700;
  padding:          1px 6px;
  border-radius:    999px;
  letter-spacing:   0.03em;
  white-space:      nowrap;
}
.wc-agent-card[data-status="active"]  .wc-agent-card-status-chip { background: rgba(34,197,94,0.12);  color: var(--wc-green); }
.wc-agent-card[data-status="waiting"] .wc-agent-card-status-chip { background: rgba(245,158,11,0.12); color: var(--wc-amber); }
.wc-agent-card[data-status="blocked"] .wc-agent-card-status-chip { background: rgba(239,68,68,0.12);  color: var(--wc-red);   }
.wc-agent-card[data-status="done"]    .wc-agent-card-status-chip { background: rgba(59,130,246,0.12); color: var(--wc-blue);  }
.wc-agent-card[data-status="idle"]    .wc-agent-card-status-chip { background: rgba(255,255,255,0.07); color: var(--wc-muted); }

.wc-agent-card-role {
  font-size:        8.5px;
  font-weight:      500;
  color:            var(--wc-muted);
  letter-spacing:   0.06em;
  text-transform:   uppercase;
  white-space:      nowrap;
}
.wc-agent-card-chevron {
  font-size:        10px;
  color:            var(--wc-muted);
  transition:       transform 0.2s;
  flex-shrink:      0;
}
.wc-agent-card--expanded .wc-agent-card-chevron { transform: rotate(90deg); }

/* Header row 2: "Now" block — current action */
.wc-agent-card-now {
  background:       rgba(0,0,0,0.3);
  border-radius:    4px;
  padding:          5px 8px;
  border-left:      2px solid var(--wc-now-color, var(--wc-muted));
}
.wc-agent-card[data-status="active"]  .wc-agent-card-now { --wc-now-color: var(--wc-green); }
.wc-agent-card[data-status="waiting"] .wc-agent-card-now { --wc-now-color: var(--wc-amber); }
.wc-agent-card[data-status="blocked"] .wc-agent-card-now { --wc-now-color: var(--wc-red);   }

.wc-agent-card-now-label {
  font-size:        9.5px;
  font-weight:      700;
  letter-spacing:   0.10em;
  text-transform:   uppercase;
  color:            var(--wc-muted);
  margin-bottom:    2px;
}
.wc-agent-card-now-text {
  font-size:        11px;
  font-weight:      500;
  color:            var(--wc-fg);
  line-height:      1.35;
}

/* Header row 3: task chip + title + phase + time */
.wc-agent-card-meta {
  display:          flex;
  align-items:      center;
  gap:              5px;
  flex-wrap:        wrap;
}
.wc-agent-card-task-chip {
  font-size:        10px;
  font-weight:      600;
  color:            var(--wc-accent);
  background:       rgba(255,95,31,0.10);
  padding:          1px 6px;
  border-radius:    3px;
  font-family:      'JetBrains Mono', 'Consolas', monospace;
  white-space:      nowrap;
  flex-shrink:      0;
}
.wc-agent-card-task-title {
  font-size:        10px;
  color:            var(--wc-muted);
  flex:             1;
  white-space:      nowrap;
  overflow:         hidden;
  text-overflow:    ellipsis;
}
.wc-agent-card-timing {
  font-size:        9.5px;
  color:            var(--wc-muted);
  white-space:      nowrap;
  opacity:          0.7;
}
.wc-agent-card-sub-count {
  font-size:        9.5px;
  color:            var(--wc-muted);
  background:       rgba(255,255,255,0.05);
  padding:          1px 5px;
  border-radius:    999px;
  border:           1px solid var(--wc-border);
  white-space:      nowrap;
  flex-shrink:      0;
}

/* --- Subagent tree --- */
.wc-agent-tree {
  border-top:       1px solid rgba(255,255,255,0.05);
  padding:          4px 10px 8px 16px;
}
.wc-agent-tree-label {
  font-size:        9px;
  font-weight:      700;
  letter-spacing:   0.12em;
  text-transform:   uppercase;
  color:            var(--wc-muted);
  opacity:          0.55;
  margin-bottom:    4px;
  padding-left:     8px;
}
.wc-agent-sub-row {
  display:          flex;
  align-items:      center;
  gap:              8px;
  padding:          4px 0;
  position:         relative;
}
/* Vertical connector line */
.wc-agent-sub-row::before {
  content:          '';
  position:         absolute;
  left:             0;
  top:              0;
  bottom:           0;
  width:            1px;
  background:       var(--wc-border);
}
/* Last row — line only goes to midpoint */
.wc-agent-sub-row:last-child::before { bottom: 50%; }
/* Horizontal elbow */
.wc-agent-sub-row::after {
  content:          '';
  position:         absolute;
  left:             0;
  top:              50%;
  width:            8px;
  height:           1px;
  background:       var(--wc-border);
}
.wc-agent-sub-inner {
  flex:             1;
  display:          flex;
  align-items:      center;
  gap:              6px;
  margin-left:      8px;
  background:       rgba(255,255,255,0.03);
  border:           1px solid var(--wc-border);
  border-radius:    4px;
  padding:          4px 8px;
  min-width:        0;
  transition:       border-color 0.3s;
}
.wc-agent-sub-inner[data-status="active"]  { border-color: var(--wc-green-border); }
.wc-agent-sub-inner[data-status="waiting"] { border-color: var(--wc-amber-border); }
.wc-agent-sub-inner[data-status="blocked"] { border-color: var(--wc-red-border);   }

.wc-agent-sub-name {
  font-size:        10.5px;
  font-weight:      600;
  color:            var(--wc-fg);
  opacity:          0.85;
  white-space:      nowrap;
  overflow:         hidden;
  text-overflow:    ellipsis;
  flex:             1;
}
.wc-agent-sub-chip {
  font-size:        9.5px;
  font-weight:      600;
  padding:          1px 5px;
  border-radius:    999px;
  white-space:      nowrap;
  flex-shrink:      0;
}
.wc-agent-sub-chip[data-status="active"]  { background: rgba(34,197,94,0.12);  color: var(--wc-green); }
.wc-agent-sub-chip[data-status="waiting"] { background: rgba(245,158,11,0.12); color: var(--wc-amber); }
.wc-agent-sub-chip[data-status="blocked"] { background: rgba(239,68,68,0.12);  color: var(--wc-red);   }
.wc-agent-sub-chip[data-status="idle"]    { background: rgba(255,255,255,0.07); color: var(--wc-muted); }

.wc-agent-sub-meta {
  font-size:        10px;
  color:            var(--wc-muted);
  white-space:      nowrap;
  opacity:          0.7;
  flex-shrink:      0;
}

/* --- Status dot (shared by banner + agent card) --- */
.wc-dot {
  width:            7px;
  height:           7px;
  border-radius:    50%;
  flex-shrink:      0;
  display:          inline-block;
}
.wc-dot--active  { background: var(--wc-green); box-shadow: 0 0 5px var(--wc-green); animation: wc-pulse 1.6s ease-in-out infinite; }
.wc-dot--waiting { background: var(--wc-amber); box-shadow: 0 0 4px var(--wc-amber); }
.wc-dot--blocked { background: var(--wc-red);   box-shadow: 0 0 4px var(--wc-red);   }
.wc-dot--idle    { background: var(--wc-muted); }
.wc-dot--done    { background: var(--wc-blue);  }
```

### HTML template (single agent card, with subagents)

```html
<div class="wc-agent-card wc-agent-card--expanded" data-status="{{statusClass}}">
  <div class="wc-agent-card-bar"></div>

  <div class="wc-agent-card-header" data-wc-action="toggle-agent-card" data-agent-id="{{agentId}}">
    <!-- Row 1 -->
    <div class="wc-agent-card-row1">
      <span class="wc-dot wc-dot--{{statusClass}}"></span>
      <span class="wc-agent-card-name">{{label}}</span>
      <span class="wc-agent-card-status-chip">{{statusLabel}}</span>
      <span class="wc-agent-card-role">{{role}}</span>
      <!-- Only render chevron if subagents exist -->
      <span class="wc-agent-card-chevron" aria-hidden="true">▶</span>
    </div>

    <!-- Row 2: current action -->
    <div class="wc-agent-card-now">
      <div class="wc-agent-card-now-label">Now</div>
      <div class="wc-agent-card-now-text">{{detail}}</div>
    </div>

    <!-- Row 3: task + meta -->
    <div class="wc-agent-card-meta">
      <span class="wc-agent-card-task-chip">{{taskId}}</span>
      <span class="wc-agent-card-task-title">{{taskTitle}}</span>
      <span class="wc-agent-card-timing">P{{phase}} · {{lastActivity}}</span>
      <!-- Only if has subagents: -->
      <span class="wc-agent-card-sub-count">{{n}} subagents</span>
    </div>
  </div>

  <!-- Subagent tree — hidden when collapsed (add display:none when not expanded) -->
  <div class="wc-agent-tree">
    <div class="wc-agent-tree-label">Subagents</div>

    <!-- Repeat for each subagent row -->
    <div class="wc-agent-sub-row">
      <div class="wc-agent-sub-inner" data-status="{{sub.statusClass}}">
        <span class="wc-dot wc-dot--{{sub.statusClass}}"></span>
        <span class="wc-agent-sub-name">{{sub.role}}</span>
        <span class="wc-agent-sub-chip" data-status="{{sub.statusClass}}">{{sub.statusLabel}}</span>
        <span class="wc-agent-sub-meta">{{sub.taskId}} · {{sub.lastActivity}}</span>
      </div>
    </div>
    <!-- /repeat -->
  </div>
</div>
```

### JS behavior needed (expand/collapse)

The existing webview message handler needs one new action:

```typescript
// In the webview script (handleMessage or similar):
if (e.target.closest('[data-wc-action="toggle-agent-card"]')) {
  const card = e.target.closest('.wc-agent-card');
  if (card) {
    card.classList.toggle('wc-agent-card--expanded');
    const tree = card.querySelector('.wc-agent-tree');
    if (tree) {
      (tree as HTMLElement).style.display =
        card.classList.contains('wc-agent-card--expanded') ? '' : 'none';
    }
  }
}
```

### `renderAgentStatusBanner` replacement logic

```typescript
// Status class mapping helper — add near agentStatusRenderRows
function agentKindToStatusClass(kind: string): string {
  if (['active', 'running', 'in_progress'].includes(kind)) return 'active';
  if (['waiting', 'awaiting_input', 'in_review'].includes(kind))  return 'waiting';
  if (['blocked', 'error'].includes(kind))                         return 'blocked';
  if (['done', 'complete', 'released'].includes(kind))             return 'done';
  return 'idle';
}

function agentStatusClassToLabel(cls: string): string {
  const map: Record<string, string> = {
    active: 'Running', waiting: 'Waiting', blocked: 'Blocked', done: 'Done', idle: 'Idle',
  };
  return map[cls] ?? 'Idle';
}
```

---

## 7. Empty / Loading States

```css
/* Empty state card — no agents active */
.wc-agent-empty {
  background:    var(--wc-surface);
  border:        1px solid var(--wc-border);
  border-radius: 6px;
  padding:       16px;
  text-align:    center;
  margin-bottom: 8px;
}
.wc-agent-empty-icon { font-size: 18px; opacity: 0.25; margin-bottom: 6px; display: block; }
.wc-agent-empty-msg  { font-size: 11px; color: var(--wc-muted); }
.wc-agent-empty-sub  { font-size: 10px; color: var(--wc-muted); opacity: 0.65; margin-top: 2px; }
```

```html
<div class="wc-agent-empty">
  <span class="wc-agent-empty-icon">◎</span>
  <div class="wc-agent-empty-msg">No agents active</div>
  <div class="wc-agent-empty-sub">Awaiting instruction</div>
</div>
```

---

## 8. Implementation Checklist

**In `render-dashboard.ts`:**
- [ ] Add CSS token block (§2) to `getDashboardCss()` / `getWebviewContent()` style block
- [ ] Add `@keyframes wc-pulse` to style block
- [ ] Replace `renderAgentStatusBanner()` with new tree-card renderer using §6 HTML/CSS
- [ ] Add `agentKindToStatusClass()` and `agentStatusClassToLabel()` helpers
- [ ] Replace tab bar HTML with segmented control (§4) — class names `wc-tab-bar`/`wc-tab-btn` are unchanged; update inner HTML and remove old underline CSS
- [ ] Replace `dash-card` usage with `wc-card` (or add as alias) and apply new variants
- [ ] Add banner HTML above tab bar (§3) — pipe `agentStatus.kind` to `data-agent-status-kind`

**In `DashboardViewProvider.ts`:**
- [ ] Wire `toggle-agent-card` action in the webview message handler (§6 JS behavior)
- [ ] If status `kind` changes while panel is open, patch the banner's `data-agent-status-kind` attribute via section-patch hydration (same mechanism as T100398 status patch)

**In `brand/brand.md`:**
- [ ] Reference this file as the dashboard extension of the brand spec

---

## 9. Canvas Mockup Reference

Live interactive references on the canvas board (Preview tab → toggle canvas):

| Shape ID | Content |
|---|---|
| `ux-banner` | Banner — all 4 states cycling |
| `ux-tabs` | Tab styles A/B/C side by side |
| `ux-card` | Generic card variants + CSS spec |
| `ux-agent-card` | Agent Activity tree card — 3 agents, expandable |
