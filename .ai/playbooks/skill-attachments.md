# Skill attachments on execution tasks (v1)

Ordered direction set: attach discovered **skill pack** ids to **`T###`** rows for agent context.

## Preconditions

- Skills live under **`skills.discoveryRoots`** (default **`.claude/skills/<id>/SKILL.md`**). See **`docs/maintainers/adrs/ADR-skill-packs-v1.md`** and **`docs/maintainers/runbooks/skill-packs-dual-install.md`**.

## Steps

1. **Discover ids** — `pnpm exec wk run list-skills '{}'`.
2. **Attach** — On **`create-task`** or **`update-task`**, set **`metadata.skillIds`** to a JSON array of string ids (must match **`list-skills`**).
3. **Verify** — `pnpm exec wk run get-task '{"taskId":"T###"}'` → **`task.metadata.skillIds`**.

Invalid or unknown ids **fail closed** (**`unknown-skill-id`**, **`invalid-task-skill-ids`**) when the **skills** module is enabled.

## Playbooks (markdown) convention

Maintainer playbooks may list **`Suggested skillIds:`** in the preamble (copy-paste ids from **`list-skills`**). Keep ids aligned with on-disk directory names.
