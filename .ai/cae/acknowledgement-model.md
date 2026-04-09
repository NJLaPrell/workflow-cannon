# CAE acknowledgement model (v1)

**Task:** **`T844`**. **Bundle field:** **`pendingAcknowledgements`** in **`schemas/cae/effective-activation-bundle.v1.json`**. **Not** a substitute for Tier A/B **`policyApproval`** (**`.ai/POLICY-APPROVAL.md`**). **Enforcement wiring:** **`T866`**.

## Strengths (enum)

| Strength | Meaning | Typical surfacing |
| --- | --- | --- |
| **`none`** | No acknowledgement surface. | Omitted in practice or recorded for trace only. |
| **`surface`** | Show informational notice; does not gate. | Doctor / instruction surface / dashboard copy. |
| **`recommend`** | Stronger nudge; still **non-blocking** in v1 default. | Same channels as **`surface`** with elevated copy tier. |
| **`ack_required`** | Operator/agent must **explicitly acknowledge** before proceeding in contexts where CAE is consulted. | UI/CLI ack capture (**`T862`**); blocking only if **`blockingLane`** allows (**below**). |
| **`satisfy_required`** | Strongest CAE acknowledgement; may require **evidence** or **human attestation** per governance. | **`machineCheckable`** path OR human-only path (**below**). |

## Orthogonality to `policyApproval`

| Mechanism | Owns | Blocks mutating `wk run`? |
| --- | --- | --- |
| **Code gates** | Schema validation, illegal transitions, SQLite invariants | **Yes** (authoritative). |
| **Tier A/B `policyApproval` JSON** | Policy-sensitive **`workspace-kit run`** | **Yes** when command is Tier A/B (**`.ai/machine-cli-policy.md`**). |
| **CAE acknowledgement** | Risk surfacing tied to **activation** rows | **Only** inside **allowlisted** CAE enforcement surfaces (**`T866`**); **never** replaces JSON **`policyApproval`**. |

**Rule:** If a mutation requires **`policyApproval`**, CAE **cannot** waive it via **`satisfy_required`**.

## Persistence (v1 default)

- **Default:** acknowledgement state is **session-scoped** (extension host / CLI session memory). **`ackToken`** correlates UI ↔ evaluator within a session.
- **Optional persistence:** **`T867`** MAY persist rows `(traceId, ackToken, activationId, satisfiedAt, actor)` in planning SQLite when enabled; **off** ⇒ **no-op persistence adapter** for acks.

## Blocking semantics

- **`blockingLane`**:
  - **`none`** — never blocks command execution; advisory surfacing only (**`T865`**).
  - **`advisory`** — may block **only** inside CAE advisory pipelines (e.g. pre-flight chat) — **not** core router (**`T849`** alignment).
  - **`enforcement`** — may block **only** for **narrow allowlisted** commands/actors (**`T866`**), **after** shadow period policy. **`ack_required`** / **`satisfy_required`** use this lane.

## `satisfy_required` — machine vs human

- **`machineCheckable: true`** — satisfaction MAY be discharged by **structured evidence** (e.g. hash of canonical context + registry snapshot + recorded ack artifact) defined in **`T860`**/**`T866`**.
- **`machineCheckable` omitted / false** — **human attestation** path only; automation MUST NOT self-satisfy.

## Bundle item shape (normative fragment)

See **`$defs.pendingAcknowledgementItem`** in **`schemas/cae/effective-activation-bundle.v1.json`**.

- **`surfaceCopyKey`** — stable lookup key for rendered copy; **no** raw natural-language paragraphs in the bundle JSON.

## Examples

See **`fixtures/cae/bundles/valid/pending-acks-one-per-strength.json`** — one **`pendingAcknowledgements`** row per strength (minimal **`families`** empty).
