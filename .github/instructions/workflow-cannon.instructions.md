---
description: "Use when working in the Workflow Cannon repository; points to the canonical agent guidance sources."
applyTo: "**"
---

Follow the repository root `AGENTS.md` first. Treat `.ai/` files and `src/modules/*/instructions/*.md` as the canonical machine guidance sources for routine execution.

Prefer `pnpm exec wk` for clean JSON output, use task-engine commands for task state changes, and do not hand-edit `.workspace-kit/tasks/workspace-kit.db`.
