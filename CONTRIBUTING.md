# Contributing

## Prerequisites

- **Node.js 22+** and **pnpm 10** (see root `package.json` → `packageManager`).

## Clone and validate

```bash
pnpm install
pnpm run build
pnpm run check
pnpm test
```

## Cursor / VS Code extension

The **Workflow Cannon** repo is a **pnpm workspace** (`pnpm-workspace.yaml`): the kit package **`@workflow-cannon/workspace-kit`** (CLI commands **`workspace-kit`** / **`wk`**) and **`extensions/cursor-workflow-cannon`** install together from the root. Do **not** run `npm install` inside the extension directory.

- **Build kit + extension:** `pnpm run ui:prepare`
- **Extension only (after root `pnpm install`):** `pnpm --filter cursor-workflow-cannon run compile` or `pnpm run ext:compile`
- **`@types/vscode`** lives at the **workspace root** so `tsc` can resolve the `vscode` API when compiling the extension.

CI runs the same toolchain: see `.github/workflows/ci.yml` → **Cursor extension (pnpm workspace)**.

Task transitions and policy-sensitive `workspace-kit run` commands: **`docs/maintainers/AGENT-CLI-MAP.md`**.
