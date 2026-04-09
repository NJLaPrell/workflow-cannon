# CAE failure, degradation & recovery

**Task:** **`T853`**. **Implementation surfaces:** **`T858`–`T866`**. **CLI remediation patterns:** **`src/core/cli-remediation.ts`**, **`buildErrorRemediationCatalog`**.

## Principles

1. **Never** bypass code-level safety (schema validation, Tier A/B **`policyApproval`**, impossible transitions) because CAE failed.  
2. **Advisory** paths **continue** on CAE error with explicit warning / empty **`cae`** block.  
3. **Enforcement** paths (**`T866`**) **block** or **fail explicit** when CAE is required and cannot produce a valid bundle — product default: **block** when enforcement enabled (no silent fallback that hides policy).

## Stable error `code` strings (loader / evaluator / CLI)

| Code | Meaning |
| --- | --- |
| **`cae-registry-read-error`** | Registry file missing or unreadable. |
| **`cae-registry-invalid-json`** | Registry file not parseable JSON. |
| **`cae-registry-schema-invalid`** | Row fails **`registry-entry.v1.json`** or envelope shape. |
| **`cae-activations-schema-invalid`** | Activation row fails **`activation-definition.schema.json`**. |
| **`cae-artifact-missing`** | **`ref.path`** does not exist on disk. |
| **`cae-evaluator-internal-error`** | Unexpected throw during evaluation (bug boundary). |
| **`cae-context-invalid`** | **`evaluationContext`** fails **`evaluation-context.v1.json`**. |

Handlers should attach **`remediation.instructionPath`** where applicable (mirror **`cli-remediation`** ADR).

## Failure × surface matrix (v1 targets)

| Failure | **Advisory** (`cae-*` read-only, instruction-surface `cae` block) | **Shadow** | **Enforcement** (`T866`) |
| --- | --- | --- | --- |
| Registry unreadable / invalid | Continue; omit **`cae`** or emit **`issues[]`** with **`cae-registry-*`** codes; **`cae-health`** reports **`issues`**. | Same as advisory; **`shadowObservation`** notes **would** evaluate unknown. | **Block** allowlisted command if enforcement requires CAE input; else treat as advisory. |
| Partial registry (some rows invalid) | **Fail closed** for **`cae-list-*`** for bad file; optional **validate-only** command future (**`T868`**). | Shadow records **degraded**. | Prefer **block** if invalid row matches allowlisted scope. |
| Context incomplete / invalid | **`cae-evaluate`** returns **`ok: false`** with **`cae-context-invalid`**; other commands N/A. | Shadow continues with partial context only if explicitly allowed (default **no**). | **Block** if enforcement needs full context. |
| Evaluator throws | **`cae-evaluate`**: **`ok: false`**, **`cae-evaluator-internal-error`**; advisory surfaces: omit CAE. | Flag **shadow pipeline fault** on trace. | **Block** (fail-safe). |
| Trace store miss (**`cae-get-trace`**) pre-**`T867`** | **`ok: false`**, code **`cae-trace-not-found`** (stable when wired). | — | — |
| CAE disabled (**`kit.cae.enabled` false**) | No CAE fields; commands return **empty** or **disabled** marker per contract. | No shadow payload. | Enforcement path **off**. |

## `wk doctor` lines (spec)

When CAE is enabled in config and registry paths resolve, doctor **may** emit (implementation **`T858`+**):

- `CAE registry: ok (<n> artifacts, <m> activations)`  
- `CAE registry: warning — <code> (<short hint>)`  
- `CAE: disabled (kit.cae.enabled=false)`

Doctor **must not** print secrets or absolute paths beyond repo-relative hints.

## Operator recovery (playbook section)

1. **Validate JSON:** `pnpm exec wk run cae-health '{}'` when shipped (**`T862`**) — inspect **`data.issues`**.  
2. **Re-check paths:** **`artifacts.v1.json`**, **`activations.v1.json`** under **`.ai/cae/registry/`** (or configured paths in **T858**).  
3. **Clear cache:** in-process CAE cache reset = new process (no persistent cache file in v1).  
4. **Disable CAE:** set **`kit.cae.enabled`** false in workspace config; confirm doctor line.  
5. **Read traces:** **`.ai/runbooks/cae-debug.md`**.

## Related

- **`.ai/cae/runtime-integration.md`** — ordering vs **`policyApproval`**.  
- **`.ai/cae/advisory-surfacing.md`** — advisory payload semantics (**`T850`**).  
- **`.ai/cae/shadow-mode.md`** — shadow labels (**`T848`**).
