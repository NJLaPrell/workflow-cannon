# CAE shadow mode — semantics & observability (v1)

**Task:** **`T848`**. **Bundle schema:** optional **`evaluationPipelineMode`** + **`shadowObservation`** on **`schemas/cae/effective-activation-bundle.v1.json`**. **Evaluator flag:** same code path as live (**`T860`**); **CLI labeling:** **`T863`**. **Enforcement:** **`T866`** (out of scope here — shadow MUST NOT block).

## Invariant (non-negotiable)

**Shadow mode never weakens code-enforced invariants:** schema validation, illegal transitions, SQLite integrity, Tier A/B **`policyApproval`** gates, and router hard stops remain **unchanged**. Shadow only adds **labels**, **sidecar observations**, and **trace/explain** output — it does **not** remove requirements, bypass approvals, or mutate task/registry stores (**`T863`** acceptance).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Live** | Pipeline mode where CAE output is authoritative for **allowlisted** advisory/enforcement surfaces once **`T866`** exists; today: labels only. |
| **Shadow** | Pipeline mode where CAE computes **the same** merge/precedence result but outcomes are prefixed **would** / **observed** and **must not** block commands or persist registry mutations. |
| **`evaluationPipelineMode`** | Top-level bundle field mirroring the evaluator/argv **`evalMode`** (**`live`** \| **`shadow`**). When **omitted**, consumers treat as **`live`** for backward compatibility. |
| **`conflictShadowSummary.evalMode`** | Must **agree** with **`evaluationPipelineMode`** when both present (**`T860`** validates). |
| **`shadowObservation`** | Optional sidecar: **would activate**, **would require ack**, **would enforce** (classification only). |

## Default rollout (v1)

- **Opt-in shadow:** effective config defaults **`kit.cae.shadow.defaultOn`** to **`false`** until maintainers explicitly enable shadow-by-default for a release train (document change in **`RELEASING.md`** when flipped).
- Operators MAY set env **`WORKSPACE_KIT_CAE_SHADOW=1`** for local experiments (exact key **`T860`** / config module); this doc only names the **intent**.

## Usefulness vs noise (hooks)

- **v1:** **`shadowObservation.usefulnessSignal`** is **`absent`** unless an operator tool records feedback (**`useful`** \| **`noisy`**). No required persistence (**`T845`** / **`T867`**).
- **Future:** **`cae-shadow-feedback`** or dashboard capture (**`T863`** operator snippet) may set the field; merge rules stay unchanged (**`T863`**).

## JSON examples

### Live bundle (minimal)

```json
{
  "schemaVersion": 1,
  "bundleId": "cae.bundle.example",
  "evaluationPipelineMode": "live",
  "families": { "policy": [], "think": [], "do": [], "review": [] },
  "pendingAcknowledgements": [],
  "conflictShadowSummary": { "evalMode": "live", "entries": [] },
  "traceId": "cae.trace.example"
}
```

### Shadow bundle with observation sidecar

```json
{
  "schemaVersion": 1,
  "bundleId": "cae.bundle.example.shadow",
  "evaluationPipelineMode": "shadow",
  "families": { "policy": [], "think": [], "do": [], "review": [] },
  "pendingAcknowledgements": [],
  "conflictShadowSummary": { "evalMode": "shadow", "entries": [] },
  "traceId": "cae.trace.example.shadow",
  "shadowObservation": {
    "wouldActivate": [
      {
        "activationId": "cae.act.policy.demo",
        "family": "policy",
        "artifactIds": ["cae.doc.example"]
      }
    ],
    "wouldRequireAck": [],
    "wouldEnforce": [
      {
        "activationId": "cae.act.policy.demo",
        "commandName": "run-transition",
        "lane": "enforcement"
      }
    ],
    "usefulnessSignal": "absent"
  }
}
```

## Mode × surface matrix

| Surface | **Live** | **Shadow** |
| --- | --- | --- |
| **`cae-evaluate`** (**`T862`**) | Emit **`evaluationPipelineMode: live`**; **`families`** = effective posture. | Emit **`evaluationPipelineMode: shadow`** + **`shadowObservation`**; **`families`** may mirror live **or** be explicitly empty with detail in observation (**`T860`** chooses; must document). |
| **`cae-explain`** | Explain committed/effective trace. | Explain **would-have** trace; **`explain-response.textStability`** still **`best_effort_v1`**. |
| **Router pre-hook** (**`T864`**) | May attach advisory payloads. | **No-op** for block/require; only log/trace **would** classify. |
| **Enforcement** (**`T866`**) | Allowlisted block/require. | **Disabled** — only **`shadowObservation.wouldEnforce`** entries. |

## Persistence

- **Traces:** Shadow runs use the same **`trace.v1`** shape; persistence **off** by default (**`T845`**). **`T867`** MAY persist shadow traces with **`evaluationPipelineMode: shadow`**; pruning applies equally.

## Cross-references

- **`.ai/cae/precedence-merge.md`**, **`.ai/cae/trace-and-explain.md`**
- **`.ai/cae/cli-read-only.md`** (**`T847`**) — argv **`evalMode`**
- **`T863`** — pipeline implementation
- **`T866`** — enforcement lane (**`.ai/cae/enforcement-lane.md`**)
