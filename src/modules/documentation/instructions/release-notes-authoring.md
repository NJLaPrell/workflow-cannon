<!--
agentCapsule|v=1|command=release-notes-authoring|module=documentation|schema_only=pnpm exec wk run release-notes-authoring --schema-only '{}'
-->

# release-notes-authoring

Authoring contract for **human-facing release notes** — distinct from the technical **changelog**.

## Audience split

| Surface | Audience | Content |
| --- | --- | --- |
| **Release notes** (`generate-release-notes`) | End users, adopters, operators | Benefits, capabilities, fixes in plain language |
| **Changelog** (`docs/maintainers/CHANGELOG.md`) | Maintainers, agents, migration planning | Commands, schema versions, file paths, breaking API detail |

Release notes must **not** paste changelog bullets. Generated output links to the changelog for technical depth.

## Style contract

Machine rules live in:

- `src/modules/documentation/data/release-notes-style.json` — strip patterns, internal keywords, benefit framing
- `src/modules/documentation/release-notes.ts` — deterministic humanization used by `generate-release-notes`
- `src/modules/documentation/data/feature-taxonomy.json` — feature grouping labels when task copy is too technical

## Task metadata (preferred source)

When creating or completing tasks that ship to users, set **`metadata.releaseNoteSummary`** (or **`metadata.userFacingSummary`**) with the sentence you want adopters to read.

Example:

```json
{
  "metadata": {
    "changeKind": "feature",
    "releaseNoteSummary": "See what every agent is working on from a single live dashboard."
  },
  "features": ["cursor-extension"]
}
```

Precedence for public bullets:

1. `metadata.releaseNoteSummary`
2. `metadata.userFacingSummary`
3. First user-facing `acceptanceCriteria` entry
4. Humanized `summary` / `title` (technical jargon stripped)
5. Feature taxonomy fallback (`Updates to Dashboard`, etc.)

## Inclusion rules

Public sections include a task when:

- It has explicit release-note metadata, or
- Its humanized description passes the style contract (not mostly internal keywords / paths / commands)

Excluded by default:

- `changeKind: chore` unless overridden with release-note metadata or `metadata.includeInReleaseNotes: true`
- Highly technical summaries with no user-facing fallback

## Maintainer workflow

1. During the phase, write **`metadata.releaseNoteSummary`** on user-visible tasks.
2. Keep **`docs/maintainers/CHANGELOG.md`** technical for gate **G002**.
3. At closeout, run **`generate-release-notes`** for GitHub Releases and user comms.
4. Use **`format: "github"`** when pasting into GitHub Releases.

## Related

- `src/modules/task-engine/instructions/generate-release-notes.md` — CLI command
- `.ai/playbooks/phase-closeout-and-release.md` — closeout step **6b**
- `tasks/release-notes.md` — prompt-only drafting template
