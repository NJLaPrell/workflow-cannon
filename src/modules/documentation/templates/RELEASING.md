{{{AI Documentation Directive}}}

# Releasing

Canonical release process for `@workflow-cannon/workspace-kit`.

This document defines how releases are planned, validated, published, and reviewed in Phase 0.

## Release intent

{{{
List what every release must achieve (predictability, compatibility, evidence, feedback loop).
Method:
1) Read `docs/maintainers/RELEASING.md` if present, `package.json` name field, and `README.md` for release posture.
2) Align bullets with principles: evidence, safety, human review for risky changes.
Output format:
- 4-6 bullets starting with verbs or noun phrases; parallel structure.
Validation:
- Mention packaged-artifact validation if the roadmap or tasks require it for the current phase.
}}}

## Release principles

{{{
State named principles (e.g. package-first truth, evidence over assumption).
Method:
1) Extract from current `docs/maintainers/RELEASING.md` and team norms in `.ai/PRINCIPLES.md`.
2) Use bold labels for principle names when the source uses them.
Output format:
- Bullet list with optional **bold** lead-in per item.
Validation:
- Do not promise automation steps that are not implemented; describe intent-level principles only.
}}}

## Release readiness gates

{{{
Enumerate gates that must pass before publish.
Method:
1) Merge checklist items from `docs/maintainers/RELEASING.md`, `.workspace-kit/tasks/state.json` release-related tasks, and CI/workflow names under `.github/workflows/` if discoverable.
2) Include changelog, tests, consumer parity, migration review, and security review when applicable to the phase.
Output format:
- Numbered list; each item is one gate; sub-bullets only for clarifying checks.
Validation:
- If a gate depends on a doc path, name the path explicitly.
}}}

## Release procedure

{{{
Document a numbered procedure from scope definition through consumer verification.
Method:
1) Follow structure of existing `docs/maintainers/RELEASING.md` (define scope → prepare artifacts → validate → publish → verify).
2) Insert concrete commands only if they appear in `package.json` scripts or maintainer docs.
Output format:
- Numbered phases; use nested bullets for steps; use `##`-level subheadings only if the human doc already uses them.
Validation:
- Include explicit “do not publish if gate fails” behavior.
}}}

## Required release evidence

{{{
List artifacts and references that must be captured for auditability.
Method:
1) Use RELEASING docs and task evidence language from `.workspace-kit/tasks/state.json`.
2) Include version, tag, workflow run links, npm reference, migration notes, risks.
Output format:
- Bullet list; group related items if needed.
Validation:
- State that evidence must be sufficient for another maintainer to reconstruct confidence.
}}}

## Post-release workflow

{{{
Describe follow-up after publish: monitoring, triage, friction capture, task/roadmap updates.
Method:
1) Align with `docs/maintainers/ROADMAP.md` improvement/roadmap language.
Output format:
- Numbered list for main sequence; bullets for feedback loops.
Validation:
- Link follow-up work to `TASKS` and `ROADMAP` paths.
}}}

## Related documents

{{{
Cross-link README, principles, roadmap, tasks, security.
Method:
1) Verify each path exists.
Output format:
- Bullet list with path and one-line description.
Validation:
- Include `docs/maintainers/SECURITY.md` for vulnerability handling expectations.
}}}
