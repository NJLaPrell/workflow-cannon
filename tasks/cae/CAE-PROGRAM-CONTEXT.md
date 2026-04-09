# Context Activation Engine (CAE) — program context

**Phase:** Task engine bucket **Phase 70** (`phaseKey` **`70`**) — see `src/modules/documentation/data/roadmap-phase-sections.md` (**Phase 70 - CAE (IN FLIGHT)**).

This file is the **shared north star** for all CAE tasks under `tasks/cae/specs/`. Implementation agents should read it before executing any single CAE task.

## Objective

Build a **Context Activation Engine (CAE)** for Workflow Cannon. CAE evaluates **structured** current context and returns a **deterministic** activation bundle that tells the agent how to approach work.

## Activation families (v1)

| Family | Role |
| --- | --- |
| **policy** | Constraints, approvals, warnings, acknowledgements (CAE must not replace code invariants or baseline `policyApproval` lanes) |
| **think** | Reasoning posture, decomposition mode, analysis lens; **future** cognitive-map hooks only |
| **do** | Runbooks, playbooks, checklists, operational procedure **by reference** |
| **review** | Validation posture before mutation, completion, release, or signoff |

## Hard boundaries

**Stay in code (CAE cannot loosen):** schema validation, impossible state transitions, destructive-operation safety, migration safety, baseline approval structure, module dependency integrity.

**Stay as docs (CAE references only):** runbooks, playbooks, checklists, review templates, reasoning templates, policy docs, future cognitive maps. Reference via **stable artifact IDs** and a **registry** — do not embed full doc bodies in activation payloads.

**Cognitive maps:** future-only; **no v1 dependency**; reserve artifact type `cognitive-map` and optional nullable context fields.

## Effective bundle (deterministic question)

> What is the exact effective activation bundle for this task and command right now?

Must include: effective policy / think / do / review activations; **pending acknowledgements**; **conflict/shadow summary**; **trace id** and **explanation surface**.

## Precedence (minimum)

1. Hardcoded invariants beat CAE  
2. Policy family beats advisory families when in conflict  
3. More specific scope beats broader  
4. Higher priority beats lower  
5. Disabled/retired activations do nothing  
6. Same-type conflicts must **merge, shadow, or fail explicitly** — no silent ambiguity  

## Acknowledgement vs approval

**Separate.** Ack strengths: `none` | `surface` | `recommend` | `ack_required` | `satisfy_required`. Do not conflate with Tier A/B `policyApproval` JSON (see `.ai/POLICY-APPROVAL.md`).

## Artifact types (registry)

**v1:** `runbook`, `playbook`, `checklist`, `review-template`, `reasoning-template`, `policy-doc`  
**Reserved:** `cognitive-map`

## Context assembly (structured slices)

From: task context, command context, workspace context, governance context, queue/operational context; optional future map signals. **Do not** ship a giant opaque workflow-state blob.

## Runtime flow (target)

1. Agent starts or resumes task → task-level activations resolved  
2. Agent invokes command → command-level activations resolved  
3. Merge task + command → effective bundle  
4. Required policy or acknowledgement handled  
5. Command proceeds or blocked  
6. Trace + explanation remain inspectable  

## Read-only first

CLI-style surface (names TBD in contract task): list/get activations & artifacts, evaluate, explain, health, conflicts, trace — **no mutation** until governance exists.

## Shadow before enforcement

Shadow shows: what **would** activate, require, enforce; usefulness vs noise. **No weakening** of code safety when CAE fails.

## Explicitly out of v1

Arbitrary code in activations; freeform NL conditions; executable workflow chains/macros; cognitive-map dependency; agent-authored activation editing before governance; scattered per-module CAE logic; hidden behavior without trace/explainability.

## Repo integration anchors (read when designing)

- CLI / router: `src/cli.ts`, `src/core/module-command-router.ts`  
- Agent surface: `src/core/agent-instruction-surface.ts`, `ModuleActivationReport` in `src/core/module-registry.ts` (**naming collision** with CAE — disambiguate in ADR)  
- Policy: `.ai/machine-cli-policy.md`, `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md`  
- Principles: `.ai/PRINCIPLES.md`  
- Agent doc routing: `.cursor/rules/agent-doc-routing.mdc` (machine canon under `.ai/`)

## Sequencing (rough)

1. Architecture boundaries → 2. Registry + schemas → 3. Context + precedence → 4. Read-only explainability → 5. Shadow → 6. Advisory runtime → 7. Narrow enforcement → 8. Controlled mutation → 9. Future map contract  

Individual task specs may refine order via `dependsOn`.
