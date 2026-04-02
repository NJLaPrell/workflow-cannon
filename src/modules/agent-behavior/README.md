# Agent behavior module

Advisory **interaction profiles** for AI agents (collaboration style). Subordinate to PRINCIPLES and policy — see `docs/maintainers/plans/agent-behavior-module.md`.

**Commands:** `list-behavior-profiles`, `get-behavior-profile`, `resolve-behavior-profile`, `set-active-behavior-profile`, `create-behavior-profile`, `update-behavior-profile`, `delete-behavior-profile`, `diff-behavior-profiles`, `explain-behavior-profiles`, `interview-behavior-profile`.

**Persistence:** Unified SQLite **`workspace_module_state`** row **`agent-behavior`** (same file as **`tasks.sqliteDatabaseRelativePath`**); legacy JSON file is import-only.
