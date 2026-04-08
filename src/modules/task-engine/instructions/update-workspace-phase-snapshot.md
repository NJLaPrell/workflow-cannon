# update-workspace-phase-snapshot

Atomically updates **`current_kit_phase`** and/or **`next_kit_phase`** in **`docs/maintainers/data/workspace-kit-status.yaml`**. Other keys, list items, comments, and whitespace outside those single-line scalars are preserved as a byte-level string replace (not a full YAML round-trip).

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

On success (non-dry-run), this command **mirrors** the updated YAML snapshot into **`kit_workspace_status`** when planning SQLite is **v10+**. **`kit.currentPhaseNumber`** is a **bootstrap / UX** hint only — it does **not** override the DB row; **`doctor`** may print a note when config disagrees with SQLite but does **not** fail for that alone. Updating this command does **not** change project config (see **`docs/maintainers/POLICY-APPROVAL.md`** for **`config`** mutations).

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
