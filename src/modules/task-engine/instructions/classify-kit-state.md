## Command

`workspace-kit run classify-kit-state`

## Purpose

Classify dirty kit-owned files from `git status --porcelain=v1` so agents can tell durable planning evidence apart from generated exports, config, volatile runtime state, or unknown kit churn before pulling, merging, restoring, or committing.

## Arguments

No arguments.

## Output

The command returns:

- `items`: dirty kit-owned paths with `classification`, `safeAction`, and raw git status.
- `summary`: count by classification.
- `guidance`: short agent-facing reminder to inspect durable/unknown state before destructive git operations.

Known classifications:

- `durable-planning-state`: tracked planning evidence such as `.workspace-kit/tasks/workspace-kit.db`.
- `generated-export`: generated status/export files that should be regenerated from authoritative state.
- `volatile-runtime-state`: transient CAE/runtime traces or caches.
- `kit-config`: workspace-kit config and rules that require intent before commit/restore.
- `unknown-kit-state`: kit-owned paths that need manual inspection.

## Examples

```bash
pnpm exec wk run classify-kit-state '{}'
```
