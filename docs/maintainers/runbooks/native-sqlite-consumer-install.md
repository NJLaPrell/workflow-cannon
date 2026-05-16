<!-- GENERATED FROM .ai/runbooks/native-sqlite-consumer-install.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Native SQLite consumer install and recovery

Canonical troubleshooting for **`better-sqlite3`** when using **`tasks.persistenceBackend: sqlite`** (the kit default).

## Symptoms

- `Error: The module 'better_sqlite3.node' was compiled against a different Node.js version`
- Messages containing **`NODE_MODULE_VERSION`** or **`was compiled against a different Node.js`**
- macOS messages such as **`mach-o file, but is an incompatible architecture (have 'arm64', need 'x86_64')`**
- `workspace-kit doctor` reports **`native-sqlite-load-failed`** on **`better-sqlite3`**

## Runtime identity

`workspace-kit doctor` prints the Node executable, Node version, `process.arch`, platform, and native ABI used for SQLite. When a native load fails, compare that identity with the shell that installed `node_modules`.

After attach, Workflow Cannon runtime identity is governed by `.ai/adrs/ADR-workflow-cannon-runtime-contract-v1.md`: `.workspace-kit/runtime.json` records the validated Node 22 runtime, and `.workspace-kit/bin/wk` should execute routine commands through that stamped runtime. Attached project `.nvmrc` and `.node-version` files do not select the Workflow Cannon runtime after attach.

In the **workflow-cannon** source repository, that stamp path is **gitignored**; clone **`pnpm install`** (postinstall) and/or **`pnpm run setup:dev`** materialize it — **`.ai/WORKSPACE-KIT-SESSION.md`**.

For Workflow Cannon development, use the repo setup path from the repository root:

```bash
nvm use 22
pnpm run setup:dev
```

For a non-mutating check that only validates the active runtime and pnpm visibility:

```bash
pnpm run setup:dev -- --check-only
```

## Recovery (in order)

1. From the **project where `node_modules` is installed** (the consumer app root, not a random subfolder), use the stamped Workflow Cannon Node runtime or the same Node architecture that performed the install. On Apple Silicon, do not mix arm64 shells with Rosetta x64 Node installs.
2. Rebuild the native addon:
   - **`pnpm rebuild better-sqlite3`**, or
   - **`npm rebuild better-sqlite3`**
3. Re-run **`workspace-kit doctor`**. Persistence summary lines should list your SQLite DB path when checks pass.
4. If rebuild fails (no compiler, air-gapped registry, or blocked prebuilds), either fix the toolchain/proxy or opt out of SQLite persistence — see **`docs/maintainers/runbooks/task-persistence-operator.md`**.

## What the package already does

**`postinstall`** runs **`scripts/ensure-native-sqlite.mjs`**, which probes a load and **automatically attempts** the same rebuild when the error matches a known ABI, architecture, or missing-binding signature. The log prints the install root and active Node runtime before rebuilding.

## Policy reference

Runtime contract decision record: **`.ai/adrs/ADR-workflow-cannon-runtime-contract-v1.md`**.

Decision record: **`docs/maintainers/adrs/ADR-native-sqlite-consumer-distribution.md`**.
