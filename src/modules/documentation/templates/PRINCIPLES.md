{{{AI Documentation Directive}}}

# Workflow Cannon Principles (Human-Readable)

This document is the human-readable companion to `.ai/PRINCIPLES.md` (canonical rules format).  
If there is any conflict, `.ai/PRINCIPLES.md` is authoritative.

## Purpose

{{{
State the purpose of this human-readable principles doc in 2-3 sentences.
Method:
1) Read `.ai/PRINCIPLES.md` and `README.md` for stated goals.
2) Clarify that this file is for humans and agents; canonical machine-oriented rules live under `/.ai`.
Output format:
- Short paragraph.
Validation:
- Do not duplicate long lists from the canonical file; summarize only.
}}}

## Decision Priority Order

{{{
Reproduce the trade-off priority list exactly as defined in `.ai/PRINCIPLES.md`.
Method:
1) Open `.ai/PRINCIPLES.md` and copy the ordered list verbatim.
2) If the canonical file uses different wording, the canonical file wins—update this section to match.
Output format:
- Numbered list 1..n in the canonical order.
Validation:
- Order must match `.ai/PRINCIPLES.md` byte-for-byte on list items.
}}}

## Source of Truth Order

{{{
Describe precedence when sources disagree, aligned with `.ai/PRINCIPLES.md` and `docs/maintainers/TERMS.md` if present.
Method:
1) Prefer explicit precedence from `.ai/PRINCIPLES.md`.
2) Use TERMS glossary for “canonical glossary” vs narrative docs if needed.
Output format:
- Numbered list from highest to lowest precedence.
Validation:
- Must not contradict `.ai/PRINCIPLES.md`.
}}}

## Core Principles

{{{
Expand core principles as concise bullets drawn from `.ai/PRINCIPLES.md` and this file’s prior content if present.
Method:
1) Extract normative statements (must/should) and decision rules.
2) Merge duplicates; keep 8-12 bullets maximum.
Output format:
- Markdown bullet list.
Validation:
- Each bullet should be testable or clearly actionable.
}}}

## Required Human Approval

{{{
List categories of work that require explicit human approval before execution.
Method:
1) Take approval categories from `.ai/PRINCIPLES.md` and `docs/maintainers/RELEASING.md`.
2) Add stop conditions for irreversible harm or secret exposure if stated in principles.
Output format:
- Intro sentence followed by bullet list of approval-gated categories.
Validation:
- Do not remove an approval category that appears in the canonical principles file.
}}}

## Conflict and Override Handling

{{{
Describe soft-gate behavior and where to record overrides.
Method:
1) Use principles and `docs/maintainers/DECISIONS.md` purpose.
2) Reference `docs/maintainers/TASKS.md` for execution tracking of overrides.
Output format:
- 2-4 bullets.
Validation:
- Include at least one path for recording rationale (`TASKS` or `DECISIONS`).
}}}

## Documentation Boundaries

{{{
State which topics belong in ROADMAP vs TASKS vs RELEASING.
Method:
1) Read `docs/maintainers/TERMS.md` for “directive”, “workflow”, and documentation boundary language if helpful.
2) Align with existing README/workflow contract rules in the repo.
Output format:
- One short paragraph plus 3 bullets mapping strategy / execution / release to files.
Validation:
- Paths must be `docs/maintainers/ROADMAP.md`, `docs/maintainers/TASKS.md`, `docs/maintainers/RELEASING.md`.
}}}

## Validation Gates

{{{
Summarize gates before merge/release: release readiness, compatibility, policy-sensitive work.
Method:
1) Pull gate names from `.ai/PRINCIPLES.md`, `docs/maintainers/RELEASING.md`, and this document’s prior version if present.
Output format:
- Short intro then bullet list with bold gate labels.
Validation:
- Each gate must reference what evidence or approval satisfies it.
}}}

## Related References

{{{
List related docs with paths.
Method:
1) Verify existence of each file in the workspace.
2) Include `.ai/PRINCIPLES.md`, `docs/maintainers/ROADMAP.md`, `docs/maintainers/TASKS.md`, `docs/maintainers/DECISIONS.md`, `docs/maintainers/RELEASING.md`, `docs/maintainers/CHANGELOG.md` when present.
Output format:
- Bulleted list of paths.
Validation:
- No broken paths.
}}}
