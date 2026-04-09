# CAE trace & explain surface (v1)

**Task:** **`T846`**. **Normative schemas:** **`schemas/cae/trace.v1.json`**, **`schemas/cae/explain-response.v1.json`**. **Precedence cross-ref:** **`.ai/cae/precedence-merge.md`** (**`T843`**). **Activation mapping:** **`.ai/cae/activation-definition-trace-mapping.md`**. **Persistence posture:** **`.ai/adrs/ADR-cae-persistence-v1.md`** (**`T845`**).

## `traceId` and envelope

- **`eventType` validation:** **`schemas/cae/trace.v1.json`** uses a **`cae.trace.…`** pattern so forward-compatible subtypes validate; the tables below are the **v1 required vocabulary** for **`T860`** (prefer listed strings over ad hoc suffixes).
- **`traceId`** — opaque string (8–128 chars) shared with **`effective-activation-bundle.traceId`** when this trace documents that evaluation (**`T843`**).
- **`anchors`** — optional **content hashes** for canonical **`evaluation-context`** and registry snapshot (**`T842`** hashing rules). Used for replay and tamper detection; never embed raw context JSON in the trace envelope.
- **`events`** — ordered list; **`seq`** MUST be strictly increasing starting at **`0`** (contiguous recommended for v1 producers).

## Truncation and size limits

| Limit | Value | Notes |
| --- | --- | --- |
| Max events per trace | **512** | Schema `maxItems`; producers SHOULD stop earlier under load. |
| `payload.detail` | **512** chars | Stable diagnostic hint. |
| `payload.detailBestEffort` | **2048** chars | Longer human copy; may be clipped when persisting (**`T845`**). |
| `explain.summaryText` | **8192** chars | NL summary; clip + set **`truncation.summaryTextCharsOmitted`**. |

When tail events are dropped, set **`truncation.eventsDroppedFromTail`** on the trace envelope.

## Redaction (paths and secrets)

- **No absolute workspace paths** in any persisted trace field. Use **`workspacePathFingerprint`** (hash / token from **`evaluation-context`** builders, **`T859`**) or omit.
- **`instructionPathRedacted`** — **repo-relative** path (preferred), **basename only**, or **opaque token** mapping to an internal doc id. Never store full `~` or `/Users/...` style paths.
- **No secrets, tokens, or raw `policyApproval` JSON** in trace or explain payloads.
- **Task titles / tags** — if echoed, stay within **`evaluation-context`** bounds; truncate per **`T842`** schema.

## Explain levels and API stability

| `level` | Behavior |
| --- | --- |
| **`summary`** | **`summaryText`** required; **`verboseEvents`** SHOULD be omitted or empty. |
| **`verbose`** | **`summaryText`** still required (short lead); **`verboseEvents`** MAY list per-event digests. |

**`textStability`:** **`best_effort_v1`** — natural-language strings (**`summaryText`**, **`payloadSummary`**, **`detailBestEffort`**) may change between patch releases. **Stable** for automation: envelope keys, **`eventType`** strings, **`seq`**, and structured **`payload`** keys defined in **`trace.v1.json`**.

## Precedence coverage (**`T843`**) — events vs silent steps

Every step below MUST produce at least one listed **`cae.trace.merge.*`** event **or** use the **silent** justification (implementations MUST NOT drop merge decisions without documentation).

| T843 step | Required / optional event | Payload hints |
| --- | --- | --- |
| § Partition by family | **`cae.trace.merge.family_bucket`** per family touched | **`family`**, **`candidateCount`** |
| § Sort key | **`cae.trace.merge.rank`** per compared row or batch | **`activationId`**, **`rankPreview`**, **`aggregateTightness`**, **`priority`** |
| Merge-compatible closure | **`cae.trace.merge.merged`** | **`peerActivationId`**, **`artifactIds`** |
| Shadow tie | **`cae.trace.merge.shadow_tie`** | **`resolution`**: `shadow`, **`evalMode`** |
| Fail explicit | **`cae.trace.merge.fail_explicit`** | **`resolution`**: `fail_explicit`, **`reason`** |
| Policy vs advisory outcome | **`cae.trace.merge.policy_over_advisory`** when policy displaces or suppresses advisory | **`family`**, **`activationId`** (winner), **`peerActivationId`** |
| Cross-family additive (no conflict) | **`cae.trace.merge.advisory_non_conflict`** **or silent** | **Silent OK** only when no structural merge decision occurred beyond bundle assembly; must still emit **`cae.trace.merge.bundle_materialized`**. |
| Emit resolved bundle | **`cae.trace.merge.bundle_materialized`** once at end | **`familyCounts`** |

## Activation lifecycle events (taxonomy)

| `eventType` | When emitted | Typical `payload` keys |
| --- | --- | --- |
| **`cae.trace.activation.candidate_seen`** | Row entered candidate set post-validate | **`activationId`**, **`family`** |
| **`cae.trace.activation.lifecycle_skipped`** | Pre-filter removed **`disabled`** / **`retired`** | **`activationId`**, **`lifecycleState`**, **`reason`** |
| **`cae.trace.activation.draft_skipped`** | Draft excluded from production path | **`activationId`**, **`reason`** |
| **`cae.trace.activation.scope_matched`** | Scope AND satisfied (rolled-up or per-condition) | **`activationId`**, **`matched`**: true, **`conditionKind`** (optional) |
| **`cae.trace.activation.scope_failed`** | Scope failed | **`activationId`**, **`matched`**: false, **`conditionKind`** |
| **`cae.trace.activation.family_attached`** | Row attached to family bucket | **`activationId`**, **`family`** |
| **`cae.trace.activation.priority_compared`** | Tie-break or ordering | **`activationId`**, **`peerActivationId`**, **`priority`** |
| **`cae.trace.activation.artifact_bound`** | Registry resolution | **`activationId`**, **`artifactId`**, **`artifactResolution`** |
| **`cae.trace.activation.shadow_only`** | Shadow pipeline only | **`activationId`**, **`evalMode`**: `shadow` |
| **`cae.trace.activation.advisory_only`** | Advisory lane | **`activationId`**, **`reason`** |

## Merge events (taxonomy)

| `eventType` | When emitted | Typical `payload` keys |
| --- | --- | --- |
| **`cae.trace.merge.family_bucket`** | Family partition | **`family`**, **`candidateCount`** |
| **`cae.trace.merge.rank`** | Sort key computed / applied | **`activationId`**, **`rankPreview`**, **`aggregateTightness`**, **`priority`** |
| **`cae.trace.merge.merged`** | Merge commutativity applied | **`activationId`**, **`peerActivationId`**, **`artifactIds`** |
| **`cae.trace.merge.shadow_tie`** | Same-family incompatible tie → shadow | **`resolution`**, **`evalMode`**, **`family`** |
| **`cae.trace.merge.fail_explicit`** | Abort evaluation contribution | **`resolution`**, **`reason`**, **`family`** |
| **`cae.trace.merge.policy_over_advisory`** | Policy wins cross-family conflict | **`activationId`**, **`peerActivationId`**, **`family`** |
| **`cae.trace.merge.bundle_materialized`** | Final **`resolvedActivation`** list sealed | **`familyCounts`** |
| **`cae.trace.merge.advisory_non_conflict`** | Explicit log for additive advisory | **`activationId`**, **`family`** |

## CLI replay (**`T862`** / **`T847`**)

`cae-explain` SHOULD accept **`traceId`** (load persisted or session trace) **or** inline **`evaluationRequest`** replay; exact argv shape **`T847`**. This doc defines only JSON shapes, not handlers.
