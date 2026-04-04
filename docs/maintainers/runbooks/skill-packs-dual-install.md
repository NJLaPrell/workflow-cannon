# Skill packs: dual install (Claude Code + Workflow Cannon)

## Layout

- **Claude Code:** install under **`.claude/skills/<skill-id>/SKILL.md`** (per [Anthropic Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills)).
- **Workflow Cannon:** default discovery root is **`.claude/skills`** (`skills.discoveryRoots`). The same directory tree satisfies both tools without a second copy when you keep skills under **`.claude/skills/`**.

## Commands (read-first)

- `pnpm run wk run list-skills '{}'`
- `pnpm run wk run inspect-skill '{"skillId":"<id>"}'`
- `pnpm run wk run recommend-skills '{"tags":["example"]}'`

## apply-skill and policy

Default invocation is **preview** (equivalent to `options.dryRun: true`). Non-preview apply and optional audit append require JSON **`policyApproval`** — see **`docs/maintainers/AGENT-CLI-MAP.md`** and **`src/modules/skills/instructions/apply-skill.md`**.

## Task attachments

Set **`metadata.skillIds`** to an array of directory ids (e.g. `["sample-wc-skill"]`). Unknown ids **fail closed** on **`create-task`** / **`update-task`** when the **skills** module is enabled.

## Sample

Shipped example: **`.claude/skills/sample-wc-skill/`**.
