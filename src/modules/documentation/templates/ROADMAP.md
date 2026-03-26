{{{AI Documentation Directive}}}

# Workflow Cannon Roadmap

Long-range plan and decision log for the Workflow Cannon package and maintainer workflow.

## Scope

{{{
State repository scope and relationship to external consumers or legacy repos.
Method:
1) Read `docs/maintainers/ROADMAP.md`, `README.md`, and any extraction/split notes in maintainer docs.
2) Clarify canonical home vs external consumer/parity fixture language if present.
Output format:
- 2-4 bullets or one short paragraph plus bullets.
Validation:
- Do not invent consumer names; use only what appears in docs.
}}}

## Current state

{{{
Summarize current execution phase, completed task slices, and active queue.
Method:
1) Read `.workspace-kit/tasks/state.json` for execution state, current phase, ready queue, and completed markers.
2) Read `docs/maintainers/ROADMAP.md` for milestone wording.
Output format:
- Short bullets: phase name, completed work summary, active queue references (task IDs allowed here).
Validation:
- Task IDs must match `.workspace-kit/tasks/state.json` at generation time.
}}}

## Phase plan and release cadence

{{{
Introduce the rule that each phase ends with a GitHub release and phases are sequential unless replanned.
Method:
1) Copy cadence rules from `docs/maintainers/ROADMAP.md` if present.
Output format:
- One short paragraph.
Validation:
- Do not add phases not listed in maintainer roadmap unless the user explicitly expands scope.
}}}

### Phase 0 - Foundation hardening -> GitHub release `v0.2.0`

{{{
Document Phase 0 scope, outcome, and exit signals.
Method:
1) Read `.workspace-kit/tasks/state.json` and `docs/maintainers/ROADMAP.md` for Phase 0 task ranges and release target.
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Release version string must match `ROADMAP.md` / `.workspace-kit/tasks/state.json` for Phase 0.
}}}

### Phase 1 - Task Engine core -> GitHub release `v0.3.0`

{{{
Document Phase 1 scope, outcome, and exit signals from maintainer roadmap.
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Align task IDs with `.workspace-kit/tasks/state.json`.
}}}

### Phase 2 - Configuration and policy base -> GitHub release `v0.4.0`

{{{
Document Phase 2 scope, outcome, and exit signals.
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Align task IDs with `.workspace-kit/tasks/state.json`.
}}}

### Phase 2b - Config policy hardening + UX / exposure -> GitHub release `v0.4.1`

{{{
Document Phase 2b scope, outcome, and exit signals (policy hardening `T219`–`T220` and config UX `T228`–`T237`; see `.workspace-kit/tasks/state.json` for the draft-ID mapping note).
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Align task IDs with `.workspace-kit/tasks/state.json`.
}}}

### Phase 3 - Enhancement loop MVP -> GitHub release `v0.5.0`

{{{
Document Phase 3 scope, outcome, and exit signals.
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Align task IDs with `.workspace-kit/tasks/state.json`.
}}}

### Phase 4 - Runtime scale and ecosystem -> GitHub release `v0.6.0`

{{{
Document Phase 4 scope, outcome, and exit signals.
Output format:
- Bullets for primary scope, outcome, exit signals.
Validation:
- Align task IDs with `.workspace-kit/tasks/state.json`.
}}}

## Recorded decisions

{{{
Maintain a decision log table for major irreversible choices.
Method:
1) Preserve existing rows from `docs/maintainers/ROADMAP.md` when updating.
2) Add new rows only when `docs/maintainers/DECISIONS.md` or `.workspace-kit/tasks/state.json` records a new decision worth surfacing here.
Output format:
- Markdown table with columns: Decision | Choice
Validation:
- Do not remove historical decisions; append or mark superseded if the repo uses that convention.
}}}

## Execution evidence snapshot

{{{
Record provenance for extraction split and first publish when applicable.
Method:
1) Read freeze SHA, split SHA, workflow run URLs, and npm links from `docs/maintainers/ROADMAP.md` or linked evidence.
2) If SHAs are not in repo, leave explicit placeholders or omit if instructed by user.
Output format:
- Bullets: freeze commit, split commit, workflow run link, npm package link.
Validation:
- Prefer exact strings from existing maintainer docs over invention.
}}}
