# ADR: Native SQLite (`better-sqlite3`) distribution stance

## Status

Accepted (**v0.30.0**).

## Context

The kit ships **`better-sqlite3`**, a native Node addon. Installs can fail or break when Node’s ABI changes, `node_modules` is copied between machines, or corporate proxies block prebuilds. Operators need one place to read expectations and recovery, and **`workspace-kit doctor`** should surface actionable next steps when the addon cannot load.

## Decision

1. **Keep native SQLite as the default persistence implementation** for the unified planning DB path. Alternatives (WASM, pure-JS SQL, optional dependency splits) remain **out of scope** for this release: they trade determinism, test surface, and install predictability (see `.ai/PRINCIPLES.md` — correctness and compatibility before convenience).
2. **Install path** — `package.json` **`postinstall`** runs **`scripts/ensure-native-sqlite.mjs`**, which attempts **`pnpm` / `npm rebuild better-sqlite3`** when load fails with a known ABI mismatch signature.
3. **Operator path** — Canonical troubleshooting lives in **`docs/maintainers/runbooks/native-sqlite-consumer-install.md`**. Maintainer **`AGENTS.md`** links there instead of duplicating long recovery prose.
4. **Doctor** — When **`tasks.persistenceBackend`** is **`sqlite`**, **`workspace-kit doctor`** loads **`better-sqlite3`** dynamically and reports a **single** remediation block on failure (rebuild + runbook link).

## Consequences

- **Positive:** One compatibility story; doctor fails closed with copy-paste recovery for the common ABI case.
- **Negative:** Consumers on exotic platforms still need a working native toolchain or must opt into **`tasks.persistenceBackend: "json"`** (see **`docs/maintainers/runbooks/task-persistence-operator.md`**).
- **Related:** [`ADR-sqlite-default-persistence.md`](./ADR-sqlite-default-persistence.md); [`ADR-task-sqlite-persistence.md`](./ADR-task-sqlite-persistence.md).
