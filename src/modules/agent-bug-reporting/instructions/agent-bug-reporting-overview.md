<!--
agentCapsule|v=1|command=agent-bug-reporting-overview|module=agent-bug-reporting|schema_only=pnpm exec wk run agent-bug-reporting-overview --schema-only '{}'
-->

# agent-bug-reporting-overview

Placeholder instruction for the **agent-bug-reporting** WorkflowModule scaffold (Phase 148 / T100855).

This entry is intentionally **not** in `builtin-run-command-manifest.json` yet (no shipped `workspace-kit run` command).
It exists so the module has a valid instructions catalog while registration lands.

The first shipped command, `file-bug-report`, is owned by **T100856** and will add:

- a row in `src/contracts/builtin-run-command-manifest.json`
- a matching instruction under this directory
- an `onCommand` handler in `src/modules/agent-bug-reporting/index.ts`

Until then, treat this overview as documentation-only; do not expect a runnable handler.
