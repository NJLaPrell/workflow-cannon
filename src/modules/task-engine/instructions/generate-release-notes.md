<!--
agentCapsule|v=1|command=generate-release-notes|module=task-engine|schema_only=pnpm exec wk run generate-release-notes --schema-only '{}'
-->

# generate-release-notes

Generate human-friendly, product-owner-style release notes from completed tasks in a phase. Unlike the technical changelog, these notes are written for end users and focus on **what's new**, **what's improved**, and **what's fixed** — not implementation details.

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
  - `overview` — 2-3 sentence overview paragraph
  - `highlights` — top 3-5 user-facing highlights
  - `newFeatures` — array of new feature descriptions
  - `improvements` — array of improvement descriptions
  - `fixes` — array of bug fix descriptions
  - `breakingChanges` — array of breaking change descriptions (when applicable)
  - `migration` — migration notes (when applicable)
- `sourceTaskCount` — number of completed tasks processed
- `sourceTasks` — array of `{taskId, title, changeKind}` for traceability

## Output Formats

### `markdown` (default)

Standard Markdown suitable for documentation or GitHub Releases:

```markdown
# Release 0.99.28: Agent Activity Board

Multi-agent live activity tracking with dashboard integration.

## Highlights

- **Live agent status** — See what agents are working on in real-time
- **Activity timeline** — Track agent progress across tasks
- **Stale detection** — Get alerts when agents go quiet

## New Features

- Multi-lease Agent Activity projection with task enrichment
- Dashboard Agent Activity Board with status chips and attention sorting
- Activity-slice refresh and polling integration

## Improvements

- Dashboard queue rendering now uses narrower projections
- Improved expand/collapse state persistence

## Bug Fixes

- Fixed dashboard terminal task loading performance
```

### `github`

Optimized for GitHub Releases with emoji and collapsible sections.

### `plain`

Plain text without Markdown formatting.

## Structured Failures

- `generate-release-notes-no-tasks` — No completed tasks found for the specified phase
- `generate-release-notes-invalid-phase` — Phase key not found in phase catalog

## How It Works

1. **Gathers completed tasks** for the phase from the task store
2. **Classifies each task** by `metadata.changeKind` (breaking, feature, improvement, fix, chore) or falls back to task `type` heuristics
3. **Extracts user-facing descriptions** from task `summary`, `title`, and `acceptanceCriteria`
4. **Groups and organizes** into sections (highlights, features, improvements, fixes)
5. **Generates human-friendly copy** that focuses on user benefits, not implementation

## Related

- `release-closeout-result` — Final release closeout packet (includes technical evidence)
- `release-evidence-manifest` — Machine-readable release evidence
- `propose-release-version` — SemVer recommendation from task metadata
- `.ai/playbooks/phase-closeout-and-release.md` — Release workflow playbook
