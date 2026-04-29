# CAE routing hub

Pick **one** entry by symptom; avoid bulk-reading everything under `.ai/cae/`.

| Need | Go to |
| --- | --- |
| Read-only CLI contract (`cae-*` commands, JSON envelopes) | [`.ai/cae/cli-read-only.md`](./cli-read-only.md) |
| Operator debug / recovery | [`.ai/cae/README.md`](./README.md), [`.ai/runbooks/cae-debug.md`](../runbooks/cae-debug.md) |
| Advisory surfacing on `doctor --agent-instruction-surface` | [`.ai/cae/advisory-surfacing.md`](./advisory-surfacing.md) |
| Registry + SQLite governance (mutations, admin flags) | [`.ai/cae/registry-mutation-governance.md`](./registry-mutation-governance.md), [`.ai/cae/runtime-integration.md`](./runtime-integration.md) |
| Guidance dashboard / extension evidence | [`.ai/cae/dashboard-guidance-plan.md`](./dashboard-guidance-plan.md) |
| Phase 70 release notes / evidence | [`.ai/cae/phase-70-release-evidence.md`](./phase-70-release-evidence.md) |

Default registry JSON and loaders live beside the files above; machine catalog commands are registered from **`src/contracts/builtin-run-command-manifest.json`**.
