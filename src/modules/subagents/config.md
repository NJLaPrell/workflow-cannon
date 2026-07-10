# Subagents module

Kit-owned **subagent definitions** and **session/message** records in unified planning SQLite (`user_version` 6+).

Cursor (or other hosts) perform execution; workspace-kit stores **definitions**, **spawn provenance**, and **handoff messages** for audit and operator workflows.

## Bug-reporter seed (peer)

The **agent-bug-reporting** module owns the builtin `wc-bug-reporter` seed (`seed-wc-bug-reporter`) and host spawn adapters. This module still owns the `register-subagent` / `spawn-subagent` persistence commands that the seed invokes. See `.ai/runbooks/bug-reporter-host-spawn.md`.
