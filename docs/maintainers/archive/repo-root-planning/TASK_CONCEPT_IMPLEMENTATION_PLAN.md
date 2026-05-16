# Task Concept Implementation Plan

## Purpose

Workflow Cannon should make the user's concept of work visible to both humans and agents: every item is task-like, but different task types require different information, lifecycle handling, and decomposition behavior.

The target model is:

- A base Task Engine task row is the durable work record.
- Task type determines the intake contract, quality bar, and guidance an agent should apply.
- `proposed` is the universal draft / triage state.
- `ready` means the item has enough information for an agent to execute or confidently route it.
- Agents should avoid opening, promoting, or starting bad tasks.

## Current Reality

The repository already has most of the substrate:

- Task Engine stores a single `TaskEntity` shape with `status`, `type`, `title`, metadata, dependencies, scope, acceptance criteria, and phase fields.
- `proposed` already exists as a normal lifecycle state, not an improvement-only state.
- `wishlist_intake` already exists as task-backed ideation and is excluded from ready-queue suggestions until converted.
- `convert-wishlist` already supports one wishlist intake becoming one or many canonical `T###` tasks.
- `improvement` already exists as a known task type with required `technicalScope`, `acceptanceCriteria`, `metadata.issue`, and `metadata.supportingReasoning`.
- Task Intake Policy already supports required fields, recommended fields, forbidden fields, field rules, advisory mode, enforce-on-accept, and enforce mode.
- CAE already has registry entries and playbooks for wishlist and improvement workflows.

The biggest missing pieces are:

- Bug Reports are not a first-class task type.
- Normal execution tasks do not have a named quality profile.
- The user's desired definition of a good Task / Bug Report / Wishlist Item / Improvement Task is not fully codified in machine-readable policy.
- CAE does not yet consistently activate task-quality guidance from task type, status, command, and transition context.
- Agents can still create or promote underspecified work too easily unless a workspace opts into stronger intake policy.

## High-Level Plan

Implement the concept as typed task intake and activation guidance, not as four disconnected systems.

1. Define the task taxonomy and vocabulary.
2. Add type-specific quality contracts in Task Engine.
3. Add Bug Report as a first-class task type.
4. Strengthen lifecycle behavior around proposed -> ready.
5. Integrate CAE so the right guidance appears at create, triage, conversion, and start time.
6. Update agent-facing docs and command instructions.
7. Add tests and migration-safe compatibility coverage.
8. Seed the actual implementation tasks in Task Engine once this plan is accepted.

## Target Taxonomy

### Base Task

The base task is the shared storage and lifecycle shape. It carries fields such as `id`, `status`, `type`, `title`, `summary`, `description`, `technicalScope`, `acceptanceCriteria`, `metadata`, `dependsOn`, `unblocks`, `phase`, `phaseKey`, and `features`.

### Execution Task

An execution task is work intended to be implemented, validated, and completed. It may use `type: "execution"` or remain a default task type for compatibility, but it should have a named intake profile.

Required when ready:

- Clear title
- Short summary or problem/objective statement
- Technical scope
- Acceptance criteria
- Phase or phase key when phase-based delivery applies
- Dependencies or explicit no-dependency assumption when relevant

Good execution tasks are small enough for one coherent agent pass. If the task contains unrelated modules, multiple independent outcomes, unresolved product design, or ambiguous acceptance, it should be split or kept proposed.

### Bug Report

A bug report is task-like, but its job is to preserve a reproducible defect and the expected correction.

Required when ready:

- Clear title
- Expected behavior
- Actual behavior
- Reproduction steps or observed trigger
- Environment, version, command, config, or workspace state when relevant
- Impact / severity
- Evidence reference such as failing command output, test, log excerpt, screenshot path, or transcript reference
- Acceptance criteria that prove the defect is fixed

Bug reports may later convert into one or more execution tasks if the fix has multiple independent work slices.

### Wishlist Item

A wishlist item is ideation before scheduling. In the current codebase this is `type: "wishlist_intake"`.

Required at intake:

- Title
- Problem statement
- Expected outcome
- Impact
- Constraints
- Success signals
- Requestor
- Evidence reference

Wishlist items must not carry phase as if they were scheduled execution tasks. They become executable only through `convert-wishlist`, which records decomposition and creates one or more canonical tasks.

### Improvement Task

An improvement task captures evidence-backed process, product, documentation, policy, or operator-friction work. It is not a raw transcript dump or vague enhancement wish.

Required when ready:

- Technical scope
- Acceptance criteria
- `metadata.issue`: interpreted problem report with symptom and impact
- `metadata.supportingReasoning`: why this framing is correct, with evidence refs
- Evidence key or provenance when generated by the improvement pipeline

Recommended:

- Proposed solutions
- Confidence tier
- Category or affected module
- Clear triage rationale before promotion to `ready`

## Lifecycle Model

Use one lifecycle across task types:

- `research`: evidence gathering before a task is fully synthesized. Used by pipeline-specific flows such as transcript churn.
- `proposed`: draft, triage, intake, or candidate work.
- `ready`: sufficiently specified and accepted for execution or prioritized attention.
- `in_progress`: actively being worked.
- `blocked`: work cannot proceed without external input or dependency completion.
- `completed`: accepted outcome delivered.
- `cancelled`: rejected, duplicate, stale, false positive, or intentionally not doing.

The universal quality gate is proposed -> ready. Agents may open proposed work with partial information, but should avoid creating `ready` tasks or accepting proposed tasks unless type-specific intake policy passes.

## Decomposition Rules

Agents should split work before opening or promoting a task when any of these are true:

- Multiple independent user-visible outcomes are bundled together.
- Multiple modules can be delivered and validated independently.
- One part is research/design and another part is implementation.
- Acceptance criteria describe unrelated success states.
- The task requires unrelated policy, schema, UI, migration, and documentation work in one pass.
- A wishlist item clearly maps to multiple sequential or parallel execution slices.
- A bug report contains several defects sharing only a symptom area.
- An improvement task discovers a concrete product defect that should become a normal execution or bug task.

When splitting, preserve provenance:

- Parent wishlist or task id
- Rationale for decomposition
- Scope boundaries for each child task
- Dependency intent between child tasks
- Evidence refs reused or narrowed per child

## Part 1: Taxonomy And Vocabulary

Goal: Make the task concepts unambiguous across code, docs, CLI output, and agent behavior.

### Tasks

1. Add canonical terminology for Base Task, Execution Task, Bug Report, Wishlist Item, Improvement Task, Proposed, Ready, and Conversion.
2. Update `.ai/TERMS.md` and any generated terms data source so agents can resolve the vocabulary without reading maintainer prose.
3. Add a compact taxonomy table to Task Engine agent instructions.
4. Document that `type + status` determines behavior; do not add separate lifecycle systems for each type.
5. Add examples showing the same idea as a wishlist item, bug report, improvement task, and execution task.

### Acceptance Criteria

- Agent-facing docs distinguish task types without contradiction.
- Existing `wishlist_intake` and `improvement` behavior is described as part of the taxonomy.
- Bug Report is documented as planned first-class type even before implementation tasks complete.

## Part 2: Task Intake Policy Profiles

Goal: Turn "good task" definitions into machine-readable policy that agents can preflight.

### Tasks

1. Extend the built-in Task Intake Policy profiles with `execution`, `bug_report`, `wishlist_intake`, and richer `improvement` definitions.
2. Add required fields, recommended fields, and field rules for each type.
3. Keep `create-proposed` permissive enough for drafts and intake.
4. Enforce quality on `create-ready` and proposed -> ready when enforcement is configured.
5. Return compact, agent-readable missing-field hints in `list-tasks`, `get-next-actions`, `agent-bootstrap`, and `agent-session-snapshot` where relevant.
6. Add example `resolve-task-intake-policy` invocations for each task type.
7. Add config documentation for how workspaces can move from advisory to enforce-on-accept.

### Acceptance Criteria

- `resolve-task-intake-policy` identifies missing required fields for each task type.
- Proposed tasks can still be created as drafts unless known type validation requires minimal safety fields.
- Ready creation and proposed -> ready promotion can be blocked by policy when enforcement is enabled.
- Agent readouts explain what is missing without dumping large policy objects.

## Part 3: First-Class Bug Reports

Goal: Add Bug Report as a typed task contract rather than an informal generic task.

### Tasks

1. Add `bug_report` to known task type validation.
2. Define bug-specific metadata keys, including `expectedBehavior`, `actualBehavior`, `reproductionSteps`, `environment`, `severity`, `evidenceRef`, and optional `regressionRange`.
3. Decide whether bug report fields live entirely in `metadata` or whether selected fields deserve top-level convenience projections later.
4. Add `create-bug-report` as either a dedicated command or a documented `create-task` wrapper pattern.
5. Add `list-tasks` examples for `type: "bug_report"` and severity metadata filters.
6. Add tests for valid and invalid bug reports.
7. Add conversion guidance for bug reports that should split into multiple execution tasks.

### Acceptance Criteria

- Agents can create a proposed bug report with stable schema.
- Agents cannot promote an incomplete bug report to ready when intake enforcement applies.
- Bug report examples are visible in command instructions.
- Existing generic task behavior remains backward compatible.

## Part 4: Wishlist Conversion Hardening

Goal: Preserve wishlist as ideation and make conversion into execution tasks reliably scoped.

### Tasks

1. Review `create-wishlist`, `list-wishlist`, `get-wishlist`, and `convert-wishlist` instructions for alignment with the taxonomy.
2. Add stronger language that wishlist intake must not include phase or implementation commitment.
3. Add task intake preflight for child tasks produced by `convert-wishlist`.
4. Ensure conversion decomposition requires rationale, boundaries, and dependency intent.
5. Add examples for one wishlist -> one task, one wishlist -> many tasks, and wishlist -> bug report / improvement task where appropriate.
6. Add tests that converted child tasks satisfy their type-specific intake profile.
7. Surface conversion provenance clearly in `get-wishlist` and task metadata readouts.

### Acceptance Criteria

- Wishlist items remain out of execution queues until converted.
- Conversion records why and how the item was split.
- Child tasks created by conversion are independently executable or remain proposed with visible intake gaps.

## Part 5: Improvement Task Quality

Goal: Keep improvement tasks evidence-backed and prevent raw transcript noise from becoming ready work.

### Tasks

1. Review existing `improvement` type validation against the new taxonomy.
2. Strengthen the improvement intake profile with recommended `metadata.proposedSolutions`, `metadata.confidenceTier`, `metadata.provenanceRefs`, and category/module hints.
3. Add guidance that raw transcripts, full logs, and scratchpad research are not valid improvement bodies.
4. Require triage rationale before promotion to ready, either as metadata or transition evidence convention.
5. Ensure `generate-recommendations` continues to create proposed improvements or research-stage transcript churn, not ready work.
6. Add tests for generated improvement payloads and manual improvement creation.
7. Update improvement discovery and triage playbooks to reference Task Intake Policy preflight.

### Acceptance Criteria

- Improvement tasks clearly state issue, evidence, reasoning, and expected outcome.
- Agents are steered to cancel false positives instead of promoting them.
- Generated recommendations remain deduped and proposed until accepted.

## Part 6: Proposed -> Ready Gate

Goal: Make readiness a meaningful, type-aware decision.

### Tasks

1. Use Task Intake Policy as the central readiness gate for proposed -> ready.
2. Keep current transition rules but add type-specific intake guard coverage where missing.
3. Ensure transition failures return stable, useful `task-intake-blocked` payloads.
4. Add CLI examples showing how to preflight before `run-transition accept`.
5. Add tests for accept behavior across execution, bug report, wishlist intake, and improvement task types.
6. Decide whether `wishlist_intake` should ever transition directly to ready, or whether conversion should remain the only path into executable readiness.
7. Add dashboard/readout hints for proposed tasks that are close to ready versus deeply underspecified.

### Acceptance Criteria

- `ready` means the task has enough information for an agent to act.
- Agents see concrete missing fields before attempting mutation.
- Incomplete proposed items can remain visible without polluting the ready queue.

## Part 7: CAE Activation Integration

Goal: Use CAE to activate the right guidance at the exact moment agents need it.

### Tasks

1. Add or update CAE artifact registry entries for task quality, bug report intake, wishlist conversion, and improvement triage guidance.
2. Add activation definitions scoped by task type, status, command, and transition action.
3. Activate wishlist guidance for `wishlist_intake`, `create-wishlist`, `list-wishlist`, `get-wishlist`, and `convert-wishlist` contexts.
4. Activate improvement discovery guidance for `create-task type=improvement`, recommendation generation, and transcript churn synthesis contexts.
5. Activate improvement triage guidance for `type=improvement` proposed -> ready transitions.
6. Activate bug report guidance for `type=bug_report`, bug creation, bug triage, and bug start contexts.
7. Activate generic task decomposition guidance for `create-task`, `create-ready`, and `run-transition accept`.
8. Keep CAE advisory first; do not let CAE weaken policy approval, schema validation, SQLite integrity, or transition guards.
9. Add trace/explain tests proving the expected artifact activates for representative contexts.

### Acceptance Criteria

- CAE can explain why task-quality guidance activated.
- Agents receive type-specific guidance without manually opening playbooks.
- CAE remains advisory unless an explicit narrow enforcement lane is later configured.

## Part 8: Agent-Facing Instructions And Playbooks

Goal: Make the behavior natural for agents, not dependent on the user repeating the model in chat.

### Tasks

1. Add a task-quality playbook covering the shared base contract, type selection, decomposition, and readiness rules.
2. Add a bug-report intake playbook.
3. Update wishlist and improvement playbooks to reference the unified taxonomy.
4. Update Task Engine command instructions with concise examples and preflight commands.
5. Update `.ai/MACHINE-PLAYBOOKS.md` so agents know when to use each playbook.
6. Add examples of bad tasks and corrected tasks for each type.
7. Add guidance that agents should ask clarifying questions or create proposed intake, not invent missing facts for ready tasks.

### Acceptance Criteria

- Agent guidance is discoverable through `.ai/` sources and command instructions.
- Agents can choose the right task type from user intent.
- Agents know when to split, defer, convert, accept, reject, or start work.

## Part 9: Validation, Tests, And Compatibility

Goal: Ship the plan without breaking existing task stores or workflows.

### Tasks

1. Add unit tests for Task Intake Policy profile resolution.
2. Add mutation tests for create proposed, create ready, and accept transitions per type.
3. Add known type validation tests for `bug_report`, `wishlist_intake`, and `improvement`.
4. Add conversion tests for wishlist child task intake.
5. Add CAE activation tests for representative task contexts.
6. Add documentation drift checks if existing scripts cover generated agent docs.
7. Verify legacy improvement ids and existing generic tasks remain valid.
8. Run build, check, and targeted tests.

### Acceptance Criteria

- Existing stores load without migration failures.
- Unknown/custom task types remain passthrough for compatibility unless policy explicitly targets them.
- New task types are enforced only through known type validation and configured intake policy.
- CI and pre-merge gates pass.

## Part 10: Task Engine Backlog Creation

Goal: Convert this accepted plan into actual Task Engine records.

### Tasks

1. Create one proposed parent tracking task for the full task-concept implementation program.
2. Create child tasks for each part above, sized so each can be completed in one coherent implementation pass.
3. Add dependencies matching the sequence: taxonomy before policy, policy before enforcement, bug type before bug commands, CAE artifacts before activation tests.
4. Mark documentation-only work separately from code-bearing work where that makes review easier.
5. Use `resolve-task-intake-policy` before promoting any child task to ready.
6. Link this plan file in each child task metadata or description.

### Acceptance Criteria

- The backlog fully covers this plan.
- Completing all child tasks implements the full model.
- No child task requires the agent to infer missing product decisions from chat.

## Suggested Initial Task Breakdown

These are the implementation tasks that should be opened after review. IDs should be allocated by Task Engine at creation time.

| Task | Type | Status | Depends On | Outcome |
| --- | --- | --- | --- | --- |
| Define task taxonomy and terms | execution | proposed | none | Canonical vocabulary in `.ai` and task-engine instructions |
| Add built-in intake profiles | execution | proposed | taxonomy | Machine-readable quality contracts for execution, bug, wishlist, and improvement types |
| Add `bug_report` known type validation | execution | proposed | taxonomy | Bug reports become first-class task records |
| Add bug report command/examples | execution | proposed | bug validation, intake profiles | Agents can create and list structured bug reports |
| Harden wishlist conversion intake | execution | proposed | intake profiles | Converted child tasks are scoped and policy-aware |
| Strengthen improvement task quality | execution | proposed | intake profiles | Improvements stay evidence-backed and triageable |
| Enforce proposed -> ready quality gate | execution | proposed | intake profiles, bug validation | Readiness becomes type-aware and blockable when configured |
| Add task-quality playbooks | execution | proposed | taxonomy | Agents have practical rules for type choice, readiness, and splitting |
| Add CAE task-quality artifacts | execution | proposed | playbooks | CAE registry knows the new guidance artifacts |
| Add CAE task-type activations | execution | proposed | CAE artifacts | Guidance activates by task type, command, status, and transition |
| Add validation and compatibility tests | execution | proposed | code tasks | Behavior is covered across create, accept, conversion, and CAE evaluation |
| Generate/update agent-facing docs | execution | proposed | docs and code tasks | Command instructions and generated docs reflect the shipped behavior |

## Rollout Strategy

1. Ship taxonomy and docs first so agents and users share language.
2. Add policy profiles in advisory mode.
3. Add Bug Report type and examples.
4. Add enforce-on-accept support for selected profiles once tests are green.
5. Wire CAE advisory activation.
6. Observe task creation and transition behavior through normal agent sessions.
7. Only consider CAE enforcement after advisory output is stable and trusted.

## Final Desired Agent Behavior

When the plan is complete, an agent should be able to:

- Understand Task, Bug Report, Wishlist Item, and Improvement Task as typed task records.
- Select the right type from user intent.
- Know which fields are required and why.
- Preflight a task before creating or promoting it.
- Keep incomplete ideas proposed instead of pretending they are ready.
- Split oversized work before implementation.
- Convert wishlist items into one or many well-scoped tasks.
- Treat bug reports as reproducible defects with evidence.
- Treat improvements as evidence-backed friction or system-quality work.
- Use CAE guidance automatically at the relevant command or task transition.
- Avoid opening bad tasks.