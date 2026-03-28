# Agent behavior module (Phase 23)

## Layering

**Behavior profiles** describe how an agent should *collaborate*: deliberation depth, when to check in, verbosity, exploration style, and similar preferences. They are **advisory** and **subordinate** to:

- `.ai/PRINCIPLES.md` and maintainer governance docs  
- Policy tiers and `policyApproval` requirements for `workspace-kit run`  
- Task-engine acceptance criteria and explicit user instructions  

If a profile (including `interactionNotes`) appears to conflict with those, **governance wins**; the agent must soft-gate and confirm with the human.

## Identifiers

- **Builtins:** `builtin:<slug>` — shipped with the package, immutable via CLI.  
- **Custom:** `custom:<slug>` — workspace-defined; slug `a-z0-9-` only.

## Precedence (effective profile)

1. Workspace **active** profile id (from persisted state).  
2. If unset or invalid, **`builtin:balanced`**.

`resolve-behavior-profile` returns `effective` plus a **provenance** array explaining which steps applied.

## Persistence

Aligned with task persistence:

- **`tasks.persistenceBackend` `json`:** `.workspace-kit/agent-behavior/state.json`  
- **`sqlite`:** row `module_id = agent-behavior` in unified `workspace_module_state` (same DB as `tasks.sqliteDatabaseRelativePath`)

Document shape: `schemaVersion`, `activeProfileId`, `customProfiles` (map id → profile).

## Interview

`interview-behavior-profile` uses a session file under `.workspace-kit/agent-behavior/interview-session.json` (same as planning’s session-file pattern). Deterministic question flow; no LLM inside the CLI.

## Freeform notes

`interactionNotes` is length-capped; the kit rejects phrases that suggest bypassing policy or approvals (see `validate.ts`).
