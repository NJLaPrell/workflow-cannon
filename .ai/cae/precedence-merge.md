# CAE precedence, merge & effective bundle semantics (v1)

**Task:** **`T843`**. **Inputs:** **`schemas/cae/activation-definition.schema.json`** (**`T840`**), **`.ai/cae/lifecycle.md`** (**`T841`**), **`schemas/cae/evaluation-context.v1.json`** (**`T842`**). **Output schema:** **`schemas/cae/effective-activation-bundle.v1.json`**. **Implementation:** **`T860`**. **Trace shapes:** **`T846`** (cross-ref below).

## Invariants (must not be violated)

1. **Code beats CAE for loosening** — CAE MUST NOT remove or bypass code-enforced gates (**`ADR-context-activation-engine-architecture-v1.md`**).
2. **Determinism** — Same registry snapshot + same **`evaluation-context`** + same evaluator mode (**live** vs **shadow**) ⇒ **identical** **`bundleId`**, **`families`**, **`pendingAcknowledgements`**, **`conflictShadowSummary`**, **`traceId`** (see hashing in **`T842`**).
3. **No silent ambiguity** — Same-family ties that are not explicitly **merge**-compatible MUST end as **`shadow`** or **`fail_explicit`** per rules below.

## Evaluation order (stepwise)

After lifecycle pre-filter (**`T841`**) and **scope match** on **`evaluation-context`**:

1. **Partition** surviving rows by **`family`** (`policy` \| `think` \| `do` \| `review`).
2. **Per family**, compute **sort key** for each row: **`(aggregateTightness, -priority, activationId)`** ascending lexicographic order:
   - **`aggregateTightness`** — see § Specificity (lower = tighter overall scope).
   - **`priority`** — from activation definition (**`T840`**); higher integer wins, so sort **descending** via negation in tuple.
   - **`activationId`** — ASCII lexicographic **tie-break** (provably total order).
3. **Conflict detection (within family)**:
   - If top two rows **agree** on artifact closure (same ordered **`artifactIds`** after resolution) → **merge** (dedupe into one **`resolvedActivation`**).
   - If **policy** family rows encode **contradictory mandatory guidance** on the same artifact id (implementation-defined predicate in **`T860`**) → **`fail_explicit`** in **live** mode; in **shadow** mode record **`shadow`** and keep both candidates in trace.
   - If same **`aggregateTightness`** and same **`priority`** and not merge-compatible → default **`shadow`** in **live** when **`kit.cae.enabled`** shadow defaults apply; otherwise **`fail_explicit`** (**config in `T847`/`T848`** — here document **default** **`shadow`** for tie when not policy-contradiction).
4. **Cross-family**: **`policy`** **never** loses to **`think` \| `do` \| `review`** on **conflicting operational outcome** for the same user-visible decision; advisory families may still **append** non-conflicting artifacts.
5. **Emit** **`resolvedActivation`** entries per family in **final sort order** (stable).

## Specificity (aggregate tightness)

Per condition in **`scope.conditions`** (**`T840`**), assign **tightness** (lower = stricter):

| Condition kind | Tightness |
| --- | --- |
| `commandName` + `match: "exact"` | **0** |
| `taskIdPattern` | **1** |
| `commandName` + `match: "prefix"` | **2** |
| `taskTag` | **3** |
| `phaseKey` | **4** |
| `always` | **5** |

For a definition with **AND**ed conditions, **`aggregateTightness = max(tightness_i)`** (the weakest condition caps specificity).

## Policy contradiction (intra-family)

When two **`policy`** activations imply **incompatible mandatory outcomes** for the same **`artifactId`**:

- **Live:** **`resolution = fail_explicit`** unless governance marks one row **`disabled`**/**`retired`**.
- **Shadow:** **`resolution = shadow`**; bundle still lists **both** in trace-linked detail; effective **`families.policy`** follows **higher `priority`**, then **lower `aggregateTightness`**, then **`activationId`** lex order **only if** marked **non-contradictory** by **`T860`** predicate — if predicate fires, **do not** auto-pick; keep **fail_explicit** in live.

*(The exact “incompatible” predicate is **`T860`** responsibility; this doc requires it exist and be logged.)*

## Merge commutativity (sketch)

Let **`M(A,B)`** be merge when artifact sets are identical and strengths compatible: result is single **`resolvedActivation`** with same **`artifactIds`**, **`priority = max(priority)`**, **`aggregateTightness = min(tightness)`**, **`activationId = lexicographically smaller`** (stable primary). **`M`** is commutative on unordered pair when predicate true; full evaluation sorts **before** adjacent merge so output order is deterministic.

## Trace event cross-reference (**`T846`**)

Normative event strings and payloads: **`.ai/cae/trace-and-explain.md`**, **`schemas/cae/trace.v1.json`**. Mapping from this merge spec:

| Step | `eventType` |
| --- | --- |
| Family partition | `cae.trace.merge.family_bucket` |
| Sort key computed | `cae.trace.merge.rank` |
| Merge applied | `cae.trace.merge.merged` |
| Shadow tie | `cae.trace.merge.shadow_tie` |
| Fail explicit | `cae.trace.merge.fail_explicit` |
| Policy over advisory | `cae.trace.merge.policy_over_advisory` |
| Final bundle sealed | `cae.trace.merge.bundle_materialized` |

## Worked examples (normative intent)

### (a) Policy beats think

- **A** `family=policy`, scope matches, `priority=10`, artifact `X`.
- **B** `family=think`, scope matches, `priority=999`, artifact `Y` conflicting with `X` posture.
- **Result:** **`policy`** row **A** wins operational conflict; **`think`** may remain only if non-conflicting; else dropped from effective posture with **`conflictShadowSummary`** entry **`policy_wins`**.

### (b) Specificity tie-break

- **A** `always`, `priority=5`.
- **B** `phaseKey=70`, `priority=5`.
- **Result:** **B** sorts before **A** (**lower aggregateTightness**). If both attach same artifact id, **merge**; else **B** listed first in **`families.*`**.

### (c) Equal priority conflict → shadow

- **A** `do`, `aggregateTightness=2`, `priority=10`, artifact `P`.
- **B** `do`, `aggregateTightness=2`, `priority=10`, artifact `Q` (**incompatible** with `P`).
- **Default shadow mode:** **`conflictShadowSummary.entries[]`** with **`resolution=shadow`**, **`kind=same_family_tie`**; **`families.do`** contains **neither** as authoritative **or** contains **shadow-marked** placeholder per **`T860`** (must match **`effective-activation-bundle`** schema).

### (d) Equal priority conflict → fail (explicit)

- Same as (c) but **live** evaluation with **shadow disabled** and **incompatible** **`do`** artifacts.
- **Result:** **`resolution=fail_explicit`**; evaluation aborts CAE contribution; code paths unchanged (**fail-closed**).

### (e) Disabled activation ignored

- **A** `lifecycleState=disabled`, would have won on priority.
- **B** `active`, lower priority.
- **Result:** **A** removed in **`T841`** pre-filter; **B** applies normally; trace **`cae.trace.activation.lifecycle_skipped`** (see **`.ai/cae/activation-definition-trace-mapping.md`**).
