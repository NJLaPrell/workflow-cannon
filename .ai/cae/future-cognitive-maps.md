# Future cognitive-map integration contract (non-binding v1)

**Task:** **`T856`**. **Status:** Forward-looking only — **no v1 runtime dependency**. **Registry ADR:** **`ADR-cae-artifact-registry-v1.md`** (**reserved `cognitive-map`**). **Evaluation context:** **`schemas/cae/evaluation-context.v1.json`** (**`mapSignals`**).

## Field names (locked for forward work)

| Field | Location | v1 rule |
| --- | --- | --- |
| **`mapSignals`** | `evaluation-context` root | **`null` only** in v1 schema (reserved object shape in **`schemaVersion: 2+`**). |
| **`artifactType: cognitive-map`** | registry entry | **Illegal** in v1 enum — validation **fails** (see ADR). |
| **Think → map link** | activation **`artifactRefs[].artifactId`** | v1 uses **normal artifact ids** only; future maps are **just another artifact id** once type is allowed — **no separate edge type** in v1. |

## `schemaVersion` bump strategy

1. **`evaluation-context` `schemaVersion: 2`** — introduce optional structured **`mapSignals`** (shape TBD) while keeping **`1`** rows valid for migration window.
2. **`registry-entry` / activation-definition` `schemaVersion` bumps** — only when map payloads require new required fields; until then, **reject** `cognitive-map` rows at validation.
3. **Kit SQLite / migrations** — follow **`ADR-cae-persistence-v1.md`**; no map-specific tables in v1.

## Validator behavior (must match **`T839`**)

- **Registry JSON** claiming **`artifactType: cognitive-map`** → **fails** `registry-entry.v1.json`.
- **Evaluation context** with **`mapSignals` ≠ `null`** in v1 → **fails** schema (const / type enforcement).
- **Loaders** MUST NOT require cognitive-map files to exist for CAE to run (**`T840`/`T842` implementable without maps**).

## Example context (v1 compliant)

```json
{
  "schemaVersion": 1,
  "task": { "taskId": "T856", "status": "ready", "phaseKey": "70" },
  "command": { "name": "get-next-actions" },
  "workspace": { "currentKitPhase": "70" },
  "governance": {
    "policyApprovalRequired": false,
    "approvalTierHint": "C"
  },
  "queue": { "readyQueueDepth": 0 },
  "mapSignals": null
}
```

## Non-goals (v1)

- Shipping map assets, parsers, or graph engines.
- Importing this module from **`src/cli.ts`** hot path.

## Cross-references

- **`tasks/cae/CAE-PROGRAM-CONTEXT.md`**
- **`.ai/cae/evaluation-context.md`** (**`T842`**)
