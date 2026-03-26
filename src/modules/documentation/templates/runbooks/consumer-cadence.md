{{{AI Documentation Directive}}}

# Consumer Update Cadence

Defines update cadence states for `@workflow-cannon/workspace-kit` consumers and transition validation requirements.

## Cadence states

{{{
Document cadence states and channel intent.
Method:
1) Read `docs/maintainers/runbooks/consumer-cadence.md`.
2) Preserve state names and dist-tags.
Output format:
- Markdown table with state, meaning, npm dist-tag, and consumer action.
Validation:
- State names and tags must match release-channel policy docs.
}}}

## State transitions

{{{
Describe allowed transition paths and recandidate flow.
Method:
1) Read maintainer cadence runbook.
2) Preserve candidate/stable/patch flow semantics.
Output format:
- Diagram block or concise bullets.
Validation:
- Do not introduce unsupported transition paths.
}}}

## Required validation per transition

{{{
Capture required checks for each transition path.
Method:
1) Read `docs/maintainers/release-gate-matrix.md` and cadence runbook.
Output format:
- Subsections by transition with numbered validation steps.
Validation:
- Keep parity and fixture validation requirements explicit.
}}}

## Related documents

{{{
List gate/release/task references used for cadence decisions.
Method:
1) Use related section from maintainer runbook.
Output format:
- Bullets with paths and short purpose.
Validation:
- Include only existing files.
}}}
