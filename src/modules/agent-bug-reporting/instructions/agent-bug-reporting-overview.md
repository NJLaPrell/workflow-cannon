<!--
agentCapsule|v=1|command=agent-bug-reporting-overview|module=agent-bug-reporting|schema_only=pnpm exec wk run agent-bug-reporting-overview --schema-only '{}'
-->

# agent-bug-reporting-overview

Overview for the **agent-bug-reporting** WorkflowModule (Phase 148 / I010).

## Shipped commands

- **`file-bug-report`** — create a proposed improvement with rich evidence.
- **`seed-wc-bug-reporter`** — preview/apply the builtin `wc-bug-reporter` subagent seed.

```
pnpm exec wk run file-bug-report '{"title":"…","symptom":"…","evidenceKey":"…"}'
pnpm exec wk run seed-wc-bug-reporter '{"apply":true,"policyApproval":{"confirmed":true,"rationale":"seed wc-bug-reporter"}}'
```

## Host adapters

Spawn plans are host-agnostic: Cursor + CLI are implemented; Antigravity and VS Code Copilot expose stub contracts that fall back to CLI. Core filing never requires a single host — see `.ai/runbooks/bug-reporter-host-spawn.md`.

This overview entry is documentation-only (not in the builtin run-command manifest).
