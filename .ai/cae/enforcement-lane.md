# CAE narrow enforcement lane (v1)

**Task:** **`T851`**. **Implementation:** **`T866`**. **Shadow / labels:** **`T848`**, **`T863`**. **Acknowledgements:** **`T844`**. **Gate ADR:** **`.ai/adrs/ADR-cae-enforcement-shadow-gate-v1.md`**.

## Principle

**Fail-closed only for enumerated cases.** Every other CAE signal is **advisory** by default. Enforcement that **blocks** command execution or **adds** hard gates beyond existing Tier A/B **`policyApproval`** is **allowlisted** here or it is **forbidden**.

## Relationship to existing policy

- **Tier A/B `policyApproval`** (**`.ai/POLICY-APPROVAL.md`**, **`.ai/machine-cli-policy.md`**) remains the **only** JSON approval lane for **`workspace-kit run`** mutators classified sensitive today.
- CAE **must not** invent parallel approval JSON fields that replace **`policyApproval`** for Tier A/B commands. CAE may **surface** human steps (ack copy, playbooks) that **precede** a normal mutating run — operators still pass **`policyApproval`** on the mutating argv when required.

## Router sketch (`ModuleCommandRouter`)

**`src/core/module-command-router.ts`** resolves and dispatches module commands. **`T864`**/**`T866`** integration target:

1. **Pre-dispatch** — optional CAE evaluation with **`evaluationPipelineMode: live`** and **`shadowObservation.wouldEnforce`** already computed for diagnostics.
2. **Allowlisted block** — if CAE enforcement is **on** and the command × bundle tuple matches **Allowlist § Block dispatch**, return structured failure **before** `module.execute` (same process as pilot arg validation failures: JSON **`ok: false`**, non-zero exit).
3. **Otherwise** — dispatch unchanged; CAE may still attach **advisory** payloads via **`responseTemplate`** / side channels documented in **`T866`**.

## Allowlist — block dispatch (live only)

Rows are **AND** predicates. All must match for a block. **Empty until `T866` seeds the first row** — this section is the **shape** contract.

| `id` | `commandName` pattern | Bundle / ack condition | Exit / `code` |
| --- | --- | --- | --- |
| _(none v1)_ | — | — | — |

**`T866`** MUST assign each row a stable **`id`** for remediation catalog entries.

## Allowlist — require pre-step (non-blocking JSON)

“Require” means **surface** a required human/CLI step **before** proceeding; it **does not** remove the need for **`policyApproval`** on the actual mutator.

| `id` | Pre-step | Notes |
| --- | --- | --- |
| `cae.require.ack_enforcement` | **`satisfy_required`** + **`blockingLane: enforcement`** + not satisfied | Blocks only when **`T866`** maps to router gate; ack capture **`T862`**/**`T867`**. |

## Explicit forbiddens

| Forbidden | Rationale |
| --- | --- |
| Block **Tier C** discovery reads (`list-tasks`, `get-next-actions`, …) via CAE | Breaks agent bootstrap; **`T847`**. |
| Waive **`policyApproval`** when manifest marks command sensitive | Code + manifest own safety. |
| Broad “block all `run` when CAE unhappy” | Violates enumerated allowlist rule. |
| Enforcement when **`evaluationPipelineMode: shadow`** | Shadow never blocks (**`T848`**). |
| Auto-mutating registry / task store from enforcement path | **`T852`** — git/PR or dedicated mutators only. |

## Exit codes and JSON `code` strings

Align with **`src/cli.ts`** outcomes: on enforcement block use non-zero exit (e.g. **`EXIT_VALIDATION_FAILURE`**) and structured JSON:

| Situation | Suggested `code` | `remediation` |
| --- | --- | --- |
| Allowlisted block fired | `cae-enforcement-blocked` | `instructionPath` → future **`cae-enforcement.md`**; `docPath` → **`enforcement-lane.md`** |
| Ack not satisfied | `cae-ack-required` | link ack surface / `T862` |
| CAE disabled but enforcement requested | `cae-enforcement-unavailable` | enable **`kit.cae.*`** flags per **`T860`** |

**`cli-remediation`:** register **`cae-enforcement-blocked`** and **`cae-ack-required`** in the error remediation catalog when **`T866`** lands (**`T851`** supplies strings only).

## `responseTemplate` / advisory mode

- **Advisory** payloads may use existing **`defaultResponseTemplateId`** / template machinery **only** when they **do not** imply success on a blocked command.
- **Shadow** runs may attach **`presentation`**-shaped hints with **`matchedSections`** including CAE diagnostics — must be labeled **`shadow`** (**`T848`**).

## Cross-references

- **`.ai/PRINCIPLES.md`** — policy model changes require human approval (**R009**).
- **`ADR-cae-enforcement-shadow-gate-v1.md`** — shadow bake before live block.
- **`.ai/cae/acknowledgement-model.md`**
