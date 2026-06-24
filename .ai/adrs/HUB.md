# ADRs routing hub (machine-oriented)

Architecture decisions live under `.ai/adrs/` / `docs/maintainers/adrs/`. Agents: use this table; humans may use maintainer renders.

| Topic | ADR (canonical path under repo) |
| --- | --- |
| CLI error remediation contract (`remediation` on failures) | `.ai/adrs/ADR-cli-error-remediation-contract.md` |
| Context activation engine (CAE) architecture | `.ai/adrs/ADR-context-activation-engine-architecture-v1.md` |
| Planning generation / optimistic concurrency | `.ai/adrs/ADR-planning-generation-optimistic-concurrency.md` (maintainer twin: `docs/maintainers/adrs/...`) |
| Agent protocol / compliance suite | `.ai/adrs/ADR-agent-protocol-compliance-suite-v1.md` |
| Team execution + subagent registry | `docs/maintainers/adrs/ADR-team-execution-v1.md`, `docs/maintainers/adrs/ADR-subagent-registry-v1.md` |
| Workspace Kit first-run init UX (`wk init` vs refresh-context vs upgrade vs doctor) | `.ai/adrs/ADR-workspace-kit-init-first-run-v1.md` |
| Workflow Cannon runtime contract (Node 22 stamp, launcher, native SQLite drift) | `.ai/adrs/ADR-workflow-cannon-runtime-contract-v1.md` |
| Hosted API backend (canonical sync HTTP wire contract) | `.ai/adrs/ADR-hosted-api-backend-contract-v1.md` |
| MCP remote transport and auth non-goals (Phase 134 explicit out-of-scope) | `.ai/adrs/ADR-mcp-remote-transport-auth-non-goals-phase-134-v1.md` |
| Cursor background-agent remote execution handoff (Phase 1 design; Phase 2 via Cursor SDK) | `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md` |
| Workflow Cannon state backend merge surface (snapshot/event exports + SQLite cache boundary) | `.ai/adrs/ADR-workflow-cannon-state-backend-v1.md` |

When a row points only to `docs/maintainers/`, the machine original may be absent — read that single file and stop (see **`.cursor/rules/agent-doc-routing.mdc`** exception list).
