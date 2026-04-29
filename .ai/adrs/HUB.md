# ADRs routing hub (machine-oriented)

Architecture decisions live under `.ai/adrs/` / `docs/maintainers/adrs/`. Agents: use this table; humans may use maintainer renders.

| Topic | ADR (canonical path under repo) |
| --- | --- |
| CLI error remediation contract (`remediation` on failures) | `.ai/adrs/ADR-cli-error-remediation-contract.md` |
| Context activation engine (CAE) architecture | `.ai/adrs/ADR-context-activation-engine-architecture-v1.md` |
| Planning generation / optimistic concurrency | `.ai/adrs/ADR-planning-generation-optimistic-concurrency.md` (maintainer twin: `docs/maintainers/adrs/...`) |
| Agent protocol / compliance suite | `.ai/adrs/ADR-agent-protocol-compliance-suite-v1.md` |
| Team execution + subagent registry | `docs/maintainers/adrs/ADR-team-execution-v1.md`, `docs/maintainers/adrs/ADR-subagent-registry-v1.md` |

When a row points only to `docs/maintainers/`, the machine original may be absent — read that single file and stop (see **`.cursor/rules/agent-doc-routing.mdc`** exception list).
