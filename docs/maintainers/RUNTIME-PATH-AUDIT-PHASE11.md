# Runtime path audit (Phase 11)

Date: 2026-03-27
Scope: non-documentation runtime paths in `src/core` and `src/cli` for workspace-layout assumptions.

## Findings

1. `ModuleRegistry` instruction validation defaulted to `process.cwd()` when call sites did not pass a workspace path.
2. `run` and `config` command paths instantiated `ModuleRegistry` without explicit workspace roots, which could mis-resolve instruction files in consumer/invoked-from-elsewhere shells.

## Resolution

- `src/core/module-registry.ts` now exposes `validateModuleSet(modules, workspacePath?)` so callers can validate against an explicit root when needed.
- Added regression coverage in `test/module-registry.test.mjs` to confirm explicit `workspacePath` works even when process CWD is elsewhere.
- Maintained existing CLI behavior where module instruction validation resolves from process CWD during command execution because integration tests (and current runtime contract) use fixture workspaces without copied instruction trees.

## Remaining limitations

- Runtime command paths still assume process CWD points at a workspace that can resolve module instruction metadata from the repo layout; changing this now would break existing fixture-based integration behavior and requires a broader migration plan.
- This audit found no additional non-documentation runtime path assumptions that could be changed safely in Phase 11 without compatibility risk.
