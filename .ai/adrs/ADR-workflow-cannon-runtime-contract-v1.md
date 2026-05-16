# ADR: Workflow Cannon runtime contract (v1)

## Status

Accepted - Phase **93** (**T100215**). Implementation is staged through the Phase 93 runtime-contract task chain.

## Context

Workflow Cannon commands depend on native SQLite through `better-sqlite3`. When the Node executable used at runtime differs from the Node executable and architecture that installed native dependencies, agents and the Cursor extension can hit opaque native load errors such as ABI mismatches or Apple Silicon arm64/x64 bundle mismatches.

Attached workspaces can also contain their own `.nvmrc`, `.node-version`, package manager configuration, or editor runtime. Those project choices are valid for the attached project, but they are not a reliable source of truth for running Workflow Cannon itself.

## Decision

Workflow Cannon owns a separate runtime contract for kit execution. After attach, routine Workflow Cannon commands must use the recorded kit runtime, not arbitrary shell `PATH`, Electron Node, or attached project Node markers.

The supported runtime for this contract is **Node 22** with loadable native SQLite for the installed `@workflow-cannon/workspace-kit` package.

## Runtime Stamp

Attached workspaces record the validated runtime identity at:

```text
.workspace-kit/runtime.json
```

The stamp is kit-owned environment metadata. It records at least:

- `nodeExecutable`: absolute path to the Node executable used for Workflow Cannon runtime commands.
- `nodeVersion`: full Node version string.
- `arch`: `process.arch` for the stamped runtime.
- `platform`: `process.platform` for the stamped runtime.
- `abi`: native module ABI for the stamped runtime.
- `packageRoot`: installed Workflow Cannon package root used for native SQLite validation.
- `checkedAt`: ISO timestamp for the validation that wrote or refreshed the stamp.

In the **workflow-cannon** source repository, this path is **gitignored** so clones never inherit another developer’s absolute `nodeExecutable`. Fresh checkouts get a stamp from **`pnpm install`** postinstall when native SQLite loads, and/or from **`pnpm run setup:dev`**.

Consumers should treat malformed stamps, missing required fields, missing `nodeExecutable`, wrong Node major, ABI/architecture mismatch, or failed SQLite smoke checks as runtime contract drift.

## Canonical Launcher

Attached workspaces expose a kit-owned launcher at:

```text
.workspace-kit/bin/wk
```

The launcher reads `.workspace-kit/runtime.json`, verifies that the stamped Node executable still exists, then execs the Workflow Cannon CLI with that Node executable.

The launcher must fail clearly when the stamp is missing, malformed, stale, or points at a deleted Node executable. It must not perform broad Node search after attach and must not follow the attached project `.nvmrc` or `.node-version`.

## Install And Init Validation

`wk init` is the attach path. Before initializing planning SQLite, init validates the active runtime contract:

1. The selected Node executable is Node 22.
2. Runtime identity fields can be recorded.
3. `better-sqlite3` can be loaded from the intended package root.
4. The runtime stamp and launcher can be written or safely repaired as kit-owned artifacts.

If validation fails, init refuses to attach rather than creating a misleadingly usable workspace. Re-running init may repair missing or corrupt runtime artifacts when the active runtime is valid.

Package development setup and install-time checks may rebuild native SQLite as an install repair step, but recurring command execution should rely on the stamped runtime and launcher rather than repeatedly rebuilding or probing many Node candidates.

## Doctor And Drift

`wk doctor` is read-only. It reports runtime contract health and drift, including:

- missing runtime stamp;
- invalid stamp shape;
- deleted stamped Node executable;
- wrong Node major;
- architecture or ABI mismatch;
- failed native SQLite smoke check;
- missing or corrupt launcher;
- current process differing from the stamped runtime.

Human remediation should point to the setup or attach repair path, not a long matrix of ad hoc native-module commands.

## Extension Runtime Selection

In attached workspaces, the Cursor extension should prefer the runtime stamp or `.workspace-kit/bin/wk` launcher for routine Workflow Cannon commands. Explicit overrides such as `WORKSPACE_KIT_NODE` or `workflowCannon.nodeExecutable` remain exceptional diagnostics or pre-attach fallback paths.

The extension must not depend on Electron Node, shell `PATH`, `.nvmrc`, `.node-version`, or attached project package metadata for normal attached-workspace Workflow Cannon command execution.

## Consequences

- Phase 93 implementation tasks add helpers, launcher generation, init integration, guidance updates, extension selection, doctor drift checks, upgrade/ownership support, and regression tests against this ADR.
- Native SQLite troubleshooting shifts from repeated runtime recovery to install/init correctness plus drift detection.
- Attached project Node markers remain project-owned and do not control Workflow Cannon runtime selection after attach.

## Non-goals

- Selecting a Node runtime manager for user projects.
- Preventing attached projects from using non-Node-22 runtimes for their own commands.
- Publishing local `npm publish` guidance; release publishing remains governed by `.ai/RELEASING.md`.

## References

- `.ai/runbooks/install-attach-workflow-cannon.md`
- `.ai/runbooks/native-sqlite-consumer-install.md`
- `.ai/POLICY-APPROVAL.md`
