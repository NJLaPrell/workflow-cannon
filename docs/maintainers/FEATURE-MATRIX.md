# Workflow Cannon Feature Matrix

Product-oriented feature inventory derived from `docs/maintainers/TASKS.md`.

Status legend:

- `Completed` = capability delivered in repository baseline
- `In progress / ready` = next active release-track work
- `Planned` = scoped for future phases

## Milestone Alignment (from TASKS)

| Milestone/phase | Release target | Current state |
| --- | --- | --- |
| Historical baseline (`T175`-`T177`) | Baseline established pre-Phase 0 | Completed |
| Phase 0 - Foundation (`T178`-`T183`, plus `T206`-`T213`) | `v0.2.0` | Completed |
| Phase 1 - Task Engine core (`T184`-`T186`, `T199`, `T217`) | `v0.3.0` | Planned |
| Phase 2 - Config, policy, migration (`T187`-`T189`) | `v0.4.0` | Planned |
| Phase 3 - Enhancement loop MVP (`T190`-`T192`) | `v0.5.0` | Planned |
| Phase 4 - Scale and ecosystem hardening (`T193`-`T195`) | `v0.6.0` | Planned |

## Feature Matrix by Phase

### Historical Baseline (completed)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Repository extraction and provenance trail | Verifiable split history and evidence that establish trust in package origin | Completed | `T175`, `T176` |
| First publish baseline | Proven publish path with installable package and linked run evidence | Completed | `T177` |

### Phase 0 Foundation (`v0.2.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Phase-level scope and evidence framing | Clear release boundaries, risk framing, and evidence expectations | Completed | `T178` |
| Canonical documentation ownership split | Stable AI and human documentation surfaces with lower ambiguity | Completed | `T206` |
| Module platform baseline | Dependency-safe module contract and predictable module startup behavior | Completed | `T207` |
| Runtime module governance controls | Module enable/disable safety with config/state/instruction contracts | Completed | `T208` |
| Shared module build playbook | Consistent module implementation guidance across AI + maintainers | Completed | `T209` |
| Command routing UX for modules | Discoverable, dispatchable command surface for enabled modules | Completed | `T210` |
| Documentation generation workflow | Template-driven doc generation with validation, conflict checks, and evidence | Completed | `T211` |
| Maintainer document template library | Reusable templates for core maintainer docs and standardized sections | Completed | `T212` |
| Documentation runtime hardening | Stronger config validation and better failure-path coverage in generation flows | Completed | `T213` |
| Release metadata and pre-publish guardrails | Fewer invalid releases and clearer failure diagnostics before publish | Completed | `T179`, `T196` |
| Consumer update cadence management | Defined release cadence states and repeatable consumer validation steps | Completed | `T180`, `T197` |
| Packaged-artifact parity flow | Standardized parity checks against published-style artifacts | Completed | `T181`, `T197` |
| CI release-blocking parity gates | Automatic release stop when parity regresses | Completed | `T182` |
| Machine-readable parity evidence | Structured parity artifacts for automation, traceability, and audit | Completed | `T183`, `T198` |

### Phase 1 Task Engine Core (`v0.3.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Task Engine design workbook | Resolved schema, state model, persistence, and error taxonomy with binding design decisions | Planned | `T199` |
| Task lifecycle contract and guard system | Canonical task state model, transition rules, and pluggable guard hooks for enforcement | Planned | `T184` |
| Task transition runtime with persistence | Deterministic transitions, auto-unblock cascades, evidence emission, and file-backed JSON store | Planned | `T185` |
| Task adapter contract and TASKS.md generation | Pluggable adapter interface, generated human-readable TASKS.md, and one-time import from current format | Planned | `T186` |
| Next-action suggestion engine | Priority-sorted ready queue with blocking chain analysis for agent-driven task selection | Planned | `T217` |

### Phase 2 Config, Policy, and Migration (`v0.4.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Deterministic config registry | Explainable config resolution with predictable outcomes | Planned | `T187`, `T200` |
| Policy and approval enforcement | Sensitive actions gated by policy decisions and approval controls | Planned | `T188` |
| Migration orchestration and rollback | Safer upgrade execution with checkpoints, preflight, and rollback evidence | Planned | `T189`, `T201` |

### Phase 3 Enhancement Loop MVP (`v0.5.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Recommendation review queue | Human-governed decision pipeline for proposed improvements | Planned | `T190` |
| Evidence-backed recommendations | Higher-signal suggestions with confidence scoring and dedupe behavior | Planned | `T191`, `T202` |
| End-to-end lineage model | Traceability from recommendation to decision to applied change | Planned | `T192`, `T203` |

### Phase 4 Scale and Ecosystem (`v0.6.0`)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Extension compatibility contract | Clear compatibility expectations and conformance checks for modules/plugins | Planned | `T193`, `T204` |
| Supportability and runtime objectives | Operational diagnostics and measurable runtime objectives | Planned | `T194`, `T205` |
| Release channels and compatibility guarantees | Channel-based release posture (`canary`/`stable`/`lts`) with explicit guarantees | Planned | `T195` |

## Supporting Milestone Features (cross-phase)

| Product feature | What users/maintainers get | Status | Task coverage |
| --- | --- | --- | --- |
| Release gate ownership map | Clear gate owners, artifacts, and escalation path for release readiness | Completed | `T196` |
| Consumer parity fixture pack | Reusable fixture + runner for parity checks in CI and local flows | Completed | `T197` |
| Parity evidence schema contract | Versioned schema and retention contract for parity artifacts | Completed | `T198` |
| Task schema workbook | Implementation-ready workbook with binding design decisions for all Phase 1 engine components | Planned | `T199` |
| Config-policy decision matrix | Shared decision map for precedence and policy interactions | Planned | `T200` |
| Migration preflight checklist | Repeatable preflight/rollback checklist for migration operations | Planned | `T201` |
| Recommendation confidence rubric | Deterministic scoring thresholds for recommendation queue admission | Planned | `T202` |
| Lineage event contract | Stable, immutable event format for provenance reconstruction | Planned | `T203` |
| Compatibility matrix template | Reusable compatibility reporting format for extensions and channels | Planned | `T204` |
| Diagnostics and SLO baseline pack | Standard diagnostics payload and objective baseline for runtime reviews | Planned | `T205` |

## Notes

- Feature groupings are intentionally product-facing and map back to task milestones.
- Task IDs remain included for traceability back to execution planning in `docs/maintainers/TASKS.md`.

