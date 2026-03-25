# Workflow Cannon Terms

Project-specific glossary for consistent language across AI-agent guidance, planning, execution, and release workflows.

## How to use this glossary

- Prefer these terms in docs, tasks, PRs, and release notes.
- If a new term appears repeatedly, add it here before broad adoption.
- Keep definitions operational and specific to Workflow Cannon.
- For each term, keep one primary definition source and one optional enforcement surface.
- When in doubt, check `.ai/PRINCIPLES.md` for the canonical decision language.

## Definition surfaces

- **Canonical glossary**: `docs/maintainers/TERMS.md` (this file) — primary definitions
- **Canonical goals and principles**: `.ai/PRINCIPLES.md` — decision rules and trade-off order
- **Project intent and boundaries**: `README.md`, `docs/maintainers/ROADMAP.md`, `docs/maintainers/ARCHITECTURE.md`
- **Execution and planning**: `docs/maintainers/TASKS.md` — task queue and dependencies
- **Operational runbooks/playbooks**: `docs/maintainers/RELEASING.md` and files under `docs/maintainers/`
- **Agent enforcement layer**: `.cursor/rules/*.mdc` — editor/agent behavior rules
- **Reusable agent task templates**: `tasks/*.md`

## Terms and definitions

- **Directive**
  - **Definition**: High-level intent that tells the agent what outcome to optimize for.
  - **Defined in**: `docs/maintainers/TERMS.md` and supporting rationale in `README.md` / `docs/maintainers/ROADMAP.md`.
  - **Enforced in**: `.cursor/rules/` guidance files (when present).

- **Goal**
  - **Definition**: A desired project outcome used to evaluate progress and direction.
  - **Defined in**: `.ai/PRINCIPLES.md` and `README.md`.
  - **Enforced in**: planning and prioritization across `docs/maintainers/ROADMAP.md` and `docs/maintainers/TASKS.md`.

- **Principle**
  - **Definition**: A cross-cutting decision rule that guides trade-offs across features and implementation choices.
  - **Defined in**: `.ai/PRINCIPLES.md`.
  - **Enforced in**: `.cursor/rules/project-principles.mdc` and project reviews.

- **Rule**
  - **Definition**: Mandatory constraint (`must`/`must not`) that the agent cannot violate.
  - **Defined in**: `docs/maintainers/TERMS.md`; project-specific rule statements in dedicated docs.
  - **Enforced in**: `.cursor/rules/*.mdc`.

- **Guardrail**
  - **Definition**: Safety boundary that limits risky behavior while still allowing progress.
  - **Defined in**: `docs/maintainers/TERMS.md`, `docs/maintainers/RELEASING.md`, and security/process docs.
  - **Enforced in**: `.cursor/rules/*.mdc` and release gates.

- **Policy**
  - **Definition**: Decision framework describing what is allowed, denied, or approval-gated.
  - **Defined in**: `docs/maintainers/TERMS.md`, `docs/maintainers/ROADMAP.md`, future policy docs.
  - **Enforced in**: runtime behavior (future) plus `.cursor/rules/*.mdc` (editor/agent layer).

- **Workflow**
  - **Definition**: Ordered sequence of steps for a recurring job.
  - **Defined in**: `docs/maintainers/RELEASING.md`, `docs/maintainers/`, and task docs.
  - **Enforced in**: task templates in `tasks/*.md` and CI/release checks.

- **Runbook**
  - **Definition**: Incident or recovery workflow for failure scenarios.
  - **Defined in**: `docs/maintainers/` and operational docs (including `docs/maintainers/RELEASING.md` where relevant).
  - **Enforced in**: incident execution and post-incident review.

- **Playbook**
  - **Definition**: Reusable strategy for a class of work, broader than a single workflow.
  - **Defined in**: `docs/maintainers/` and thematic project docs.
  - **Enforced in**: planning and execution norms in `docs/maintainers/TASKS.md` / team process.

- **Template Contract**
  - **Definition**: Required structure, fields, and formatting guarantees for generated outputs.
  - **Defined in**: `docs/maintainers/TERMS.md`, `tasks/*.md`, and feature/architecture docs when applicable.
  - **Enforced in**: template checks, tests, and review gates.

- **Approval Gate**
  - **Definition**: Checkpoint where explicit human confirmation is required before proceeding.
  - **Defined in**: `docs/maintainers/RELEASING.md` and policy docs.
  - **Enforced in**: release process and approval workflows.

- **Evidence Requirement**
  - **Definition**: Minimum proof artifacts needed to treat work as valid and releasable.
  - **Defined in**: `docs/maintainers/RELEASING.md`, `docs/maintainers/TASKS.md`, and this glossary.
  - **Enforced in**: release checklist and PR/review expectations.

- **Escalation Trigger**
  - **Definition**: Condition that requires the agent to stop autonomous action and ask for human input.
  - **Defined in**: `docs/maintainers/TERMS.md` and agent rule files.
  - **Enforced in**: `.cursor/rules/*.mdc` and operator review behavior.

- **Capability Pack**
  - **Definition**: Modular bundle of rules, directives, and templates that defines a behavior profile.
  - **Defined in**: future capability-pack docs and roadmap/task references.
  - **Enforced in**: activation/sync workflows and rule/template loading behavior.

## Related docs

- `README.md` — project intent and direction
- `.ai/PRINCIPLES.md` — project goals and decision principles
- `docs/maintainers/ROADMAP.md` — strategic decisions and phase context
- `docs/maintainers/TASKS.md` — active execution state
- `docs/maintainers/RELEASING.md` — release gates and evidence expectations
