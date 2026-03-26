# Architectural Review Findings

## Executive Summary

Workflow Cannon is a contract-driven developer workflow platform with strong design choices around deterministic execution, release evidence, policy gates, and package-first parity validation. The architecture intentionally prioritizes trust and correctness over speed, and that is visible in the layered configuration model, append-only traces, release gate matrix, and parity artifacts.

The highest-leverage architectural risks are not foundational flaws; they are consistency and maintainability issues: duplicate policy/document surfaces, stale or conflicting references, naming drift between historical and current package identity, and a monolithic CLI orchestration surface that will become harder to evolve. The system is fundamentally well-structured for incremental hardening, and most findings can be remediated in reversible slices without changing core contracts.

## Systems Architect Persona and Behavior Profile

When operating as systems architect for this codebase, the expected personality and behavior profile is:

- Safety-first and evidence-first decision making.
- Deterministic and contract-oriented reasoning.
- Conservative with change scope (incremental, reversible slices).
- Clear boundary enforcement between strategy, execution state, release operations, and runtime code.
- Bias toward explicitness (typed contracts, gated transitions, machine-readable artifacts).
- Operability-aware: every important claim should be testable or observable.

In practical reviews, this presents as:

- Prioritizing correctness and upgrade safety ahead of convenience.
- Calling out drift between declared source-of-truth files and implementation reality.
- Preferring "single canonical surface + generated derivatives" to parallel manual documents.
- Distinguishing architectural debt from implementation bugs so remediation can be sequenced by risk.

## Review Scope and Inputs

This review covered:

- Canonical AI guidance in `.ai/` (principles, architecture, roadmap, releasing, runbooks, workbooks, module-build contract).
- Maintainer documentation in `docs/maintainers/`, plus `docs/policies/`, `docs/workflows/`, and top-level `README.md` and `CHANGELOG.md`.
- Implementation in `src/` (core, contracts, modules, CLI), `scripts/`, and `test/`.

## Technology Stack Review

### Findings

- Node.js + TypeScript + ESM packaging is clean and modern, with `dist/`-based execution and publish flow aligned to package-first goals.
- CLI-driven architecture (`workspace-kit`) is coherent for a local-first automation platform and keeps operational control explicit.
- Tooling stack (`pnpm`, parity scripts, release metadata checks, compatibility checks, schema validation) is stronger than typical projects of this size.
- File-backed runtime evidence (`artifacts/*.json`, `.workspace-kit/*`, policy traces) supports auditability and post-mortem analysis.

### Risks / Inefficiencies

- Some operational identity still references legacy naming (`quicktask-workspace-kit`) while package identity is `@workflow-cannon/workspace-kit`, which can confuse drift checks and operator trust.
- Mix of canonical and generated docs is disciplined overall, but there are enough parallel surfaces that manual synchronization cost is rising.

### Recommendations

- Normalize package identity across manifest/drift logic and docs.
- Add a lightweight "stack inventory" doc that lists runtime dependencies and required Node/tool versions as one canonical table.

## System Layout Review

### Findings

- Macro layout is strong: `contracts` define interfaces, `core` provides platform mechanisms, `modules` encapsulate feature slices, and `scripts` enforce release/readiness.
- Module registry + command router pattern is a good architectural center:
  - dependency validation and topological startup ordering;
  - command discovery/dispatch;
  - instruction file registration checks.
- Task-engine state as execution source-of-truth is a good call for deterministic queue behavior and reproducible progression.

### Risks / Inefficiencies

- `src/cli.ts` is large and handles many concerns (command parsing, policy handling, config layering, module bootstrapping, command dispatch, output shaping), increasing change risk and reducing test granularity.
- Some stubs/placeholder surfaces (`src/ops`, `src/adapters`) expose conceptual architecture beyond active implementation and may create expectation mismatch.

### Recommendations

- Refactor `src/cli.ts` into command-specific handlers and a shared runtime bootstrap service.
- Either implement or trim placeholder surfaces to keep architecture map congruent with shipped capability.

## File Organization Review

### Findings

- Documentation is thoughtfully segmented: roadmap, architecture, terms, releasing, runbooks, workbooks, and data artifacts.
- AI/human dual-surface model is explicit and generally well enforced.
- Tests are logically grouped by phase and capability, which mirrors roadmap evolution effectively.

### Risks / Inefficiencies

- Broken or stale references exist (for example, README indexing a non-existent contributing guide).
- Changelog history is split across top-level and maintainer locations with uneven freshness.
- Workflow/policy rules live in both `docs/*` and `.cursor/rules/*`, which can drift unless one is declared canonical and the other generated.

### Recommendations

- Resolve broken references immediately (low effort, high trust impact).
- Define one canonical changelog surface and point all other locations to it.
- Add explicit "canonical vs derived" headers to policy/workflow docs.

## Technical Approach Review

### Findings

- Strong deterministic design patterns:
  - atomic task-state writes;
  - stable config serialization;
  - explicit transition maps and dependency guards;
  - release-blocking parity and compatibility gates.
- Policy gating is pragmatic and defensible:
  - sensitive command classification;
  - explicit approval pathways;
  - trace artifacts for decisions.
- Command-as-instruction architecture creates a useful bridge between operational docs and executable behavior.

### Risks / Inefficiencies

- Consumer path assumptions in some runtime logic can be brittle when package is used outside this repository layout.
- Actor resolution via synchronous shelling to git config can be latency-prone and environment-fragile in automation contexts.
- Detached transcript hook execution improves non-blocking UX but weakens immediate observability of failures.

### Recommendations

- Remove repository-layout assumptions from runtime path resolution by using config/package-relative lookup consistently.
- Replace sync actor resolution with bounded async fallback behavior and explicit override guidance.
- Add optional transcript-hook status logging or artifacted run outcomes.

## Inefficiency and Debt Review

### Priority 0 (Trust / Correctness)

- Resolve package identity drift (`quicktask-workspace-kit` vs `@workflow-cannon/workspace-kit`).
- Align module instruction path validation to a single workspace-root contract.

### Priority 1 (Maintainability)

- Decompose monolithic CLI orchestration.
- Remove dual maintenance for config defaults and module contributions.
- Normalize documentation source-of-truth declarations.

### Priority 2 (Operability)

- Improve background hook observability.
- Tighten gate document ordering/consistency to reduce release friction.

### Priority 3 (Process Hygiene)

- Strengthen ADR discipline or reduce ADR claims in governance docs if lightweight decisions are preferred.

## Testing and Validation Review

### Findings

- Testing against compiled `dist/` artifacts is a good package-realism strategy.
- Coverage includes module registry, routing, CLI behavior, phased feature tests, and parity fixtures.
- Release readiness flow integrates build/check/test/parity with explicit evidence generation.

### Risks / Inefficiencies

- Monolithic CLI architecture naturally creates branch coverage blind spots unless test matrix expands aggressively.
- File-backed persistence appears robust for single-writer paths, but concurrency semantics deserve explicit stress tests as adoption grows.

### Recommendations

- Add focused tests for policy/session edge cases and dynamic sensitive command paths.
- Add targeted concurrency tests around state persistence and update contention.

## Documentation and Governance Review

### Findings

- Principle hierarchy and release gate philosophy are unusually mature for a small-to-mid-sized tooling platform.
- Terminology governance (`TERMS`) and release process (`RELEASING` + gate matrix + runbooks) are clear and operationally useful.

### Risks / Inefficiencies

- Parallel policy surfaces and occasional index drift reduce confidence at the exact point maintainers need certainty.
- Minor inconsistencies in architecture/release supporting docs add avoidable cognitive load.

### Recommendations

- Establish a periodic "doc consistency sweep" checklist tied to phase close/release candidate cut.
- Treat broken links and stale index entries as release-blocking documentation defects.

## Architectural Strengths Worth Preserving

- Contract-first module system with explicit dependencies and validated startup order.
- Deterministic task engine with auditable transition evidence.
- Layered configuration with explainable precedence.
- Human-governed policy model with traceable approvals.
- Package-first parity validation with machine-readable evidence artifacts.

## Suggested Remediation Plan (Incremental)

1. **Week 1 (low risk, high clarity):**
   - Fix broken references and changelog canon.
   - Reconcile package naming drift in docs and checks.
2. **Week 2-3 (maintainability slice):**
   - Extract CLI handlers + shared bootstrap runtime.
   - Consolidate config default ownership.
3. **Week 4 (operability slice):**
   - Add transcript hook visibility and actor resolution hardening.
   - Add targeted policy/concurrency tests.
4. **Week 5 (governance hardening):**
   - Canonicalize policy surfaces and ADR expectations.
   - Add doc consistency release gate if desired.

## Final Assessment

The architecture is fundamentally sound, intentional, and aligned with its stated principles. The most important work now is reducing drift and simplifying orchestration so the system can scale in capability without scaling cognitive overhead. This is a strong platform that needs consistency hardening more than structural reinvention.
