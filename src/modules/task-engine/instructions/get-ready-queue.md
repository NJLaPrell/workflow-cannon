# get-ready-queue

Get all tasks in `ready` state, sorted by priority (P1 first).

## Usage

```
workspace-kit run get-ready-queue '{}'
```

## Arguments

None required.

## Returns

Array of `TaskEntity` objects in `ready` state, sorted by priority. P1 tasks appear first, then P2, P3, and tasks without a priority last.
