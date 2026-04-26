# CAE read-only CLI contract (v1)

**Task:** **`T847`**. **Module id:** **`context-activation`** (per **`ADR-context-activation-engine-architecture-v1.md`**). **`workspace-kit run` names:** **`cae-*`** kebab-case (short, stable for agents). **Handlers:** registry list/get **`T861`**; registry validate **`T868`** (`cae-registry-validate`); evaluate / explain / health / conflicts / trace **`T862`**. **Schemas:** **`schemas/cae/cli-read-only-requests.v1.json`** (argv), **`schemas/cae/cli-read-only-data.v1.json`** (`data` on success).

## Policy and tier

- **Tier C** — no JSON **`policyApproval`** on these commands unless future policy reclassifies them via **`policy.extraSensitiveModuleCommands`**.
- **Automation:** agents MUST rely on **JSON stdout** (standard kit pattern). If a future human **table** mode exists, it MUST be opt-in (e.g. **`--format table`**) and MUST NOT be the default for **`pnpm exec wk run`** from scripts.

## Global response envelope

Every command prints **one JSON document** to stdout (same contract as other kit `run` commands):

| Field | Type | Notes |
| --- | --- | --- |
| **`ok`** | boolean | **`true`** on success. |
| **`code`** | string | Stable machine id (see per-command table). |
| **`message`** | string | Optional human hint; do not parse for automation. |
| **`data`** | object | Present when **`ok`** is **`true`**; shape per **`cli-read-only-data.v1.json`** `$defs`. |
| **`remediation`** | object | On structured failures, optional hints (**`instructionPath`**, **`docPath`**) per CLI remediation ADR. |

**Exit status:** **`0`** when **`ok: true`**; **non-zero** when **`ok: false`** (align with existing **`runCli`** behavior).

## Pagination (list commands)

| Field | Meaning |
| --- | --- |
| **`limit`** | Optional; default **50**, max **200**. |
| **`cursor`** | Opaque string (**≤256** chars); **`null`** / omitted **`nextCursor`** means end of list. |

## Naming decision record

| Option | Verdict |
| --- | --- |
| **`cae-*`** | **Chosen** — matches **`kit.cae.*`** config and is short for copy-paste. |
| **`context-activation-*`** | Rejected for `run` names (too long); still used as **module id**. |
| **Module-prefixed only** (no short alias) | Rejected — agent ergonomics. |

## `operationId` column

Use **`context-activation.<cae-verb>`** (dotted segments mirroring `run` names) in **`policyOperationId`** / telemetry / **`--schema-only`** pilot metadata.

## Command reference

### Registry inspection (**`T861`**, **`T868`**)

| `run` name | `operationId` | Purpose | Success `code` |
| --- | --- | --- | --- |
| **`cae-registry-validate`** | `context-activation.cae-registry-validate` | Fail fast if registry / activations JSON cannot load (**PR gate**). | `cae-registry-validate-ok` |
| **`cae-list-artifacts`** | `context-activation.cae-list-artifacts` | Page through **artifact ids** (optional type filter). | `cae-list-artifacts-ok` |
| **`cae-get-artifact`** | `context-activation.cae-get-artifact` | Fetch one **registry entry** (`registry-entry.v1`). | `cae-get-artifact-ok` |
| **`cae-list-activations`** | `context-activation.cae-list-activations` | Page through **activation ids** (optional family / lifecycle filter). | `cae-list-activations-ok` |
| **`cae-get-activation`** | `context-activation.cae-get-activation` | Fetch one **activation definition** (`activation-definition.schema.json`). | `cae-get-activation-ok` |

**Argv schema:** **`#/$defs/caeListArtifactsRequest`**, **`caeGetArtifactRequest`**, **`caeListActivationsRequest`**, **`caeGetActivationRequest`**.

**`data` schema:** **`#/$defs/caeListArtifactsData`**, **`caeGetArtifactData`**, **`caeListActivationsData`**, **`caeGetActivationData`**.

### Evaluation surface (**`T862`**)

| `run` name | `operationId` | Purpose | Success `code` |
| --- | --- | --- | --- |
| **`cae-evaluate`** | `context-activation.cae-evaluate` | Compute **`effective-activation-bundle`** + **`trace`** + **`traceId`**. | `cae-evaluate-ok` |
| **`cae-explain`** | `context-activation.cae-explain` | Produce **`explain-response.v1`** from **`traceId`** **or** inline **`evaluationContext`** replay. | `cae-explain-ok` |
| **`cae-health`** | `context-activation.cae-health` | **`kit.cae.enabled`**, registry load state, optional last-eval timestamp, **`issues[]`**. | `cae-health-ok` |
| **`cae-conflicts`** | `context-activation.cae-conflicts` | Run merge/conflict analysis; return **`conflictShadowSummary`** + correlation **`traceId`**. | `cae-conflicts-ok` |
| **`cae-get-trace`** | `context-activation.cae-get-trace` | Fetch **`trace.v1`** by id (session or persisted **T867**). | `cae-get-trace-ok` |
| **`cae-list-acks`** | `context-activation.cae-list-acks` | List persisted CAE acknowledgement satisfaction rows by trace or activation. | `cae-list-acks-ok` |
| **`cae-shadow-feedback-report`** | `context-activation.cae-shadow-feedback-report` | Summarize recorded shadow usefulness feedback for activation curation. | `cae-shadow-feedback-report-ok` |

**Argv schema:** **`caeEvaluateRequest`**, **`caeExplainRequest`** (**oneOf** trace vs replay), **`caeHealthRequest`**, **`caeConflictsRequest`**, **`caeGetTraceRequest`**, **`caeListAcksRequest`**. Shadow feedback report currently follows its instruction file shape.

**`data` schema:** **`caeEvaluateData`**, **`caeExplainData`**, **`caeHealthData`**, **`caeConflictsData`**, **`caeGetTraceData`**, **`caeListAcksData`**. Shadow feedback report currently follows its instruction file shape.

### `cae-explain` inputs (normative)

Exactly one path:

1. **`traceId`** — use session/store trace (**`caeExplainByTraceRequest`**).
2. **`evaluationContext`** — re-run evaluation for explanation only (**`caeExplainByReplayRequest`**); optional **`evalMode`**, **`level`**.

## `data.schemaVersion`

Every success **`data`** object includes **`schemaVersion`: `1`** so agents can branch without guessing bundle/trace/explain versions.

## Agent CLI map coverage (**`pnpm run check`**)

**`scripts/check-agent-cli-map-coverage.mjs`** compares **`src/contracts/builtin-run-command-manifest.json`** to **`docs/maintainers/AGENT-CLI-MAP.md`** and **`docs/maintainers/data/agent-cli-map-exclusions.json`**.

When **`T861` / `T862`** register a **`cae-*`** row in the manifest:

1. Add a **`workspace-kit run <name> '<json>'`** (or **`pnpm exec wk run`**) line to **`docs/maintainers/AGENT-CLI-MAP.md`** **or**
2. Add **`excludedRunCommands`** with a **rationale string** in **`agent-cli-map-exclusions.json`** (only for internal-only / non-agent commands — **not** the default for CAE read-only).

Until handlers ship, these names are **contract-only** and **absent** from the manifest — **no check failure**.

## Cross-references

- **`.ai/cae/trace-and-explain.md`** (**`T846`**) — trace / explain payloads.
- **`schemas/cae/evaluation-context.v1.json`** (**`T842`**) — evaluate / conflicts / replay argv.
- **`schemas/cae/effective-activation-bundle.v1.json`** (**`T843`**) — evaluate output.
- **`src/modules/*/instructions/*.md`** — per-command machine docs (**`T861` / `T862`**).
