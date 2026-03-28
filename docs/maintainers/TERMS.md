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
- **Execution and planning**: task-engine state (`.workspace-kit/tasks/state.json`) — queue, dependencies, and execution tracking
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
  - **Enforced in**: planning and prioritization across `docs/maintainers/ROADMAP.md`, task-engine state,.

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
  - **Enforced in**: planning and execution norms in task-engine state / team process, surfaced in `.workspace-kit/tasks/state.json`.

- **Template Contract**
  - **Definition**: Required structure, fields, and formatting guarantees for outputs.
  - **Defined in**: `docs/maintainers/TERMS.md`, `tasks/*.md`, and feature/architecture docs when applicable.
  - **Enforced in**: template checks, tests, and review gates.

- **Approval Gate**
  - **Definition**: Checkpoint where explicit human confirmation is required before proceeding.
  - **Defined in**: `docs/maintainers/RELEASING.md` and policy docs.
  - **Enforced in**: release process and approval workflows.

- **Evidence Requirement**
  - **Definition**: Minimum proof artifacts needed to treat work as valid and releasable.
  - **Defined in**: `docs/maintainers/RELEASING.md`, task-engine state contracts, `.workspace-kit/tasks/state.json`, and this glossary.
  - **Enforced in**: release checklist and PR/review expectations.

- **Escalation Trigger**
  - **Definition**: Condition that requires the agent to stop autonomous action and ask for human input.
  - **Defined in**: `docs/maintainers/TERMS.md` and agent rule files.
  - **Enforced in**: `.cursor/rules/*.mdc` and operator review behavior.

- **Capability Pack**
  - **Definition**: Modular bundle of rules, directives, and templates that defines a behavior profile.
  - **Defined in**: future capability-pack docs and roadmap/task references.
  - **Enforced in**: activation/sync workflows and rule/template loading behavior.

- **Wishlist**
  - **Definition**: Ideation record in the `W###` namespace used to capture high-level opportunities before decomposition into execution tasks; excluded from execution planning queues by design.
  - **Defined in**: task-engine wishlist contracts (`src/modules/task-engine/wishlist-types.ts`) and instructions under `src/modules/task-engine/instructions/`.
  - **Enforced in**: Task Engine `create-wishlist` / `update-wishlist` / `convert-wishlist` commands and planning-boundary responses (`scope: tasks-only`).

- **Execution Task**
  - **Definition**: Canonical `T###` task entity that participates in lifecycle transitions (`proposed` → `ready` → `in_progress` → `completed` / `blocked` / `cancelled`) and execution planning queues.
  - **Defined in**: `src/modules/task-engine/types.ts` (`TaskEntity`, `TaskStatus`) and task-engine instruction contracts.
  - **Enforced in**: Task Engine runtime (`run-transition`, queue/summary commands, dependency guards).

- **Improvement Task**
  - **Definition**: Execution task variant (`type: "improvement"`) used for enhancement/backlog work and governed by known-type validation requirements.
  - **Defined in**: Task Engine task type and validation contracts (`src/modules/task-engine/types.ts`, `src/modules/task-engine/task-type-validation.ts`).
  - **Enforced in**: `create-task` / `update-task` validation (`invalid-task-type-requirements`) and improvement workflow docs/tasks.

- **Unified Work Record**
  - **Definition**: Combined conceptual model of execution tasks (`T###`) and wishlist items (`W###`) as one planning surface with variant-specific fields and planning inclusion rules.
  - **Defined in**: `explain-task-engine-model` command output and roadmap/phase guidance where variant behavior is discussed.
  - **Enforced in**: command surfaces that explicitly separate execution planning (`tasks-only`) from wishlist ideation.

- **Agent instruction surface**
  - **Definition**: The union of all module instruction entries with per-row classification: executable via the command router for the current enabled module set vs documentation-only (owning module off or a `requiresPeers` peer missing).
  - **Defined in**: `docs/maintainers/AGENT-CLI-MAP.md`, `src/core/agent-instruction-surface.ts`.
  - **Enforced in**: `workspace-kit doctor --agent-instruction-surface` JSON output and router registration (`ModuleCommandRouter`).

- **Planning module (CLI)**
  - **Definition**: The `planning` capability module that runs guided **`build-plan`** interviews, rule packs, and wishlist artifact composition (`src/modules/planning/`).
  - **Defined in**: `src/modules/planning/`, planning instructions, `docs/maintainers/runbooks/planning-workflow.md`.
  - **Enforced in**: `workspace-kit run` planning commands and planning config keys.

- **Planning persistence (task engine)**
  - **Definition**: Task-engine–owned storage and services for **tasks** and **wishlist** JSON/SQLite documents (`openPlanningStores`, `TaskStore`, `WishlistStore`, migrations) exposed to other modules primarily via **`src/core/planning/`** facade exports.
  - **Defined in**: `src/modules/task-engine/` (stores, `planning-open.ts`), `src/core/planning/index.ts`.
  - **Enforced in**: Task engine commands, atomic `convert-wishlist`, optional SQLite dual store.

- **Optional peer module (`optionalPeers`)**
  - **Definition**: A module id listed on another module’s registration indicating integration when present; **missing optional peers do not block** registry construction (contrast with `dependsOn`).
  - **Defined in**: `src/contracts/module-contract.ts` (`ModuleRegistration.optionalPeers`), module README / build guide.
  - **Enforced in**: Registry validation and command availability (peer-aware features degrade gracefully).

- **Requires peer (`requiresPeers` on an instruction entry)**
  - **Definition**: Additional module ids that must be **enabled** for that **specific command** to register in the router (beyond the owning module).
  - **Defined in**: `ModuleInstructionEntry.requiresPeers` in `src/contracts/module-contract.ts`, `docs/maintainers/AGENT-CLI-MAP.md`.
  - **Enforced in**: `ModuleCommandRouter` registration and `peer-module-disabled` style outcomes when mis-invoked.

- **Documentation-only instruction (degraded)**
  - **Definition**: A declared instruction whose markdown remains valid for manual/agent read-only workflows but is **not** registered as a `workspace-kit run` subcommand for the current config because required modules are disabled.
  - **Defined in**: `docs/maintainers/AGENT-CLI-MAP.md` and `docs/maintainers/POLICY-APPROVAL.md` (policy semantics unchanged).
  - **Enforced in**: router omission + `peer-module-disabled` if a command were invoked without satisfied peers; **does not** replace JSON `policyApproval` or env approval where those tiers apply.

## Related docs

- `README.md` — project intent and direction
- `.ai/PRINCIPLES.md` — project goals and decision principles
- `docs/maintainers/ROADMAP.md` — strategic decisions and phase context
- `.workspace-kit/tasks/state.json` — canonical active execution state and queue
- `docs/maintainers/RELEASING.md` — release gates and evidence expectations
- `docs/maintainers/ARCHITECTURE.md` — system map (router, policy, persistence, layering)
- `docs/maintainers/AGENT-CLI-MAP.md` — tier table and copy-paste `workspace-kit run` JSON
