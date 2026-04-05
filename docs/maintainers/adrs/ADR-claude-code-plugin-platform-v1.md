# ADR: Claude Code plugin platform v1 (Workflow Cannon)

## Status

Accepted — Phase **61** (`T684`–`T687`), targets package **`v0.61.0`**.

## Context

Anthropic documents Claude Code plugins as directories with a manifest at **`.claude-plugin/plugin.json`** (plugin root). Maintainers need:

- A cited compatibility baseline against published Claude layout and field semantics.
- Deterministic JSON validation for `plugin.json` plus path rules Claude enforces for component references.
- Workspace-kit configuration for filesystem discovery roots.
- Read-only discovery for agents, optional SQLite-backed enable/disable and copy-install, and maintainer-visible diagnostics (`list-plugins`, `inspect-plugin`, `workspace-kit doctor`).

## References (official)

- Create plugins — [https://docs.anthropic.com/en/docs/claude-code/plugins](https://docs.anthropic.com/en/docs/claude-code/plugins)
- Plugins reference — [https://code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference)
- Manifest field reference (Claude Code repo) — [https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/plugin-structure/references/manifest-reference.md](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/plugin-structure/references/manifest-reference.md)

## Decision

1. **Layout parity** — A Workflow Cannon “plugin package” is a directory immediately under a configured discovery root, containing **`<plugin>/.claude-plugin/plugin.json`**, matching the path requirement in the manifest reference above.
2. **Validation** — Ship **`schemas/claude-plugin-manifest.schema.json`** (JSON Schema, draft 2020-12) loaded via Ajv at runtime. Top-level unknown properties are allowed for forward compatibility with Claude manifest evolution; declared fields are type-checked. After schema validation, enforce Claude relative-path rules for string **`commands`**, **`agents`**, **`hooks`**, and **`mcpServers`** entries: must start with **`./`**, no **`../`**, no backslashes, not absolute.
3. **Config** — **`plugins.discoveryRoots`**: string array (default **`.claude/plugins`**), same ergonomics as **`skills.discoveryRoots`**.
4. **Persistence (kit SQLite `user_version` 8)** — Table **`kit_plugin_state`**: **`plugin_name`**, **`enabled`**, **`root_relative_path`**, **`installed_via`** (`scan` | `copy-install`), **`updated_at`**. Default enablement when no row exists is **enabled** for filesystem-discovered plugins.
5. **Commands** — **`list-plugins`** / **`inspect-plugin`** (read-only); **`install-plugin`** / **`enable-plugin`** / **`disable-plugin`** (Tier B, **`plugins.persist`**, JSON **`policyApproval`** on the `run` path).
6. **Non-goals (v1)** — Workflow Cannon does **not** execute Claude plugin hooks, load MCP entries, register slash commands, or run install marketplaces. It does **not** interpret **`agents`** / **`commands`** directories beyond validation of manifest path strings. Operators continue to use Claude Code (or compatible hosts) for runtime plugin behavior; the kit surfaces **discovery, validation, persistence, and diagnostics** only.

## Consequences

- Consumers get stable JSON for automation and agents without silent acceptance of broken manifests.
- SQLite migration **7 → 8** adds **`kit_plugin_state`**; **`get-kit-persistence-map`** documents the table.
- Maintainer CI can run **`list-plugins`** / **`inspect-plugin`** against a reference fixture under **`docs/examples/`**.

## Gap list (Claude runtime features not implemented here)

| Claude / manifest area | Workflow Cannon v1 |
| --- | --- |
| Hook execution (`hooks` inline or file) | Not executed; paths validated only when declared as strings |
| MCP server launch (`mcpServers`) | Not executed; paths validated only when declared as strings |
| Command / agent registration from `./commands`, `./agents` | Not loaded; no router integration |
| Plugin marketplaces / dependency graphs | Not supported |
| `${CLAUDE_PLUGIN_ROOT}` substitution at runtime | Not evaluated |

If future phases need execution parity, they must be scoped as new ADRs with separate policy operations and safety review.
