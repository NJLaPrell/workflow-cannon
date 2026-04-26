# ADR: Context Activation Engine (CAE) — architecture & boundaries (v1)

## Status

Accepted — Phase 70 (**`T837`**). Implementation follows later tasks **`T838`–`T869`**; this ADR is **documentation only**.

## Context

Workflow Cannon needs a **Context Activation Engine (CAE)** that evaluates **structured** context and returns a **deterministic** activation bundle (policy / think / do / review families). Hard safety and trust properties already live in code, policy docs, and Tier A/B **`policyApproval`** flows. CAE must **tighten or guide** agent behavior **without** weakening code-enforced invariants or bypassing approval lanes.

The repo already exposes **`ModuleActivationReport`** (`schemaVersion: 1`, per-module enablement and dependency satisfaction) from **`ModuleRegistry.getActivationReport()`** in **`src/core/module-registry.ts`**. That name collides colloquially with “activation” in CAE. This ADR **splits terminology** so design docs and code stay unambiguous.

Shared program context: **`tasks/cae/CAE-PROGRAM-CONTEXT.md`**.

## Decision — naming & disambiguation

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Module Activation Report** | Snapshot of **which workflow modules are enabled** and whether **dependsOn / optionalPeers** are satisfied for the registry. | **`ModuleActivationReport`** type, **`getActivationReport()`**, consumed e.g. by **`src/core/agent-instruction-surface.ts`**. |
| **CAE activation** | A **declared, evaluated** policy/think/do/review **activation** (artifact references, precedence, acknowledgements, trace) produced by the **Context Activation Engine**. | Future CAE module, registry, schemas (**`T839`+**). |

In prose, use **“module enablement report”** or **`ModuleActivationReport`** when referring to the registry type; use **“CAE activation”** or **“activation definition”** for CAE.

## Decision — planned kit module id

- **Module id:** **`context-activation`** (CAE implementation surfaces under this id; avoid scattering CAE logic across unrelated modules).
- Code layout may use e.g. **`src/core/cae/`** or module-owned paths as long as the **kit-facing id** remains **`context-activation`** for registration and CLI routing.

## Decision — feature flag (rollout)

- **Config key:** **`kit.cae.enabled`** (boolean; default **`false`** until implementation tasks wire safe behavior).
- Shadow mode and read-only surfaces may honor additional keys in later tasks; v1 rollout must remain **fail-closed** when CAE is disabled or unavailable.

## Decision — user-facing product name

- **Official name:** **Context Activation Engine**, abbreviated **CAE** in internal specs, ADRs, and CLI where space is tight.

## Decision — what CAE may / must not do

| CAE may | CAE must not |
| --- | --- |
| Resolve **effective** policy / think / do / review **bundles** from structured context and **registry-backed** artifact ids. | Replace **schema validation**, **impossible state** checks, or **Tier A/B** enforcement implemented in code. |
| **Tighten** posture (warnings, required acknowledgements, recommended playbooks) when consistent with **`.ai/PRINCIPLES.md`**. | **Loosen** or bypass hard invariants, **`policyApproval`** requirements, or migration / destructive-operation guards. |
| Operate in **shadow** or **advisory** modes that **observe** without changing outcomes. | **Silently** change command outcomes or hide CAE influence (trace / explainability are mandatory design targets per program context). |
| Reference **docs** (runbooks, playbooks, policy) **by stable id**, not by embedding full bodies in payloads. | Treat arbitrary natural language or **executable** payloads as trusted evaluation input in v1. |

## Decision — layer ownership (invariant classes)

| Layer | Owns |
| --- | --- |
| **Code (authoritative)** | Schema validation; illegal transitions; destructive/migration safety; baseline **`policyApproval`** structure; module dependency integrity; deterministic command routing. |
| **CAE (advisory + bounded enforcement later)** | Structured activation resolution; precedence and merge semantics; acknowledgement **strengths** (separate from Tier A/B approval); trace and explanation surfaces; shadow/compare behavior. |
| **Docs (reference)** | Runbooks, playbooks, checklists, templates, **`.ai/`** policy and principles; CAE **references** these via registry ids. |

## Decision — acknowledgement vs approval

- **Acknowledgements** (CAE): strengths such as **`none` \| `surface` \| `recommend` \| `ack_required` \| `satisfy_required`** — design detail in **`T844`**.
- **Tier A / B approval**: JSON **`policyApproval`** on **`workspace-kit run`** as defined in **`.ai/POLICY-APPROVAL.md`** and **`.ai/machine-cli-policy.md`**.
- CAE **must not** conflate the two: operators need a clear distinction between “agent acknowledged a surfaced risk” and “policy-approved mutating run.” High-level alignment with **`.ai/PRINCIPLES.md`** (safety and trustworthiness first).

## Decision — integration anchors (read-only hooks, target)

CAE **read-only** and **shadow** integration should attach **around** existing dispatch boundaries without forking module contracts:

| Anchor | Role |
| --- | --- |
| **`src/cli.ts`** | CLI entry; future pre/post hooks for **evaluate / explain / trace** and shadow summaries. |
| **`src/core/module-command-router.ts`** | Command resolution and dispatch; natural seam for **command-scoped** context and CAE evaluation **before** module execution (design detail in **`T849`**). |
| **`src/core/agent-instruction-surface.ts`** | Instruction and activation reporting for agents; consumes **`ModuleActivationReport`** today — CAE surfaces must **not** overload that type. |

## Explicit v1 non-goals (from program context)

Aligned with **`tasks/cae/CAE-PROGRAM-CONTEXT.md`** — **omit in v1**:

- Arbitrary code inside activation payloads.
- Freeform natural-language **conditions** as authoritative inputs.
- Executable workflow **chains / macros** as first-class activations.
- **Cognitive-map** dependency (type reserved; no v1 reliance).
- Agent-authored **activation editing** before governance and mutation tasks ship.
- Scattered per-module CAE logic **without** central **`context-activation`** ownership.
- **Hidden** CAE behavior (no trace / inspectability).

## Consequences

- Downstream tasks (**`T838`–`T869`**) implement registry, schemas, CLI, runtime, and persistence **within** these boundaries.
- Reviewers can answer **“what CAE must never do”** from the **may / must not** table above.
- **`ModuleActivationReport`** remains the name for **module enablement**; CAE uses distinct types and vocabulary in specs and code.

## References

- **`.ai/adrs/ADR-cae-artifact-registry-v1.md`** — stable artifact ids, types, and **`ref`** rules (**`T839`**).
- **`.ai/TERMS.md`** — operational CAE vocabulary (**`T838`**) aligned with this ADR.
- **`.ai/PRINCIPLES.md`** — trade-off order; CAE is subordinate to safety and trustworthiness.
- **`.ai/POLICY-APPROVAL.md`**, **`.ai/machine-cli-policy.md`**, **`.ai/AGENT-CLI-MAP.md`** — approval lanes vs acknowledgement.
- **`tasks/cae/CAE-PROGRAM-CONTEXT.md`** — program north star.
- **`.cursor/rules/agent-doc-routing.mdc`** — machine canon under **`.ai/`**.
