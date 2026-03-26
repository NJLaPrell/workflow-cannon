{{{AI Documentation Directive}}}

# Architecture Overview

This document provides a high-level architecture map for Workflow Cannon.

## System intent

{{{
Describe the system intent in 2-4 sentences by reading `README.md`, `docs/maintainers/ROADMAP.md`, and `.ai/PRINCIPLES.md`.
Method:
1) Extract what the product is for and what it is not for from README and roadmap scope sections.
2) Align with modular workflow, safety, and traceability themes from principles.
Output format:
- One short paragraph; no bullet list unless the source docs use bullets for intent.
Validation:
- Do not invent features not implied by the repository sources.
- If scope is ambiguous, state assumptions explicitly in one clause.
}}}

## Core architectural directions

{{{
Produce 5-7 bullet points describing stable architectural directions (not implementation detail).
Method:
1) Derive from roadmap phase descriptions, ARCHITECTURE-related task references, and module/registry language in code comments or `docs/maintainers/ARCHITECTURE.md` if present.
2) Include modularity, task/planning, policy, improvement loop, and observability only when supported by sources.
Output format:
- Markdown bullet list; each bullet starts with a noun phrase or short clause.
Validation:
- Avoid version numbers and task IDs in this section.
}}}

## Key building blocks

{{{
List the major logical components and how they relate at a high level.
Method:
1) Inspect `docs/maintainers/ARCHITECTURE.md`, module layout under `src/`, and roadmap phase outcomes.
2) Name blocks as they appear in maintainer docs (e.g. Task Engine, registry, documentation module) when those names exist.
Output format:
- Bullet list of building blocks; optional one-line parenthetical per item for responsibility.
Validation:
- Do not name internal file paths unless they are already cited as public extension points in maintainer docs.
}}}

## Foundational design principles

{{{
Summarize design principles that bridge architecture and implementation norms.
Method:
1) Pull safety, determinism, explainability, migration, and doc/runtime boundary rules from `.ai/PRINCIPLES.md` and human principles companion.
2) Prefer imperative, testable statements over slogans.
Output format:
- 4-6 bullets; parallel structure.
Validation:
- Must not contradict the decision priority order in principles docs.
}}}

## Related docs

{{{
Emit cross-links to planning and execution surfaces.
Method:
1) Confirm paths exist: `docs/maintainers/ROADMAP.md`, `.workspace-kit/tasks/state.json`, and `docs/maintainers/RELEASING.md` when release behavior is architecture-relevant.
2) Add `.ai/PRINCIPLES.md` or module-build references only if cited elsewhere in this doc set.
Output format:
- Bulleted list of paths with a short “what this covers” fragment after each.
Validation:
- Every path listed must exist in the workspace.
}}}
