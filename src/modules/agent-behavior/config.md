# Agent behavior module configuration

Uses workspace **task persistence** settings for storage:

- When `tasks.persistenceBackend` is `json`, state is stored at `.workspace-kit/agent-behavior/state.json`.
- When `tasks.persistenceBackend` is `sqlite`, state is stored in unified `workspace_module_state` for `module_id` **`agent-behavior`** (same file as `tasks.sqliteDatabaseRelativePath`).

Interview sessions always use `.workspace-kit/agent-behavior/interview-session.json` (JSON file).

See `docs/maintainers/plans/agent-behavior-module.md` for semantics.
