# get-ready-queue

Get all tasks in `ready` state, sorted by priority (P1 first).

## Usage

```
workspace-kit run get-ready-queue '{}'
workspace-kit run get-ready-queue '{"queueNamespace":"squad-a"}'
```

## Arguments

Optional **`queueNamespace`** — same semantics as **`get-next-actions`** (see **`ADR-task-queue-namespace.md`**). Response includes **`queueNamespace`**: filter applied or **`null`**.

## Returns

Array of `TaskEntity` objects in `ready` state, sorted by priority. P1 tasks appear first, then P2, P3, and tasks without a priority last.
