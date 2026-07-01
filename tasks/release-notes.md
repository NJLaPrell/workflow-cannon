---
templateVersion: 1
taskName: release-notes
---

> **Not `workspace-kit`:** This file is a **prompt-only** maintainer template. It does not run the CLI, write task-engine state, or satisfy JSON **`policyApproval`**. To mutate kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# release-notes

Draft **human-facing release notes** — not a changelog dump.

## Rules

- Write for **adopters and operators**, not implementers.
- Lead with **benefits** ("You can now…", "Fixes an issue where…").
- **Do not** include command names, file paths, schema versions, or task IDs.
- Put technical detail in **`docs/maintainers/CHANGELOG.md`** instead.
- Prefer **`metadata.releaseNoteSummary`** on shipped tasks when generating via CLI.

## Output shape

1. One-sentence release headline
2. 2–4 highlight bullets (most important user wins)
3. Grouped sections: **New Features**, **Improvements**, **Bug Fixes**
4. **Breaking Changes** / **Migration** only when adopters must act

## CLI generation

For deterministic output from completed phase tasks:

```bash
pnpm exec wk run generate-release-notes '{"phaseKey":"<N>","format":"github"}'
```

Authoring contract: **`src/modules/documentation/instructions/release-notes-authoring.md`**.

---
**Use:** Open or @-attach `tasks/release-notes.md` with release context.
