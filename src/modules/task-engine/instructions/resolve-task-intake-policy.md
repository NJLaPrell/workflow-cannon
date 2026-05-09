<!--
agentCapsule|v=1|command=resolve-task-intake-policy|module=task-engine|schema_only=pnpm exec wk run resolve-task-intake-policy --schema-only '{}'
-->

# resolve-task-intake-policy

Read-only resolver: turns effective **`tasks.intakePolicy`** workspace config (plus optional module overrides and task metadata hints) into required, recommended, forbidden, and field-rule findings for a task intake context.

Does **not** mutate tasks or config.

## Usage

```
pnpm exec wk run resolve-task-intake-policy '{"action":"create-task","targetStatus":"proposed","type":"execution","title":"My task"}'
pnpm exec wk run resolve-task-intake-policy '{"taskId":"T100113","action":"accept","targetStatus":"ready","moduleId":"task-engine"}'
pnpm exec wk run resolve-task-intake-policy '{"action":"create-ready","moduleId":"improvement","metadata":{"issue":"Problem"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | no | Existing task id (loads row for current fields and metadata). |
| `action` | string | no | Intake context such as `create-task`, `create-ready`, or `accept`. |
| `targetStatus` / `status` | string | no | Target task status for the intake decision. |
| `type` | string | no | Task type for prospective resolution. |
| `moduleId` | string | no | Selects **`tasks.intakePolicy.moduleOverrides.<moduleId>`** when present. |
| `category` | string | no | Category context; defaults from `metadata.category` when present. |
| `phaseKey` | string | no | Phase context. |
| `metadata` | object | no | Metadata fields used for `metadata.*` field paths. |
| `fields` | object | no | Prospective task fields to evaluate. If omitted, top-level args are used as fields. |

**Agent queue mirrors:** `get-next-actions`, `agent-session-snapshot`, and `agent-bootstrap` embed a compact intake snapshot for the suggested task (and short proposed-task headlines when present). Use this command when you need the full `explain` / warning list.

## Response

- **`data.resolvedPolicy`** — **`schemaVersion`**: `1` machine object (profile, enforcement mode, context, required/recommended/forbidden fields, field rules).
- **`data.missingRequiredFields`** — required fields absent or empty in the evaluated task/context.
- **`data.missingRecommendedFields`** — recommended fields absent or empty.
- **`data.forbiddenPresentFields`** — forbidden fields currently present.
- **`data.fieldRuleViolations`** — rule-level findings for `minItems`, `minLength`, `maxLength`, `itemMinLength`, `allowedValues`, and `requiresAny`.
- **`data.explain`** — provenance entries (`task-metadata`, `module-override`, `workspace-default`, `built-in-default`).
- **`data.warnings`** — non-fatal conflicts such as unknown metadata profile keys.
- **`data.precedenceOrder`** — documented evaluation order for overrides.

## Related

- Create-task command — `workspace-kit run create-task`
- Lifecycle transitions — `workspace-kit run run-transition`
