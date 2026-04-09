# CAE activation definition → trace event mapping (v1)

**Audience:** implementers of evaluation + trace (**`T860`**, **`T846`**).  
**Normative definition shape:** `schemas/cae/activation-definition.schema.json` (**`T840`**).

When an activation definition is **considered** during evaluation, the engine SHOULD emit trace events (exact payload shapes in **`T846`**). This table is **semantic** mapping only.

| Definition field / step | Suggested trace `type` (string) | When |
| --- | --- | --- |
| Row loaded / parsed | `cae.trace.activation.candidate_seen` | Definition row passed schema validation and entered candidate set. |
| `lifecycleState` in `disabled` \| `retired` | `cae.trace.activation.lifecycle_skipped` | Pre-filter removed row before scope matching (**`T841`** order). |
| `lifecycleState` `draft` in production registry | `cae.trace.activation.draft_skipped` | Loader / evaluator policy excluded draft from production paths. |
| `scope.conditions` evaluation | `cae.trace.activation.scope_matched` / `cae.trace.activation.scope_failed` | Per condition or rolled-up AND result. |
| `family` selected for merge | `cae.trace.activation.family_attached` | Row contributed to a family bucket before precedence merge (**`T843`**). |
| `priority` used in tie-break | `cae.trace.activation.priority_compared` | Conflicts or ordering among same-family candidates. |
| `artifactRefs[].artifactId` resolved | `cae.trace.activation.artifact_bound` | Registry lookup succeeded or failed (`artifact_missing`). |
| `flags.shadowEligible` + runtime shadow | `cae.trace.activation.shadow_only` | Shadow pipeline recorded would-activate (**`T848`**). |
| `flags.advisoryOnly` | `cae.trace.activation.advisory_only` | Enforcement lane skipped for this row (**`T851`**). |

**Executable content:** v1 definitions MUST NOT carry code or NL conditions; trace SHOULD NOT include raw unbounded user strings beyond defined fields (**redaction:** **`T842`**).
