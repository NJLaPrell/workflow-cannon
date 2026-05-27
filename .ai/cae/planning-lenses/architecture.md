# Planning lens: architecture

**Activate when:** `identity.planningType` is `new-feature` or `change`; `technicalImpact.systemsTouched` spans multiple modules; **full-feature** / **refactor** profiles.

## Intent

Surface structural decisions before WBS rows hard-code the wrong boundaries.

## Agent checklist

- `architecture.overview` explains module boundaries (planning module, task-engine, extension, core facades).
- Major decisions recorded in `architecture.decisions[]` with rationale (not chat-only).
- No business logic in the Cursor extension; kit commands own mutations.
- Plan storage matches **A-ARCH**: JSON artifacts + module-state index, not task DB blobs.
- Import direction: modules → `src/core/planning/`, not reverse.

## Prompts

- Which layer owns persistence vs UI vs review rules?
- What is the single command pipeline (draft → review → accept → finalize)?
- What existing paths (`build-plan`, `persist-planning-execution-drafts`) are reused?

## Anti-signals

- "We'll figure out storage later" with WBS rows already assigned to implementers.
