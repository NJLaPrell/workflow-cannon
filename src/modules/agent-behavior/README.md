# Agent behavior module

Advisory **interaction profiles** for AI agents (collaboration style). Subordinate to PRINCIPLES and policy — see `docs/maintainers/plans/agent-behavior-module.md`.

**Commands:** `list-behavior-profiles`, `get-behavior-profile`, `resolve-behavior-profile`, `set-active-behavior-profile`, `create-behavior-profile`, `update-behavior-profile`, `delete-behavior-profile`, `diff-behavior-profiles`, `explain-behavior-profiles`, `interview-behavior-profile`.

**Agent guidance (Phase 47):** `resolve-behavior-profile` includes `data.agentGuidance` — effective `kit.agentGuidance` tier (RPG party v1, default tier 2 when unset) plus **`advisoryModulation`** (`explanationDepth`, `checkIns`, `clarifyingQuestions`) derived from **tier ×** the resolved profile’s explanation-verbosity hint. **Advisory only** — does not change stored behavior profiles or bypass policy. Catalog: `docs/maintainers/ADR-agent-guidance-profile-rpg-party-v1.md`.

**Persistence:** Unified SQLite **`workspace_module_state`** row **`agent-behavior`** (same file as **`tasks.sqliteDatabaseRelativePath`**); legacy JSON file is import-only.
