# Context Activation Engine (CAE) — operator & agent entry

**Task:** **`T855`**. **North star:** **`tasks/cae/CAE-PROGRAM-CONTEXT.md`**. **Human maintainer index:** **`docs/maintainers/AGENTS.md`** (not required for routine agent execution — see **`.cursor/rules/agent-doc-routing.mdc`**).

## What CAE is

CAE evaluates **bounded, typed** workspace + task + command context and returns a **deterministic effective activation bundle** (policy / think / do / review families) backed by **registry artifact ids**, not embedded doc bodies. It is **advisory first**; **shadow** then **narrow enforcement** roll out later (**`T848`**, **`T866`**).

## Start here (agents)

| Doc | Purpose |
| --- | --- |
| **`.ai/cae/operator-golden-path.md`** | First operator path: health → registry validation → evaluation → explain/trace → conflicts → recovery. |
| **`.ai/cae/guidance-authoring-operator.md`** | Guidance authoring MVP smoke path, degraded-state recovery, and release evidence checklist. |
| **`.ai/cae/dashboard-guidance-plan.md`** | User-facing Guidance tab product language, UI boundaries, and task seed after Phase 70. |
| **`.ai/cae/workspace-artifacts.md`** | Workspace-authored artifact body paths, `workspace.*` id namespace, and slug validation convention for dashboard authoring. |
| **`tasks/cae/CAE-PROGRAM-CONTEXT.md`** | Program objectives, boundaries, sequencing. |
| **`.ai/cae/phase-70-release-evidence.md`** | Phase 70 release-readiness evidence, migration/security review, and publish boundary. |
| **`.ai/cae/registry/*.json`** | **Seed / fixtures only** — runtime registry loads from **kit SQLite** active version by default (**`kit.cae.registryStore: sqlite`**). Import: **`cae-import-json-registry`**. |
| **`.ai/cae/evaluation-context.md`** + **`schemas/cae/evaluation-context.v1.json`** | What builders may put in context (**`T859`**). |
| **`.ai/cae/runtime-integration.md`** | Where CAE hooks into CLI vs router (**`T849`**). |
| **`.ai/cae/cli-read-only.md`** | `cae-*` **`wk run`** names, JSON envelope, tier **C** (no **`policyApproval`**) — **`T847`**. |
| **`.ai/cae/trace-and-explain.md`** | Trace + explain contracts (**`T846`**). |
| **`.ai/cae/failure-recovery.md`** | Failure × surface matrix (**`T853`**). |
| **`.ai/cae/error-codes.md`** | Stable loader / CLI error **`code`** strings (**`T858`**). |
| **`.ai/cae/rollout-defaults.md`** | Default-shaped **`kit.cae.*`** flags by rollout stage (advisory → persistence → enforcement). |
| **`.ai/runbooks/cae-debug.md`** | Operator debug flow (doctor, registry, traces). |

## Acknowledgement vs `policyApproval`

CAE **acknowledgement strengths** (`none` | `surface` | `recommend` | `ack_required` | `satisfy_required`) are **not** Tier A/B JSON **`policyApproval`**. Code invariants and shipped policy lanes stay authoritative — see **`.ai/cae/acknowledgement-model.md`** and **`.ai/POLICY-APPROVAL.md`**.

## Improvement discovery at lifecycle transitions

**`cae.activation.review.run-transition-improvement-discovery`** surfaces **`cae.playbook.improvement-discovery`** (`.ai/playbooks/improvement-task-discovery.md`) when **`evaluationContext.command.name`** is exactly **`run-transition`**. It is **advisory** (`advisoryOnly`, **`recommend`** acknowledgement) so agents get a nudge to log friction in the task store at delivery checkpoints without blocking transitions. Re-seed kit SQLite after editing **`.ai/cae/registry/activations.v1.json`** via **`cae-import-json-registry`**.

## Read-only first

Inspect registry and evaluations via **`cae-*`** commands (**`T861`**, **`T862`**). **Authoritative registry state** lives in **kit SQLite**; JSON under **`.ai/cae/registry/`** is seed/fixture — see **`.ai/cae/json-registry-fate.md`** and **`.ai/cae/mutation-governance.md`** (git+PR still applies to editing those seed files).

## Governed mutation (v1)

**`cae-satisfy-ack`** (Tier A — JSON **`policyApproval`**) records acknowledgement satisfaction in kit SQLite **after** a fresh registry load (**`loadCaeRegistryForKit`** / effective **`registryStore`**), **`ackToken`** match against the activation row, and a persisted **`cae_trace_snapshots`** row for **`traceId`**. It does **not** edit registry rows directly; registry edits use admin CLIs (when shipped) or import/seed workflows.

## Traces

Pre-**`T867`**, traces may be **ephemeral** (in-memory / session); CLI payloads should advertise ephemeral traces when applicable. Persistent trace retrieval follows **`ADR-cae-persistence-v1.md`**.

## Config kill-switch (naming)

Effective **`kit.cae.enabled`** and shadow/enforcement flags are defined with the implementation train (**`T847`**, **`T848`**, **`T866`**). Until wired, treat **“CAE disabled”** as **no advisory payload** and **no enforcement side-effects** — see **`.ai/cae/failure-recovery.md`**.

## Debug CAE (flowchart)

Start with **`.ai/cae/operator-golden-path.md`** for the read-only product smoke path. Use **`.ai/cae/guidance-authoring-operator.md`** for the governed Guidance authoring MVP. Use **`.ai/runbooks/cae-debug.md`** when either flow returns a structured failure.
