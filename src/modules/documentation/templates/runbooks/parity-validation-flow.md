{{{AI Documentation Directive}}}

# Parity Validation Flow

Canonical ordered command chain for validating packaged-artifact parity in `@workflow-cannon/workspace-kit`.

## Purpose

{{{
State why parity validation exists and when it is required.
Method:
1) Read `docs/maintainers/runbooks/parity-validation-flow.md` and `docs/maintainers/RELEASING.md`.
2) Emphasize packaged-artifact truth and release-gate requirement.
Output format:
- One short paragraph.
Validation:
- Preserve release-gate intent; do not weaken fail-closed language.
}}}

## Canonical command chain

{{{
Produce the ordered parity command sequence and expected outcomes.
Method:
1) Read `docs/maintainers/runbooks/parity-validation-flow.md`.
2) Preserve step ordering and command names exactly.
Output format:
- Markdown table: Step | Command | Expected exit | Output artifact | Machine-parseable.
Validation:
- Commands must match runnable scripts/paths in repository.
}}}

## Failure behavior

{{{
Describe hard-failure handling for any non-zero parity step.
Method:
1) Read `scripts/run-parity.mjs` behavior as documented in maintainer runbook.
Output format:
- 3-4 bullets.
Validation:
- Must indicate stop-on-fail behavior and evidence capture.
}}}

## Evidence contract

{{{
Document parity evidence location and key fields.
Method:
1) Read `docs/maintainers/runbooks/parity-validation-flow.md`.
2) Validate schema reference path.
Output format:
- Bullets for location, schema, and key fields.
Validation:
- Keep artifact path and schema path exact.
}}}

## Related documents

{{{
List closely related release and cadence docs.
Method:
1) Read links from maintainer parity runbook.
Output format:
- Bulleted paths with short purpose notes.
Validation:
- Only include files that exist.
}}}
