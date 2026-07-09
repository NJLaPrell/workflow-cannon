## What's New in 1.0.8

This release focuses on **General**.

### ✨ Highlights

- Dashboard cold start now has a single DashboardStartupController owner: shell paint, bootstrap, and webview boot/ready/timeout/refresh coalesce behind one in fl
- Dashboard cold start paints a usable overview from CLI or session cache without waiting on the dashboard service.
- Dashboard quietly promotes to the warm service after first paint without flashing or clearing the usable overview.
- Deterministic cold path tests prove the dashboard overview becomes usable within 3 seconds when the service is cold or unavailable.
- Fresh and empty workspaces now paint a usable dashboard overview with zero queue counts instead of a stuck loading shell.

---

_Technical changelog: [`docs/maintainers/CHANGELOG.md`](docs/maintainers/CHANGELOG.md)_
