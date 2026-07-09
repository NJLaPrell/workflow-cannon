## What's New in 1.0.8

Phase 146 — **Dashboard Loading & Sync (first paint)**.

### Highlights

- Single `DashboardStartupController` owns cold-start shell paint, bootstrap, and webview boot/ready/timeout/refresh behind one in-flight promise.
- CLI-primary cold bootstrap paints a usable overview from session cache / store / `dashboard-bootstrap-slices` without waiting on dashboard-service health.
- Quiet post-paint promote to a healthy service via section patches only — never restarts startup or wipes a usable overview.
- Deterministic cold-path tests prove usable overview within 3s when the service is cold; empty/first-run workspaces no longer stick on a loading shell.
- Promote fallback keeps the CLI overview on failure; `dashboard.postPaintPromote: false` disables quiet promote without forcing `cli-polling`.

### Tasks

T100843–T100848 (PRs #764–#769). Phase closeout: #770.

---

Technical changelog: [`docs/maintainers/CHANGELOG.md`](https://github.com/NJLaPrell/workflow-cannon/blob/main/docs/maintainers/CHANGELOG.md)
