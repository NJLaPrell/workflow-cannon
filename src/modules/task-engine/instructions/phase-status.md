# phase-status

Read the canonical workspace phase, drift hints, export freshness, and optional task counts in one JSON payload.

## Usage

```bash
workspace-kit run phase-status '{"includeTaskCounts":true,"includeDriftDetails":true}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| **`includeTaskCounts`** | No | When **`true`**, include current-phase and next-phase task counts grouped by task status. |
| **`includeDriftDetails`** | No | When **`true`**, include human-readable drift detail strings in addition to remediation commands. |

## Behavior

This command is read-only. It reads **`kit_workspace_status`** when present, resolves canonical phase with the same precedence as queue health (workspace status first, config only as fallback), reports project config phase hints, checks the non-authoritative DB export freshness, and optionally counts tasks by phase bucket.

Workspace current phase and task **`phaseKey`** are separate concepts. Task counts use each task’s explicit **`phaseKey`** or inferred **`phase`** label, and the command never changes task rows.

## Response

Returns:

- **`workspaceStatus`**, **`currentKitPhase`**, and **`nextKitPhase`** from SQLite when available.
- **`canonicalPhase`** with source, config phase key, workspace-status phase key, and config-vs-SQLite match status.
- **`configHint`** for **`kit.currentPhaseNumber`** / **`kit.currentPhaseLabel`**.
- **`exportStatus`** for **`docs/maintainers/data/workspace-kit-status.db-export.yaml`**.
- **`remediationSuggestions`** when config or export drift is detected.
- **`taskCounts`** when requested.

## Examples

Cheap phase read:

```bash
workspace-kit run phase-status '{}'
```

Counts and drift details:

```bash
workspace-kit run phase-status '{"includeTaskCounts":true,"includeDriftDetails":true}'
```
