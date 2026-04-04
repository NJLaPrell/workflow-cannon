# list-components

Read-only: list **component** rows from the relational feature registry (`task_engine_components`). Requires planning SQLite `user_version` 5+.

## Usage

```
workspace-kit run list-components '{}'
```

## Returns

JSON with `components` (`id`, `displayName`, `sortOrder`) and `count`.
