<!--
agentCapsule|v=1|command=cae-import-guidance-pack-dry-run|module=context-activation|schema_only=pnpm exec wk run cae-import-guidance-pack-dry-run --schema-only '{}'
-->

# cae-import-guidance-pack-dry-run

Read-only dry run: load a guidance pack JSON from disk and compare it to the **active** registry (fingerprints for matching ids; lists ids that would be added).

Tier **C** — no **`policyApproval`**.

## Usage

Save **`data.pack`** from **`cae-export-guidance-pack`** (or the full **`data`** object from that command) as JSON under the workspace, then:

```
workspace-kit run cae-import-guidance-pack-dry-run '{"schemaVersion":1,"packRelativePath":".workspace-kit/tmp/guidance-pack.json"}'
```

The file may be:

- A raw **guidance pack** object (`schemaVersion` **1**, **`artifacts`**, **`activations`**),
- `{ "schemaVersion": 1, "pack": { ... } }` (matches **`cae-export-guidance-pack`** **`data`**), or
- A full CLI-shaped object with **`data.pack`**.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `packRelativePath` | string | yes | Path relative to workspace root to the pack JSON file. |

## Returns

`ok: true`, **`code`**: `cae-import-guidance-pack-dry-run-ok`, **`data`** with **`schemaVersion`**: **1**, **`artifactConflicts`**, **`activationConflicts`**, **`artifactsWouldAdd`**, **`activationsWouldAdd`**.
