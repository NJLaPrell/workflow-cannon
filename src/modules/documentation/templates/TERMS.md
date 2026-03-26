{{{AI Documentation Directive}}}

# Workflow Cannon Terms

Project-specific glossary for consistent language across AI-agent guidance, planning, execution, and release workflows.

## How to use this glossary

{{{
Rules for adopting and extending terms.
Method:
1) Read the existing `docs/maintainers/TERMS.md` introduction if present.
2) Emphasize operational definitions and single primary source per term.
Output format:
- 3-5 bullets.
Validation:
- Instruct readers to add terms here before broad adoption in other docs.
}}}

## Definition surfaces

{{{
List where canonical definitions live vs enforcement surfaces.
Method:
1) Reproduce structure from `docs/maintainers/TERMS.md`: glossary, principles, README/ROADMAP/ARCHITECTURE, TASKS, RELEASING, `.cursor/rules`, `tasks/*.md` as applicable.
2) Verify paths exist before listing.
Output format:
- Bullet list; each bullet names a surface and its role with **bold** label.
Validation:
- Use consistent path formatting; no broken links.
}}}

## Terms and definitions

{{{
Maintain the glossary entries for this project.
Method:
1) Read the current `docs/maintainers/TERMS.md` term list and preserve entries unless superseded by `docs/maintainers/DECISIONS.md` or explicit renames.
2) For each term, keep three sub-bullets aligned under the term:
   - **Definition**: …
   - **Defined in**: path(s)
   - **Enforced in**: path(s) or mechanism
3) Add new terms when they appear repeatedly in `.workspace-kit/tasks/state.json`, `ROADMAP.md`, or `.cursor/rules` without definitions.
4) Fix indentation so **Definition** / **Defined in** / **Enforced in** are nested under the term bullet, not orphaned.
Output format:
- One top-level bullet per term with nested three-line pattern above.
Validation:
- Alphabetize or group by theme consistently with the prior file; do not duplicate term names.
}}}

## Related docs

{{{
Cross-link README, principles, roadmap, tasks, releasing.
Method:
1) Verify paths exist.
Output format:
- Bulleted list.
Validation:
- Include at least `README.md`, `.ai/PRINCIPLES.md`, `docs/maintainers/ROADMAP.md`, `.workspace-kit/tasks/state.json`, `docs/maintainers/RELEASING.md` when present.
}}}
