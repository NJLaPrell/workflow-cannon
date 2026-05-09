# Workflow Cannon — workspace-kit

## Project Overview

**Workflow Cannon** is an AI workflow infrastructure platform for engineering teams. It provides a deterministic operating layer between coding agents (like Cursor) and production repositories via a CLI tool called `workspace-kit` (also invoked as `wk`).

This is a **CLI-only TypeScript project** — there is no web frontend. The primary interface is the `wk` / `workspace-kit` command.

## Tech Stack

- **Language**: TypeScript (Node.js 20+)
- **Package Manager**: pnpm 10
- **Build**: TypeScript compiler (`tsc`)
- **Database**: SQLite via `better-sqlite3`
- **Structure**: pnpm monorepo with two workspaces:
  - `.` — the core `@workflow-cannon/workspace-kit` package
  - `extensions/cursor-workflow-cannon` — VS Code/Cursor extension

## Getting Started

```bash
# Install dependencies
pnpm install --ignore-scripts

# Build
pnpm run build

# Run the CLI
node dist/cli.js --help
# or after linking:
wk --help
wk doctor
wk run
```

## Key Commands

- `wk doctor` — Validate kit contract files, config, and persistence
- `wk run` — List all runnable module commands
- `wk run get-next-actions '{}'` — Get suggested next work items
- `wk config` — Show or change kit config
- `pnpm run build` — Compile TypeScript to `dist/`
- `pnpm run test` — Build and run tests

## User Preferences

- This is a CLI tool, not a web app. No frontend/port configuration needed.
- The `packageManager` field in `package.json` should stay at `pnpm@10.26.1` (matches the Replit-installed version) to avoid self-install loops.
