# Agent behavior module configuration

Uses workspace **task persistence** settings for storage:

- Workspace state is stored in unified **`workspace_module_state`** for `module_id` **`agent-behavior`** (**`tasks.sqliteDatabaseRelativePath`**). A legacy **`.workspace-kit/agent-behavior/state.json`** may be read once when migrating from file to SQLite.

Interview sessions always use `.workspace-kit/agent-behavior/interview-session.json` (JSON file).

See `docs/maintainers/plans/agent-behavior-module.md` for semantics.
