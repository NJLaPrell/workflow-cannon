# Dashboard CAE / Guidance shared CSS epic (phase 100)

Machine closure record for **T100312–T100316** merged to **`release/phase-100`**.

## Implementation PRs

| Task | PR | Summary |
| --- | --- | --- |
| T100312 | https://github.com/NJLaPrell/workflow-cannon/pull/366 | Extract `GUIDANCE_PANEL_WEBVIEW_CSS` to `guidance-panel-webview-css.ts`; wire `GuidancePanel` |
| T100313 | https://github.com/NJLaPrell/workflow-cannon/pull/367 | Inject shared CSS in `DashboardViewProvider` webview `<style>` |
| T100314 | https://github.com/NJLaPrell/workflow-cannon/pull/368 | `wc-dashboard-embedded-guidance` host + cascade overrides |
| T100315 | https://github.com/NJLaPrell/workflow-cannon/pull/369 | Regression test `dashboard-guidance-stylesheet.test.mjs` |
| T100316 | https://github.com/NJLaPrell/workflow-cannon/pull/370 | Styleguide governed files + R14 |

## Verification

- Extension typecheck: `pnpm --filter cursor-workflow-cannon run check`
- Guidance + stylesheet tests: `pnpm --filter cursor-workflow-cannon run compile && node --test extensions/cursor-workflow-cannon/test/render-guidance.test.mjs extensions/cursor-workflow-cannon/test/dashboard-guidance-stylesheet.test.mjs`
- **T100319 automated signoff (2026-05-19):** 19/19 tests pass (`render-guidance` + `dashboard-guidance-stylesheet`).
- **Manual (operator):** Dashboard **CAE** tab vs standalone **Guidance** — tab switch, Refresh, artifact row actions, activation form, preview panel, drawer open/cancel.

## Related

- Webview rules: `.github/instructions/cursor-workflow-cannon-ui.instructions.md` (R14)
- CAE pointer: `.ai/cae/ui/webview-styleguide.md`
