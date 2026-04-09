# Context Activation Engine (CAE) — operator & agent entry

**Task:** **`T855`**. **North star:** **`tasks/cae/CAE-PROGRAM-CONTEXT.md`**. **Human maintainer index:** **`docs/maintainers/AGENTS.md`** (not required for routine agent execution — see **`.cursor/rules/agent-doc-routing.mdc`**).

## What CAE is

CAE evaluates **bounded, typed** workspace + task + command context and returns a **deterministic effective activation bundle** (policy / think / do / review families) backed by **registry artifact ids**, not embedded doc bodies. It is **advisory first**; **shadow** then **narrow enforcement** roll out later (**`T848`**, **`T866`**).

## Start here (agents)

| Doc | Purpose |
| --- | --- |
| **`tasks/cae/CAE-PROGRAM-CONTEXT.md`** | Program objectives, boundaries, sequencing. |
| **`.ai/cae/registry/artifacts.v1.json`** | Bootstrap artifact id → path seed (**`T857`**); loader **T858**. |
| **`.ai/cae/evaluation-context.md`** + **`schemas/cae/evaluation-context.v1.json`** | What builders may put in context (**`T859`**). |
| **`.ai/cae/runtime-integration.md`** | Where CAE hooks into CLI vs router (**`T849`**). |
| **`.ai/cae/cli-read-only.md`** | `cae-*` **`wk run`** names, JSON envelope, tier **C** (no **`policyApproval`**) — **`T847`**. |
| **`.ai/cae/trace-and-explain.md`** | Trace + explain contracts (**`T846`**). |
| **`.ai/cae/failure-recovery.md`** | Failure × surface matrix (**`T853`**). |
| **`.ai/cae/error-codes.md`** | Stable loader / CLI error **`code`** strings (**`T858`**). |
| **`.ai/runbooks/cae-debug.md`** | Operator debug flow (doctor, registry, traces). |

## Acknowledgement vs `policyApproval`

CAE **acknowledgement strengths** (`none` | `surface` | `recommend` | `ack_required` | `satisfy_required`) are **not** Tier A/B JSON **`policyApproval`**. Code invariants and shipped policy lanes stay authoritative — see **`.ai/cae/acknowledgement-model.md`** and **`.ai/POLICY-APPROVAL.md`**.

## Read-only first

Inspect registry and evaluations via **`cae-*`** commands when shipped (**`T861`**, **`T862`**). **No mutation** of activations via CLI until governance (**`T852`**, **`T868`**) allows it.

## Traces

Pre-**`T867`**, traces may be **ephemeral** (in-memory / session); CLI payloads should advertise ephemeral traces when applicable. Persistent trace retrieval follows **`ADR-cae-persistence-v1.md`**.

## Config kill-switch (naming)

Effective **`kit.cae.enabled`** and shadow/enforcement flags are defined with the implementation train (**`T847`**, **`T848`**, **`T866`**). Until wired, treat **“CAE disabled”** as **no advisory payload** and **no enforcement side-effects** — see **`.ai/cae/failure-recovery.md`**.

## Debug CAE (flowchart)

See **`.ai/runbooks/cae-debug.md`**.

## Related stubs

- **`tasks/cae/artifacts/operator-doc-outline.md`** — historical outline; this README supersedes it for navigation.
