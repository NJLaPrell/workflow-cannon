# build-plan

Create a planning-workflow scaffold and return the selected planning type context.

## Usage

```bash
workspace-kit run build-plan '{"planningType":"new-feature"}'
```

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.

## Returns

Scaffold metadata for the selected planning type; subsequent Phase 17 slices add adaptive question flow and wishlist artifact generation.
