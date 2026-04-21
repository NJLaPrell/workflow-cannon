# NEXT

Prioritized task list for the next round of Workflow Cannon work.

This file is intentionally blunt. The immediate priority is not adding more surface area. The immediate priority is restoring operational coherence so the repository's stated truth, release mechanics, and operator workflows are trustworthy.

## Priority order

1. Repair source-of-truth drift
2. Enforce phase-closeout and release discipline
3. Package CAE into one operator-grade vertical slice
4. Strengthen product-boundary quality signals
5. Reduce maintainer ceremony and collapse duplicated effort

---

## 1) Repair source-of-truth drift

### Goal
Make it impossible for README / ROADMAP / status snapshot / changelog-facing version facts / task-store-derived state to disagree for long.

### Problems being fixed
- Root and maintainer docs no longer reliably reflect the current shipped version and active phase.
- Derived docs appear to lag merged work.
- The repository explains precedence, but the artifacts still drift.

### Tasks
- [ ] Identify every artifact that currently communicates version, phase, shipped state, next state, or active focus.
- [ ] Classify each artifact as one of: authoritative, derived, advisory, or historical.
- [ ] Choose one authoritative source for current phase and shipped version.
- [ ] Choose one authoritative source for next planned phase.
- [ ] Rewrite maintainer docs so the source-of-truth hierarchy is explicit and terse.
- [ ] Remove or downgrade any artifact that pretends to be authoritative but is not.
- [ ] Regenerate all derived artifacts from the chosen authoritative sources.
- [ ] Add a drift check that fails when authoritative and derived artifacts disagree.
- [ ] Make drift detection part of pre-merge gates, not just an optional maintainer check.
- [ ] Add a repair runbook: how to reconcile repo truth after emergency or manual intervention.

### Exit criteria
- A maintainer can answer "what phase are we in, what shipped last, and what ships next" from one authoritative path.
- CI fails when derived docs drift from that truth.
- There is no stale version/phase claim left in committed repo surfaces.

---

## 2) Enforce phase-closeout and release discipline

### Goal
Turn phase completion and release into a guided, repeatable, difficult-to-mess-up workflow.

### Problems being fixed
- Phase closeout still depends too much on human memory and manual sequencing.
- CI status and snapshot updates are not enforced strongly enough.
- Release semantics are not obvious when patch and phase labels diverge.

### Tasks
- [ ] Formalize the canonical closeout sequence as a single ordered workflow.
- [ ] Require the canonical phase snapshot update path rather than allowing ad hoc alternatives.
- [ ] Enforce that phase integration PRs cannot be merged while required CI is pending or failing.
- [ ] Add an explicit closeout validation command that checks phase snapshot, version metadata, release notes inputs, and CI status together.
- [ ] Implement the Cursor `/complete-phase` workflow or equivalent guided operator entry point.
- [ ] Ensure guided closeout tooling still respects JSON `policyApproval` rules rather than bypassing them.
- [ ] Add release note guidance for phase/version/patch mismatches so semver surprises are explained.
- [ ] Add a post-closeout verification checklist that confirms tag, release, package version, and repo state are aligned.
- [ ] Add a failure recovery path for interrupted closeout or partially completed release actions.

### Exit criteria
- A maintainer can complete closeout from one documented flow.
- CI/policy gates block invalid closeout order.
- Snapshot/version/release state cannot silently diverge after a merge.

---

## 3) Package CAE into one operator-grade vertical slice

### Goal
Turn CAE from a set of strong primitives into one coherent, end-to-end operator workflow.

### Problems being fixed
- CAE appears to be accumulating commands faster than it is accumulating one obvious operator story.
- Recovery, evaluation, registry, governance, and trace pieces exist, but the end-to-end path is not yet crisp enough.

### Tasks
- [ ] Define the single primary CAE operator journey for v1.
- [ ] Document the shortest happy path from registry seed/load to evaluation to explanation to health/conflict inspection.
- [ ] Document the governed mutation path separately from read-only inspection.
- [ ] Create one end-to-end CAE smoke scenario with committed fixtures and expected outputs.
- [ ] Add one "golden path" runbook that an operator can follow without spelunking multiple docs.
- [ ] Add one "bad path" recovery runbook covering the most likely CAE failure classes.
- [ ] Audit CAE command names, output contracts, and docs for consistency and discoverability.
- [ ] Ensure CAE doctor/advisory surfacing points operators to the single golden path doc first.
- [ ] Decide what is explicitly out of scope for CAE v1 and document it.

### Exit criteria
- A new maintainer can run one CAE vertical slice end-to-end with confidence.
- CAE docs read like a product workflow, not just a bag of commands.
- There is a single canonical runbook to prove CAE works.

---

## 4) Strengthen product-boundary quality signals

### Goal
Prove the package works for real consumers, not just inside repo-local development loops.

### Problems being fixed
- Internal tests exist, but product-boundary confidence is still weaker than it should be.
- Native SQLite, policy gating, generated docs, and upgrade behavior create real consumer risk.

### Tasks
- [ ] Define the minimum supported consumer journeys that must always pass.
- [ ] Add clean-install smoke coverage for a fresh external consumer project.
- [ ] Add upgrade-path smoke coverage from at least one prior shipped version.
- [ ] Add recovery-path smoke coverage for the most likely broken state or interrupted migration cases.
- [ ] Verify native SQLite setup and failure remediation on supported environments.
- [ ] Ensure packaged artifacts include everything required for consumer success and nothing misleading.
- [ ] Promote product-boundary smoke checks into required release validation where practical.
- [ ] Summarize these guarantees in maintainer docs so "what quality means" is obvious.

### Exit criteria
- You can point to a short list of consumer-critical journeys and prove they pass.
- Release confidence is based on external-use realism, not only internal command tests.

---

## 5) Reduce maintainer ceremony and collapse duplicated effort

### Goal
Keep the governance model, but remove unnecessary cognitive load and duplicated surfaces.

### Problems being fixed
- Maintainer workflow still feels too ceremony-heavy.
- There are too many places to look, too many mirrored docs, and too many opportunities to do the right thing the long way.

### Tasks
- [ ] Audit every maintainer-facing doc and classify it as essential, generated, redundant, or historical.
- [ ] Collapse duplicate instructions where two docs say the same thing with different wording.
- [ ] Reduce the number of places a maintainer must check before acting.
- [ ] Make the most common maintainer workflows discoverable from one human index.
- [ ] Shorten high-frequency operational docs so they optimize for execution, not exposition.
- [ ] Remove stale workflow aliases and compatibility names when they no longer earn their keep.
- [ ] Prefer guided entry points over telling maintainers to manually compose workflows from several docs.

### Exit criteria
- The repo feels easier to operate without weakening policy or evidence.
- Common maintainer tasks require fewer lookups and fewer judgment calls.

---

## Suggested execution sequence

### Track A — fix trust first
- [ ] Truth-surface inventory
- [ ] Authoritative-source decision
- [ ] Derived-doc regeneration
- [ ] Drift gate in CI

### Track B — harden closeout mechanics
- [ ] Canonical closeout flow
- [ ] Snapshot enforcement
- [ ] CI merge enforcement
- [ ] Guided `/complete-phase` operator path

### Track C — package CAE
- [ ] CAE v1 operator journey
- [ ] Golden-path runbook
- [ ] End-to-end smoke scenario
- [ ] Failure recovery pass

### Track D — strengthen release confidence
- [ ] Consumer install smoke
- [ ] Upgrade smoke
- [ ] Recovery smoke

### Track E — reduce ceremony
- [ ] Maintainer doc audit
- [ ] Redundancy collapse
- [ ] Human index simplification

---

## What not to do next

- Do not add more major surface area before truth surfaces are synchronized.
- Do not keep expanding CAE sideways without first proving one operator-grade vertical slice.
- Do not rely on maintainer memory for closeout sequencing when the repo can enforce it.

---

## Decision rule

When prioritization is unclear, choose the work that most improves:

1. trust in repo truth,
2. confidence in release correctness,
3. clarity of the operator path,
4. reduction of maintainer overhead.
