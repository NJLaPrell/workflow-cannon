<!-- GENERATED FROM .ai/runbooks/ide-kit-status-protocol.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# IDE-agnostic kit status protocol

**Audience:** maintainers building editor or CI integrations. **Core remains CLI-canonical** — this document describes the read-only JSON contract thin clients should use.

## Minimum command set

From the workspace root (repository consuming `@workflow-cannon/workspace-kit`):

1. **`pnpm exec workspace-kit doctor`** (or `node node_modules/@workflow-cannon/workspace-kit/dist/cli.js doctor`) — health and persistence hints.
2. **`pnpm exec workspace-kit run dashboard-summary '{}'`** — aggregate dashboard payload (same shape the Cursor extension expects).
3. **`pnpm exec workspace-kit run list-tasks '<filter>'`** — task rows; prefer bounded filters (`status`, `phaseKey`, `type`).

## Versioning

- Pin the **npm package version** in the consumer `package.json`.
- Treat JSON field additions as backward-compatible unless a release note says otherwise.

## Security

- Do **not** pass repository tokens through these commands; subprocesses inherit environment — scrub CI secrets.
- Redact local paths when logging stdout/stderr.

## Cursor extension reference

The **`cursor-workflow-cannon`** extension in this repo is a **reference thin client** using the same commands and JSON shapes described above.
