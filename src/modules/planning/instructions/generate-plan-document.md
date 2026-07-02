<!--
agentCapsule|v=1|command=generate-plan-document|module=planning|schema_only=pnpm exec wk run generate-plan-document --schema-only '{}'
-->

# generate-plan-document

Render a unified **IdeaPlan** artifact to maintainer markdown at `docs/maintainers/plans/<ideaId>-<slug>.md`.

## Usage

```bash
pnpm exec wk run generate-plan-document '{"planId":"<uuid>","dryRun":true}'
```

Persist write (Tier B — requires `policyApproval`):

```bash
pnpm exec wk run generate-plan-document '{"planId":"<uuid>","policyApproval":{"confirmed":true,"rationale":"regenerate plan document after acceptance"}}'
```

## Arguments

| Field | Required | Notes |
| --- | --- | --- |
| `planId` | yes | Unified IdeaPlan `planId` (UUID) |
| `version` | no | Defaults to latest stored version |
| `dryRun` | no | When `true`, render only — no file write (Tier C) |

## Output

- `data.outputPath` — repo-relative path (`docs/maintainers/plans/<ideaId>-<slug>.md`)
- `data.renderSummary` — sections rendered vs skipped

## Re-run behavior

Re-running overwrites the same basename derived from `ideaId` and `identity.title` (lowercase, hyphenated, max 60 chars). The file is a snapshot of the latest successful mutation, not versioned separately.

## View and template

- View: `src/modules/documentation/views/plan-document.view.yaml`
- Template: `src/modules/documentation/templates/plan-document.md`
