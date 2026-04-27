# update-workspace-phase-snapshot

Compatibility command that atomically updates **`current_kit_phase`** and/or **`next_kit_phase`** in **`docs/maintainers/data/workspace-kit-status.yaml`**, then mirrors the parsed snapshot into **`kit_workspace_status`** when available. For the happy-path workspace phase rollover, prefer **`set-current-phase`**; for read-only discovery, prefer **`phase-status`**.

## Usage

```
workspace-kit run update-workspace-phase-snapshot '<json>'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `currentKitPhase` | No | New value for `current_kit_phase` (string). |
| `nextKitPhase` | No | New value for `next_kit_phase` (string), or JSON **`null`** to remove the `next_kit_phase` line. |
| `dryRun` | No | When **`true`**, compute the new snapshot and return **`snapshotBefore`** / **`snapshotAfter`** without writing the file. |

At least one of **`currentKitPhase`** or **`nextKitPhase`** must be present. **`currentKitPhase`** must not be **`null`**.

Values must be non-empty, single-line strings (max 120 chars after trim); control characters are rejected.

## Relationship to config, SQLite, and doctor

On success (non-dry-run), this compatibility command updates SQLite **before** writing the legacy YAML surface. When **`currentKitPhase`** is provided, it routes through **`set-current-phase`** internally so config hints and the non-authoritative DB export stay aligned. When only **`nextKitPhase`** is provided, it patches **`kit_workspace_status.next_kit_phase`**, writes the DB export, then updates the YAML compatibility file. If SQLite/export update fails, the command refuses to write YAML and returns a repair hint.

**`kit.currentPhaseNumber`** is a **bootstrap / UX** hint only — it does **not** override the DB row; **`doctor`** may print a note when config disagrees with SQLite but does **not** fail for that alone. Use **`set-current-phase`** directly when you want the happy-path SQLite-first flow.

Per-task **`phaseKey`** in the task store is independent: maintainer YAML + SQLite workspace status are **workspace-level** snapshots, not the execution queue.

## Examples

Dry run:

```bash
workspace-kit run update-workspace-phase-snapshot '{"currentKitPhase":"43","nextKitPhase":"44","dryRun":true}'
```

Apply:

```bash
workspace-kit run update-workspace-phase-snapshot '{"currentKitPhase":"43","nextKitPhase":"44"}'
```

Clear **`next_kit_phase`** (removes the line; parsers treat missing key as null):

```bash
workspace-kit run update-workspace-phase-snapshot '{"nextKitPhase":null}'
```

## Response template (CLI shaping)

Non-dry-run success uses the builtin **`phase_ship`** response template by default (unless overridden by **`responseTemplateId`**, a directive, or **`responseTemplates.commandOverrides`**) so **`data.presentation.matchedSections`** highlights **`snapshotBefore`**, **`snapshotAfter`**, etc. Dry-run responses keep the normal manifest/default template chain. See **`docs/maintainers/response-template-contract.md`**.
