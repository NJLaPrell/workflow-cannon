<!-- GENERATED FROM .ai/runbooks/native-sqlite-consumer-install.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Native SQLite consumer install and recovery

Canonical troubleshooting for **`better-sqlite3`** when using **`tasks.persistenceBackend: sqlite`** (the kit default).

## Symptoms

- `Error: The module 'better_sqlite3.node' was compiled against a different Node.js version`
- Messages containing **`NODE_MODULE_VERSION`** or **`was compiled against a different Node.js`**
- `workspace-kit doctor` reports **`native-sqlite-load-failed`** on **`better-sqlite3`**

## Recovery (in order)

1. From the **project where `node_modules` is installed** (the consumer app root, not a random subfolder), run:
   - **`pnpm rebuild better-sqlite3`**, or
   - **`npm rebuild better-sqlite3`**
2. Re-run **`workspace-kit doctor`**. Persistence summary lines should list your SQLite DB path when checks pass.
3. If rebuild fails (no compiler, air-gapped registry, or blocked prebuilds), either fix the toolchain/proxy or opt out of SQLite persistence — see **`docs/maintainers/runbooks/task-persistence-operator.md`**.

## What the package already does

**`postinstall`** runs **`scripts/ensure-native-sqlite.mjs`**, which probes a load and **automatically attempts** the same rebuild when the error matches a known ABI mismatch signature.

## Policy reference

Decision record: **`docs/maintainers/adrs/ADR-native-sqlite-consumer-distribution.md`**.
