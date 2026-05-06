# Task Store

Workflow Cannon uses the tracked SQLite task store at `workspace-kit.db` as the canonical task state. The legacy optional `state.json` task store is intentionally absent in this workspace.

Use `pnpm exec wk run ...` commands for reads and mutations; do not hand-edit task store files.
