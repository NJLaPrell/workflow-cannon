# Context Activation Engine (CAE) — plan & implementation status

> **Note (2026-04-10):** Phase 70 implementation work (**T870–T886**) is **completed** in the task engine. The tables below are a **human planning snapshot** from **2026-04-09** and may not reflect the current tree line-by-line. For **machine-truth** behavior and contracts, use **`.ai/cae/`**; for task state, **`pnpm exec wk run list-tasks '{"phaseKey":"70"}'`** (expect terminal statuses).

**Last reviewed (snapshot body):** 2026-04-09  
**Canonical specs:** `.ai/cae/README.md`, `tasks/cae/CAE-PROGRAM-CONTEXT.md`, `.ai/adrs/ADR-context-activation-engine-architecture-v1.md`  
**This file:** maintainer-oriented bridge under **`tasks/cae/`**; **agent routine canon remains `.ai/`** (see `.cursor/rules/agent-doc-routing.mdc`).

**Phase 70 execution backlog (historical):** tasks **`T870`–`T881`** (+ follow-ups **T882–T886**) were the implementation / hardening queue (`phaseKey` **`70`**). Spec/design tasks **`T837`–`T869`** were **`completed`** before that wave.

| ID | Intent |
| --- | --- |
| **T870** | Real evaluation-context slices + task/command layered merge |
| **T871** | Precedence, merge, `conflictShadowSummary` in evaluator (depends T870) |
| **T872** | Acknowledgements in bundle + shadow `wouldRequireAck` (depends T871) |
| **T873** | Durable trace persistence + cross-process `cae-get-trace` |
| **T874** | Rich trace events + normative explain (depends T871, T873) |
| **T875** | Missing read-only instruction `.md` files (evaluate → get-trace) |
| **T876** | Shadow observation completeness: `wouldEnforce`, usefulness (depends T872, T877) |
| **T877** | Enforcement allowlist pilot, bundle-aware blocks (depends T871, T872) |
| **T878** | Governed registry/activation mutation CLI (depends T871) |
| **T879** | Failure/recovery matrix tests |
| **T880** | Test-plan gap closure (depends T871, T879) |
| **T881** | Doctor: CAE registry health lines |
| **T882–T886** | CI registry gate, maintainer CLI map, health contract, response hints, rollout doc |

---

## Objective (condensed)

CAE evaluates **structured, bounded** context and returns a **deterministic effective activation bundle** for four families: **policy**, **think**, **do**, **review**. Hard safety stays in **code**; docs are **referenced** via stable artifact IDs and a **registry**. Cognitive maps are **future-only** (reserved type, no v1 dependency).

---

## Workstream status (18 planning tracks)

Legend: **Done** = delivered in tree as of last review · **Partial** = scaffold or spec exists; behavior incomplete · **Not done** = missing or not started

| # | Workstream | Status | Notes |
|---|------------|--------|-------|
| 1 | CAE architecture / ADR | **Done** | `ADR-context-activation-engine-architecture-v1.md`, `.ai/cae/README.md`, program context |
| 2 | Artifact inventory & registry model | **Done** | `ADR-cae-artifact-registry-v1.md`, `.ai/cae/registry/*.json`, `cae-registry-load.ts`, `schemas/cae/` |
| 3 | Activation definition schema & lifecycle | **Done** (docs + loader) | `.ai/cae/lifecycle.md`; loader validates registry rows |
| 4 | Evaluation context contract & context builder | **Partial** | Specs + `evaluation-context-builder.ts`; preflight uses a **single** merged context; queue depth etc. often stubbed |
| 5 | Precedence / merge / effective bundle semantics | **Partial** | Evaluator matches & sorts by priority; **no** full policy-vs-advisory precedence, specificity rules, or merge/shadow/fail for same-type conflicts (`conflictShadowSummary.entries` empty) |
| 6 | Acknowledgement model | **Partial** | `.ai/cae/acknowledgement-model.md`; runtime **`pendingAcknowledgements`** always `[]`; shadow **`wouldRequireAck`** empty |
| 7 | Persistence & migration design | **Partial** | `ADR-cae-persistence-v1.md`, `cae-persistence-port.ts` (noop); traces **ephemeral** (`trace-store`), no durable **`cae-get-trace`** |
| 8 | Activation trace & explanation model | **Partial** | Minimal trace (single summary event); `cae-explain` best-effort; richer mapping in `.ai/cae/trace-and-explain.md` / `activation-definition-trace-mapping.md` not fully realized |
| 9 | Read-only CLI contract & command surface | **Partial** | Contract + handlers for all `cae-*` names in `context-activation` module; **instruction `.md` files missing** for evaluate / explain / health / conflicts / get-trace (manifest references them) |
| 10 | Shadow mode design | **Partial** | Shadow eval + preflight + `shadowObservation.wouldActivate`; **`wouldEnforce`**, usefulness vs noise, **`wouldRequireAck`** still stubs |
| 11 | Runtime integration (CLI execution flow) | **Done** | `cae-run-preflight.ts` → `run-command.ts`: shadow attach, optional enforcement denial, merge into `data.cae` |
| 12 | Advisory activation surfacing | **Done** (behind flags) | `cae-instruction-surface-advisory.ts` + `agent-instruction-surface.ts` when `kit.cae.enabled` + `kit.cae.advisoryInstructionSurface` |
| 13 | Narrow policy enforcement lane | **Partial** | `.ai/cae/enforcement-lane.md`, `cae-enforcement-allowlist.ts`; **allowlist empty**; blocker does not inspect bundle yet |
| 14 | Mutation governance (activation CRUD) | **Not done** | `.ai/cae/mutation-governance.md` only; no governed mutating CLI |
| 15 | Failure & recovery model | **Done** (design) + **Partial** (runtime) | `.ai/cae/failure-recovery.md`, `error-codes.md`; behavior matches matrix in places, not exhaustively tested everywhere |
| 16 | Test strategy & coverage | **Partial** | `.ai/cae/test-plan.md`; tests exist (evaluate, allowlist, CLI preflight, etc.); coverage grows with semantics |
| 17 | Docs / operator workflow | **Partial** | `.ai/runbooks/cae-debug.md`, CAE README; **`doctor` does not yet emit dedicated CAE registry summary lines** (called out as future in failure-recovery doc) |
| 18 | Future cognitive-map integration contract | **Done** (design) | `.ai/cae/future-cognitive-maps.md`, reserved artifact type in ADR/registry docs |

---

## Effective bundle checklist (plan vs code)

| Capability | Status |
|------------|--------|
| Effective policy / think / do / review entries (from registry) | **Partial** — listed when activations match; merge/precedence shallow |
| Pending acknowledgements | **Not done** — always empty array |
| Conflict / shadow summary | **Partial** — shape exists; **entries** unused / empty |
| Trace id | **Done** |
| Explanation surface | **Partial** — `explanationRef` + `cae-explain`; not full normative explain |

---

## Runtime flow (plan vs implementation)

| Step | Status |
|------|--------|
| Task-level activations resolved, then command-level, then merged | **Partial** — **one** evaluation context per invocation; no distinct task slice ⊕ command slice merge |
| Required policy / acknowledgement handled before proceed | **Partial** — existing Tier A/B policy unchanged; CAE acks not enforced |
| Trace + explanation inspectable after | **Partial** — ephemeral trace session only |

---

## Configuration defaults (rollout)

- `kit.cae.enabled` defaults **false**; shadow preflight and advisory instruction surface are **opt-in**. This is intentional for safety but means shadow is **not** automatic whenever CAE exists—only when flags/env enable it.

---

## Likely next implementation slices (non-binding)

1. Semantics: precedence, conflicts, **`pendingAcknowledgements`**, shadow **`wouldRequire`** / **`wouldEnforce`** population.  
2. Layered context: task-level vs command-level evaluation + merge.  
3. Trace/explain depth per `.ai/cae/trace-and-explain.md`.  
4. Persistence port + SQLite (or chosen store) for **`T867`**-class traces.  
5. Add missing **`src/modules/context-activation/instructions/cae-*.md`** for evaluate, explain, health, conflicts, get-trace.  
6. Optional: **`doctor`** lines for registry health.  
7. Enforcement: curated **non-empty** allowlist when product is ready; bundle-aware rules if spec requires.  
8. Mutation governance + Tier B/C approval path before any activation CRUD CLI.

---

## Related paths (quick jump)

| Area | Path |
|------|------|
| Module entry | `src/modules/context-activation/index.ts` |
| Core evaluator | `src/core/cae/cae-evaluate.ts` |
| CLI preflight | `src/core/cae/cae-run-preflight.ts` |
| Registry load | `src/core/cae/cae-registry-load.ts` |
| Agent advisory | `src/core/cae/cae-instruction-surface-advisory.ts` |
| Config keys | `src/core/workspace-kit-config.ts` (`kit.cae`) |

When this document drifts from `.ai/` canon, **prefer `.ai/`** and update this file on the next pass.
