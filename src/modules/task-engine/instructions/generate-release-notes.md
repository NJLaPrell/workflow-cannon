<!--
agentCapsule|v=1|command=generate-release-notes|module=task-engine|schema_only=pnpm exec wk run generate-release-notes --schema-only '{}'
-->

# generate-release-notes

Generate **human-facing release notes** from completed phase tasks. These notes describe **what adopters get**, not how it was built — save command names, schema bumps, and file paths for **`docs/maintainers/CHANGELOG.md`**.

Style and humanization rules are owned by the **documentation module** (`src/modules/documentation/release-notes.ts`, `data/release-notes-style.json`). See **`release-notes-authoring.md`** for the authoring contract.

## Usage

```bash
pnpm exec wk run generate-release-notes '{"phaseKey":"130"}'
pnpm exec wk run generate-release-notes '{"phaseKey":"130","releaseVersion":"0.99.28"}'
pnpm exec wk run generate-release-notes '{"phaseKey":"130","format":"github"}'
pnpm exec wk run generate-release-notes '{"phaseKey":"130","includeBreakingChanges":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Phase key for completed tasks. Defaults to canonical workspace phase. |
| `releaseVersion` | string | no | Version string for the header. Defaults to `package.json` version. |
| `releaseName` | string | no | Optional human-friendly release name (e.g., "Agent Activity Board"). |
| `format` | string | no | Output format: `markdown` (default), `github`, or `plain`. |
| `includeBreakingChanges` | boolean | no | Include a Breaking Changes section when applicable. Defaults to `true`. |
| `includeMigration` | boolean | no | Include migration notes when applicable. Defaults to `true`. |
| `maxFeatures` | number | no | Maximum feature items to include. Defaults to 20. |
| `taskIds` | string[] | no | Explicit task IDs to include (overrides phaseKey filter). |

## Response

Success `data` includes:

- `schemaVersion` — release notes schema version
- `releaseVersion` — version from args or `package.json`
- `releaseName` — human-friendly name if provided
- `phaseKey` — source phase
- `generatedAt` — ISO timestamp
- `markdown` — the full release notes in Markdown format
- `sections` — structured sections object:
  - `headline` — one-line summary
  - `overview` — benefit-oriented overview paragraph
  - `highlights` — top user-facing highlights
  - `newFeatures` — new capability bullets
  - `improvements` — improvement bullets
  - `fixes` — bug fix bullets
  - `breakingChanges` — breaking change bullets (when applicable)
  - `migration` — simplified migration notes (when applicable)
  - `featureGroups` — grouped bullets by feature taxonomy label
- `sourceTaskCount` — number of completed tasks processed
- `sourceTasks` — array of `{taskId, title, changeKind, includedInPublicSections}` for traceability

## Output formats

### `markdown` (default)

User-facing Markdown with a changelog pointer footer:

```markdown
# Release 0.99.28: Agent Activity Board

This release delivers **Agent Activity Board**. Includes 2 new capabilities, 1 improvement.

## Highlights

- See what every agent is working on from a single live dashboard
- Get alerts when an agent goes quiet
- Dashboard layout stays put after you refresh

## New Features

### Cursor extension & dashboard

- See what every agent is working on from a single live dashboard
- Status badges and priority sorting on the activity board

## Improvements

- Faster background updates on the dashboard

## Bug Fixes

- Dashboard layout stays put after you refresh

---

_For command names, schema changes, and maintainer-level detail, see `docs/maintainers/CHANGELOG.md`._
```

### `github`

GitHub Releases layout with emoji headings and a changelog link footer.

### `plain`

Plain text without Markdown formatting.

## Structured failures

- `generate-release-notes-no-tasks` — No completed tasks found for the specified phase
- `generate-release-notes-invalid-phase` — Phase key not found in phase catalog

## How it works

1. **Gathers completed tasks** for the phase from the task store
2. **Classifies each task** by `metadata.changeKind` or task `type`
3. **Resolves user-facing copy** using documentation-module style rules:
   - Prefer `metadata.releaseNoteSummary` / `metadata.userFacingSummary`
   - Fall back to acceptance criteria, then humanized summary/title
   - Strip commands, paths, schema tokens, and internal jargon
   - Group by feature taxonomy when multiple areas ship together
4. **Omits internal/chore tasks** unless explicitly marked for release notes
5. **Links to the changelog** for technical detail — release notes stay benefit-focused

## Related

- `release-notes-authoring` — documentation module authoring contract
- `release-closeout-result` — Final release closeout packet (includes technical evidence)
- `release-evidence-manifest` — Machine-readable release evidence
- `propose-release-version` — SemVer recommendation from task metadata
- `.ai/playbooks/phase-closeout-and-release.md` — Release workflow playbook
