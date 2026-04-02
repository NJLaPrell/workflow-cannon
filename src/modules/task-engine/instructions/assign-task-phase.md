# assign-task-phase

Sets **`phaseKey`** and **`phase`** on a task using the same validation path as **`update-task`**, without a generic **`updates`** object. Prefer this for maintainer phase bucketing (replaces ad-hoc **`update-task`** scripts for phase-only changes).

## Usage

```
workspace-kit run assign-task-phase '<json>'
```

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
