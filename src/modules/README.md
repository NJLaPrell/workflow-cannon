# Modules

Shipped capability modules are registered in **`defaultRegistryModules`** in [`index.ts`](./index.ts). The CLI and `workspace-kit doctor` use that array as the default kit bundle (see [`docs/maintainers/module-build-guide.md`](../docs/maintainers/module-build-guide.md)).

## Shipped modules (default registry order)

| Module id | Role | `dependsOn` |
| --- | --- | --- |
| `workspace-config` | Config explain/resolve and workspace validation helpers | _(none)_ |
| `documentation` | `.ai/` and `docs/maintainers/` doc generation | _(none)_ |
| `agent-behavior` | Advisory interaction profiles (`resolve-behavior-profile`, interview, custom profiles) | _(none)_ |
| `skills` | Skill pack discovery, `apply-skill`, recommendations (Claude-shaped `SKILL.md`) | _(none)_ |
| `plugins` | Claude Code–layout plugin discovery (`list-plugins`, `inspect-plugin`) + SQLite enablement / `install-plugin` | _(none)_ |
| `subagents` | Subagent definitions + session/message log in kit SQLite | _(none)_ |
| `team-execution` | Supervisor/worker assignments + handoff persistence (`user_version` 7+) | _(none)_ |
| `task-engine` | Tasks, wishlist, transitions, dashboard summaries, persistence | _(none)_ |
| `approvals` | Human approval queue for sensitive workflow decisions | _(none)_ |
| `planning` | Guided `build-plan` interviews and wishlist artifact output | _(none)_ |
| `improvement` | Recommendations, transcript ingest, enhancement loop | _(none)_ |

Table order matches the **`defaultRegistryModules`** array in [`index.ts`](./index.ts) (bootstrap-friendly ordering).

## Module contract

Each module should:

- implement **`WorkflowModule`** from [`src/contracts/module-contract.ts`](../contracts/module-contract.ts)
- declare explicit **`dependsOn`**, **`optionalPeers`**, and **`capabilities`**
- define **`config`** and (when applicable) persistence contracts as markdown under the module directory
- define function-like instruction files under **`instructions/`** (names match `workspace-kit run` subcommands when the module is enabled)
- set **`enabledByDefault`** and allow runtime enable/disable via the module registry / workspace config
- **avoid direct imports from sibling modules** (use `core/` facades or shared contracts when sharing types)

## Instruction surface

- Instruction entry **`name`** values are kebab-case command names (example: `document-project`).
- Each entry’s **`file`** is a markdown path under the module’s `instructions/` directory.
- Entries declared in **`registration.instructions.entries`** must correspond to real files on disk.
- Router vs catalog: all declared entries appear in the maintainer instruction catalog; the command router only registers commands for **enabled** modules with satisfied **`requiresPeers`** (see **`docs/maintainers/TERMS.md`** — *Agent instruction surface*).
