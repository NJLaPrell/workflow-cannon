{{{AI Documentation Directive}}}

# Transcript Automation Baseline (Phase 5)

Canonical design baseline for transcript intelligence automation.

## Scope

{{{
Capture baseline scope and compatibility expectation for follow-on tasks.
Method:
1) Read `docs/maintainers/workbooks/transcript-automation-baseline.md` and `docs/maintainers/ROADMAP.md`.
2) Preserve task ranges and compatibility constraints.
Output format:
- 2 bullets.
Validation:
- Task IDs must match task-engine state and roadmap wording.
}}}

## Command model

{{{
Describe transcript automation commands and behavioral contract.
Method:
1) Read improvement module docs and maintainer workbook.
2) Preserve command names and policy sensitivity.
Output format:
- Bullets grouped by command.
Validation:
- Command names must exist in module instruction surfaces.
}}}

## Config and cadence contract

{{{
Document config keys and cadence decision rules.
Method:
1) Read `src/modules/improvement/config.md` and maintainer workbook.
2) Preserve default values and skip/generate rules.
Output format:
- Key list plus cadence rule bullets.
Validation:
- Keys and defaults must match current config metadata.
}}}

## Safety and observability boundaries

{{{
Summarize privacy/safety constraints and output diagnostics requirements.
Method:
1) Read maintainer workbook and improvement module behavior docs.
Output format:
- 4-6 bullets.
Validation:
- Keep local-only transcript archive default and policy-gated generation behavior.
}}}

## Rollout guardrails

{{{
State constraints for future changes to this baseline.
Method:
1) Read roadmap + workbook guardrail language.
Output format:
- 2-3 bullets.
Validation:
- Require same-change updates for compatibility-impacting baseline changes.
}}}
