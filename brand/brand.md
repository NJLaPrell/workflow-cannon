# Workflow Cannon — Brand Guidelines
**Version 1.0 · May 2026**

---

## Identity

**Name:** Workflow Cannon
**Tagline:** Run every workflow. Ship without friction.
**Short description:** A developer workflow orchestration tool — queue tasks, enforce guidance, track execution, all from your editor sidebar.

**Personality:** Bold, energetic, precise. Confident but not loud. Built for developers who move fast and hate friction.

---

## Logo

### Mark
A geometric side-profile cannon — simplified, flat, pointing right. Barrel + breech block + wheel. Works at any size from 16px favicon to large-format print.

### Files
| File | Use |
|---|---|
| `media/wc-logo-mark.svg` | Standalone mark, transparent background |
| `media/wc-logo-mark-on-dark.svg` | Mark on `#0F0F0F` — for dark surfaces |
| `media/wc-logo-mark-light.svg` | Mark on `#F7F6F4` — for light surfaces |
| `media/wc-logo-wordmark.svg` | Text-only wordmark (horizontal) |
| `media/wc-logo-full.svg` | Full lockup — mark + wordmark + tagline |
| `media/wc-favicon.svg` | Favicon/icon tile — 32×32 optimized |
| `attached_assets/brand/favicon-512.png` | App icon PNG — 512×512 |
| `attached_assets/brand/apple-touch-icon.png` | Apple touch icon — 180×180 |
| `attached_assets/brand/wc-cannon-mark-hq.png` | AI-rendered cannon mark (transparent) |
| `attached_assets/brand/wc-app-icon.png` | AI-rendered app icon tile |

### Usage Rules
- **Do** use the mark on `#0F0F0F` (dark) or `#F7F6F4` (light) backgrounds
- **Do** maintain clear space of at least 1× the wheel diameter on all sides
- **Don't** recolor the mark — it must remain `#FF5F1F` (Cannon Orange)
- **Don't** place the mark on competing busy backgrounds
- **Don't** stretch, skew, or modify the proportions
- **Don't** add drop shadows, glows, or effects

---

## Color Palette

### Primary — Forge Dark (default)

| Token | Name | Hex | Use |
|---|---|---|---|
| `--wc-accent` | Cannon Orange | `#FF5F1F` | Primary actions, logo, links, active states |
| `--wc-accent-hover` | Ember | `#FF8A4C` | Hover state for primary elements |
| `--wc-accent-active` | Forge | `#CC3D00` | Active/pressed state, muzzle detail |
| `--wc-fg` | Off-White | `#F0F0F0` | Primary text on dark backgrounds |
| `--wc-muted` | Ash | `#888888` | Secondary text, labels, descriptions |
| `--wc-border` | Border | `#2A2A2A` | Dividers, card borders, input borders |
| `--wc-surface` | Surface | `#1A1A1A` | Card backgrounds, panel surfaces |
| `--wc-bg` | Near-Black | `#0F0F0F` | Page/app background |

### Web Light Mode

| Token | Hex | Use |
|---|---|---|
| `--wc-accent` | `#FF5F1F` | Same — orange always reads |
| `--wc-accent-hover` | `#E04800` | Slightly darker for contrast on white |
| `--wc-fg` | `#111111` | Primary text |
| `--wc-muted` | `#555555` | Secondary text |
| `--wc-border` | `#DDDDDD` | Dividers |
| `--wc-surface` | `#F7F6F4` | Card / section backgrounds |
| `--wc-bg` | `#FFFFFF` | Page background |

### CSS Custom Properties

```css
/* Forge Dark (default) */
:root {
  --wc-accent:        #FF5F1F;
  --wc-accent-hover:  #FF8A4C;
  --wc-accent-active: #CC3D00;
  --wc-fg:            #F0F0F0;
  --wc-muted:         #888888;
  --wc-border:        #2A2A2A;
  --wc-surface:       #1A1A1A;
  --wc-bg:            #0F0F0F;
}

/* Web Light override */
@media (prefers-color-scheme: light) {
  :root {
    --wc-accent:        #FF5F1F;
    --wc-accent-hover:  #E04800;
    --wc-accent-active: #CC3D00;
    --wc-fg:            #111111;
    --wc-muted:         #555555;
    --wc-border:        #DDDDDD;
    --wc-surface:       #F7F6F4;
    --wc-bg:            #FFFFFF;
  }
}
```

---

## Typography

### Font Stack

| Role | Font | Fallback | Weight | Size |
|---|---|---|---|---|
| Display / Headings | Inter | DM Sans, system-ui, sans-serif | 700–800 | 24–48px |
| UI / Body | Inter | DM Sans, system-ui, sans-serif | 400–600 | 12–16px |
| Labels / Kickers | Inter | system-ui, sans-serif | 700 | 9.5–11px, uppercase, 0.1em tracking |
| Code / Terminal | JetBrains Mono | Consolas, monospace | 400–500 | 11–13px |

### Scale

```
Display:    36–48px · weight 800 · tracking -0.02em · leading 1.1
Heading 1:  24–32px · weight 700 · tracking -0.01em · leading 1.2
Heading 2:  18–20px · weight 700 · leading 1.3
Heading 3:  14–16px · weight 600 · leading 1.4
Body:       12–14px · weight 400 · leading 1.5–1.6
Label:      10–11px · weight 600–700 · uppercase · 0.1em tracking
Mono:       11–13px · JetBrains Mono
```

### Google Fonts import

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## Spacing

Base unit: `4px`

```
4   — tight internal padding (icon to label gap)
8   — component internal padding
12  — small component gap
16  — standard section gap
24  — medium section gap
32  — large section gap
48  — section break
64  — page section padding
```

---

## Border Radius

| Context | Radius |
|---|---|
| Small buttons, chips, badges | `4px` |
| Cards, panels, inputs | `6px` |
| Large cards, modals | `8px` |
| App icon tile | `18%` of size (e.g. 7px at 32×32) |
| Pills / full-round tags | `999px` |

---

## Button Styles

### Primary
```css
background: var(--wc-accent);         /* #FF5F1F */
color: #FFFFFF;
border: none;
border-radius: 6px;
padding: 8px 18px;
font-size: 13px;
font-weight: 600;
/* hover: */ background: var(--wc-accent-hover);
/* active: */ filter: brightness(0.94);
```

### Secondary
```css
background: transparent;
color: var(--wc-fg);
border: 1px solid var(--wc-border);
border-radius: 6px;
padding: 8px 18px;
font-size: 13px;
font-weight: 500;
/* hover: */ background: rgba(255,255,255,0.05);
```

### Ghost / Link
```css
background: transparent;
color: var(--wc-accent);
border: 1px solid var(--wc-accent);
border-radius: 6px;
padding: 8px 18px;
font-size: 13px;
font-weight: 500;
/* hover: */ background: rgba(255,95,31,0.08);
```

---

## Favicon / Icon Sizes

| File | Size | Use |
|---|---|---|
| `media/wc-favicon.svg` | SVG | Modern browsers (auto-scales) |
| `attached_assets/brand/favicon-512.png` | 512×512 | PWA manifest, high-DPI |
| `attached_assets/brand/apple-touch-icon.png` | 180×180 | iOS home screen |
| Resize from 512 to: | 32×32 | `favicon-32x32.png` |
| Resize from 512 to: | 16×16 | `favicon-16x16.png` |

### Recommended `<head>` tags
```html
<link rel="icon" href="/media/wc-favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

---

## Voice & Tone

- **Confident, not arrogant** — state things directly, no hedging
- **Terse, not curt** — short sentences that say something real
- **Technical, not jargon-heavy** — assume the audience is a developer
- **Active voice** — "Run the workflow", not "The workflow can be run"

### Vocabulary
| Prefer | Avoid |
|---|---|
| Run / fire | Execute / trigger |
| Cannon / fire | Launch / deploy (unless deployment) |
| Guidance / CAE | Rules / policies (too enterprise) |
| Panel / sidebar | Widget / pane |
| Task | Ticket / issue (reserve for integrations) |

---

## Extension — VS Code / Cursor

The extension uses VS Code CSS variables (`--vscode-*`). Orange maps to `var(--vscode-button-background)` by convention, so the accent color adapts to user themes.

```css
/* In webview CSS — VS Code palette mapping */
--wc-accent:       var(--vscode-button-background);
--wc-accent-hover: var(--vscode-button-hoverBackground);
--wc-fg:           var(--vscode-foreground);
--wc-muted:        var(--vscode-foreground); /* + opacity: 0.65 */
--wc-border:       var(--vscode-widget-border, rgba(127,127,127,.35));
--wc-surface:      var(--vscode-editor-background);
--wc-bg:           var(--vscode-sideBar-background);
```
