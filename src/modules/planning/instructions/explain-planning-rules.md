# explain-planning-rules

Explain effective planning defaults and resolved rule pack questions for one planning type.

## Usage

```bash
workspace-kit run explain-planning-rules '{"planningType":"new-feature"}'
```

## Arguments

- `planningType` (required): one of `task-breakdown`, `sprint-phase`, `task-ordering`, `new-feature`, `change`.

## Returns

- `responseSchemaVersion`
- `defaultQuestionDepth`
- `hardBlockCriticalUnknowns`
- `adaptiveFinalizePolicy`
- resolved `baseQuestions`
- resolved `adaptiveQuestions`
