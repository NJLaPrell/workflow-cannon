# create-task-from-plan

Create a task from planning output while preserving provenance metadata.

## Usage

```
workspace-kit run create-task-from-plan '{"id":"T450","title":"Implement plan item","planRef":"plan://feature-x#item-2"}'
```

## Arguments

- Same as `create-task`, plus:
- `planRef` (string, required): provenance pointer to planning source.
