<!--
agentCapsule|v=1|command=assign-task-phase|module=task-engine|schema_only=pnpm exec wk run assign-task-phase --schema-only '{}'
-->

# assign-task-phase

Sets **`phaseKey`** and **`phase`** on a task using the same validation path as **`update-task`**, without a generic **`updates`** object. Prefer this for maintainer phase bucketing (replaces ad-hoc **`update-task`** scripts for phase-only changes). That phase key is picked up by **`list-phase-catalog`** and the dashboard Phase roster (merged with **`kit_phase_catalog`** and workspace current/next), including for **completed** and **cancelled** tasks; use **`upsert-phase-catalog-entry`** when you want a **`shortDescription`** in the catalog table.

## Usage

```
workspace-kit run assign-task-phase '<json>'
```

## Phase ladder vs workspace current

When the workspace has a resolvable **current kit phase number**, **`phaseKey`s whose leading digits sort **strictly before** that number are rejected with **`phase-target-before-current-workspace-phase`**. Keys **equal or higher** are allowed (future-phase planning). Keys **without** leading digits skip numeric comparison (opaque buckets).

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `taskId` | Yes | Task id (`T###` or other store id). |
| `phaseKey` | Yes | Stable phase key (letters, digits, `.`, `_`, `-`; max 64 chars). |
| `phase` | No | Free-text phase label; defaults to `Phase <phaseKey>` when omitted. |
| `clientMutationId` | No | Idempotency key (same semantics as **`update-task`**). |
| `actor` | No | Optional actor override. |

## Example

```bash
workspace-kit run assign-task-phase '{"taskId":"T900","phaseKey":"43","phase":"Phase 43 (Platform refactors)"}'
```

## See also

- **`clear-task-phase`** — remove **`phase`** / **`phaseKey`**
- **`update-task`** — arbitrary mutable fields
