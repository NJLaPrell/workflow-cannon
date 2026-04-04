# list-features

Read-only: list **feature** rows from the relational registry (`task_engine_features`). Optional `componentId` filter. Requires `user_version` 5+.

## Usage

```
workspace-kit run list-features '{}'
workspace-kit run list-features '{"componentId":"task-engine-queue"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `componentId` | string | no | Limit to features under this component id |

## Returns

JSON with `features` (`id`, `componentId`, `name`, `covers`), `count`, and `componentId` echo.
