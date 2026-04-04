# ADR: Skill packs v1 (Claude Code–shaped interoperability)

## Status

Accepted — Phase 54 (`T640`–`T644`).

## Context

Workflow Cannon needs a **versioned, inspectable** way to ship reusable agent instruction packs. Many teams already use **Claude Code** skills: a per-skill directory under **`.claude/skills/<skill-id>/`** with a **`SKILL.md`** file (YAML frontmatter + Markdown body). We want those trees to work **without a second authoring surface** when possible.

Provenance: wishlist **`T564`** (referenced from execution task **`T640`**).

Official Claude Code skills documentation (layout, `SKILL.md`, frontmatter): [https://docs.anthropic.com/en/docs/claude-code/skills](https://docs.anthropic.com/en/docs/claude-code/skills) — cite when evolving this ADR.

## Decision

1. **Canonical on-disk layout (interoperable)**  
   - One skill = one directory under a configured discovery root (default **`.claude/skills/`**).  
   - **Required file:** **`SKILL.md`** with YAML frontmatter.  
   - **Kit skill id** = **directory name** (`<skill-id>`), not the frontmatter `name` string (which may contain spaces). Frontmatter `name` maps to **displayName** when no sidecar overrides it.

2. **Optional sidecar:** **`workspace-kit-skill.json`** in the same directory  
   - Validates against **`schemas/skill-pack-manifest.schema.json`**.  
   - **`id` in the sidecar must equal the directory name** (fail closed on mismatch).  
   - Use when Workflow Cannon needs metadata Claude’s layout cannot express (extra tags, declared command names, policy hints).  
   - **Claude-only frontmatter keys** not listed below are **ignored** by v1 kit parsers (no error).

3. **Frontmatter fields (v1)**  
   - **`name`** (string): human label → **displayName** when no sidecar.  
   - **`description`** (string): short summary for `list-skills` / `recommend-skills`.  
   - **`tags`** (optional): comma-separated list on one line, e.g. `tags: docs, release` → **discoveryTags**.

4. **Instructions body**  
   - Markdown after the closing frontmatter delimiter is the **primary instruction body** for **`apply-skill`**.

5. **Non-goals (v1)**  
   - No execution of bundled scripts; paths under `scripts/` may be listed in inspect output for human reference only.  
   - No webhook or network fetch from skill packs.  
   - Unsupported Claude runtime knobs remain **no-ops** in kit CLI (documented here).

## Consequences

- Packs are **discoverable** (`list-skills`), **inspectable** (`inspect-skill`), and **applicable** (`apply-skill`) with explicit **policy** lanes (see **`AGENT-CLI-MAP.md`**).  
- **Task attachments** use **`metadata.skillIds`** (string array of directory ids); mutations **fail closed** if an id is unknown at validation time (when the **skills** module is enabled — see implementation).  
- **Deterministic ordering**: skill lists and recommendations sort by **`id`**.

## Appendix: minimal Claude-shaped example

Shipped sample: **`.claude/skills/sample-wc-skill/`** (valid for both Claude Code and default Workflow Cannon discovery).
