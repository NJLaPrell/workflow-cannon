# CAE evaluation context contract (v1)

**Task:** **`T842`**. **Normative schema:** **`schemas/cae/evaluation-context.v1.json`**. **Builder implementation:** **`T859`**.

CAE evaluation MUST receive **typed, bounded** slices — no repo-wide JSON dump, no raw SQLite rows, no full filesystem paths in payloads.

## Field reference

| Field path | Type | Source of truth | Required | Redaction / notes |
| --- | --- | --- | --- | --- |
| `schemaVersion` | `1` const | Caller | yes | — |
| `task.taskId` | `T###` string | Task engine `get-task` / queue row | yes | Public id only. |
| `task.status` | lifecycle enum | Task engine | yes | Same strings as store. |
| `task.phaseKey` | numeric string | Task `phaseKey` | yes | No free-text phase names in v1. |
| `task.title` | string ≤512 | Task row | no | Truncate in builder if oversized. |
| `task.tags` | string[] | Task `metadata.tags` if present | no | Cap length per schema. |
| `task.features` | string[] | Task `features` | no | Taxonomy slugs only. |
| `task.metadata.*` | see schema | Task `metadata` **allowlist** only | no | **Reject** unknown keys at build time; never pass full `metadata` blob. |
| `command.name` | string | Router / argv (`wk run <name>`) | yes | Module command name or synthetic `__idle__` when N/A (T859). |
| `command.moduleId` | string | Module router resolution | no | Omit when unknown. |
| `command.argvSummary` | string ≤512 | Derived from argv | no | **Never** embed raw argv array or full policy JSON. |
| `workspace.currentKitPhase` | string | `kit_workspace_status` / `get-workspace-status` | yes | Digits only. |
| `workspace.nextKitPhase` | string \| null | same | no | — |
| `workspace.workspaceRootFingerprint` | string | Hash of resolved workspace root | no | **Never** put absolute `workspaceRoot` in context. |
| `governance.policyApprovalRequired` | boolean | Effective policy for command (`policy.ts` / manifest) | yes | Builder derives from shipped sensitivity. |
| `governance.approvalTierHint` | `none` \| `A` \| `B` \| `C` | **`.ai/AGENT-CLI-MAP.md`** tier ladder | yes | Hint only; enforcement stays in code. |
| `governance.policySurface` | short string | **`.ai/POLICY-APPROVAL.md`** | no | e.g. `run-json`. |
| `queue.readyQueueDepth` | integer | `list-tasks` ready count or dashboard | yes | Bounded integer. |
| `queue.suggestedNextTaskId` | `T###` \| null | `get-next-actions` | no | — |
| `mapSignals` | `null` | Reserved | no | v1 MUST be **`null`**; forward contract **`.ai/cae/future-cognitive-maps.md`** (**`T856`**). |

## Canonical serialization for hashing (`bundleId` / `traceId`)

For deterministic hashes over context payloads, implementations MUST use **JCS (RFC 8785)** JSON Canonicalization Scheme **or** an equivalent **recursive lexicographic key sort** with UTF-8 encoding and no insignificant whitespace — pick one per codebase and document in **`T860`**. Same algorithm MUST feed **`bundleId`** and trace correlation inputs.

## Governance sources

v1 pulls governance hints from **effective workspace-kit policy** + **`.ai/POLICY-APPROVAL.md`** / **`.ai/machine-cli-policy.md`**. Module **manifest** sensitivity contributes to `policyApprovalRequired` / tier hints; no duplicate policy prose in context.

## Non-compliant examples (do not emit)

- Entire `dashboard-summary` JSON pasted under `task`.
- Raw `process.env` or secrets.
- Unbounded `metadata` object with arbitrary keys.
- `command.argv` as nested array mirroring CLI input.
- Opaque `workflowState: { ... }` blob.

See **`fixtures/cae/evaluation-context/invalid/`** for schema-level rejects.
