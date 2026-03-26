{{{AI Documentation Directive}}}

# Release Channels

Operational mapping for `canary`, `stable`, and `lts` channels.

## Channel mapping

{{{
Produce channel to dist-tag/tag/label/compatibility mapping.
Method:
1) Read `docs/maintainers/runbooks/release-channels.md`.
2) Read `docs/maintainers/data/compatibility-matrix.json`.
Output format:
- Markdown table with channel columns used by maintainer doc.
Validation:
- Values must match compatibility matrix source.
}}}

## Promotion and rollback

{{{
Describe promotion prerequisites and rollback strategy.
Method:
1) Read channel runbook and release gate docs.
Output format:
- 3 concise bullets.
Validation:
- Preserve forward-fix rollback model (no tag mutation).
}}}
