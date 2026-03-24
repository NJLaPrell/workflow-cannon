{{{AI Documentation Directive}}}

# AGENTS

Basic operating guidance for AI agents working in this repository.

## Source-of-truth order

{{{
Generate a ranked source-of-truth list by discovering governance and execution documents in this repository.
Method:
1) Read the canonical principles/rules file under `/.ai` first to establish decision priority and approval gates.
2) Read module-development governance under `/.ai` next to capture implementation constraints.
3) Read maintainership planning docs under `docs/maintainers/` to determine strategy (`ROADMAP`), execution queue (`TASKS`), and release process (`RELEASING`).
4) Read terminology/glossary docs to normalize language used in the section.
5) Include any direct human companion doc for module governance as the last authority tier.
Output format:
- Numbered list in descending precedence.
- Each line includes a path and a short "what this controls" phrase.
Validation:
- Confirm each referenced file exists before emitting.
- Ensure higher-ranked docs can override lower-ranked docs.
}}}

## Core expectations

{{{
Generate behavioral expectations for agents by extracting normative statements (`must`, `must_not`, `should`) from the top-ranked governance docs.
Method:
1) Pull autonomy posture and conflict-handling behavior from principles/rules docs.
2) Pull approval-gated action categories from release/policy guidance.
3) Pull implementation posture from module build guidance (reversible, evidence-backed, deterministic).
Output format:
- 4-6 concise bullets in imperative style.
- One nested bullet group may be used for approval-gated action categories.
Validation:
- Do not invent expectations not present in source docs.
- Prioritize clarity over verbosity.
}}}

## Working rules

{{{
Generate repository working rules by mapping responsibilities to the correct document surfaces.
Method:
1) Identify which file governs strategy, which governs execution queue, and which governs release operations.
2) Add a synchronization rule requiring related docs to be updated in the same change set when scope changes.
3) Add a compatibility/determinism rule derived from principles and release guidance.
Output format:
- 3-5 bullets, each phrased as an enforceable rule.
Validation:
- Rules must reference real file paths.
- Avoid duplicating deep procedure content; keep this section as operating constraints.
}}}

## Task execution

{{{
Generate task-execution directives from the active task-tracking format.
Method:
1) Inspect task metadata fields used for ordering and completion criteria.
2) Derive execution order behavior from dependency fields.
3) Derive implementation constraints from task detail fields (approach/scope/acceptance).
4) Include a task-splitting rule for oversized work items.
Output format:
- 3-4 short action bullets.
Validation:
- Instructions must align with the current task schema and status markers.
- Do not include project-specific task IDs in this section.
}}}
