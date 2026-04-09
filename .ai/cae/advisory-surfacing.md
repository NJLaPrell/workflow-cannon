# CAE advisory activation surfacing (design)

**Task:** **`T850`**. **Implementation:** **`T865`** (payload wiring). **Runtime integration:** **`.ai/cae/runtime-integration.md`** (**`T849`**). **Agent instruction surface:** **`src/core/agent-instruction-surface.ts`**, **`buildAgentInstructionSurface`** (**`src/core/agent-instruction-surface.ts`**).

## Problem

CAE outputs (effective bundle summaries, trace ids, shadow observations) must reach agents **without** being mistaken for **`ModuleActivationReport`** (module enablement) or **enforcement** outcomes. Naming and placement need a dedicated **namespace**.

## Proposed payload shape (after)

`AgentInstructionSurfacePayload` gains an optional sibling (names TBD in **T865** — here we fix semantics):

```json
{
  "schemaVersion": 1,
  "commands": [],
  "cae": {
    "schemaVersion": 1,
    "advisory": true,
    "traceId": "cae.trace.example",
    "summary": {
      "policyCount": 1,
      "doCount": 1,
      "thinkCount": 0,
      "reviewCount": 0,
      "shadow": false
    },
    "issues": []
  }
}
```

- **`cae.advisory`:** always **`true`** on this path until enforcement ships (**`T866`**); enforcement never reuses this block for **block** decisions.
- **`cae.traceId`:** optional; correlates with **`schemas/cae/trace.v1.json`** when trace is emitted.
- **`cae.summary`:** bounded counts / flags only — **not** full activation bodies (registry references only at runtime).

## Before (excerpt)

Today the surface is dominated by module command catalog rows — no CAE block:

```json
{
  "schemaVersion": 1,
  "commands": [{ "name": "list-tasks", "moduleId": "task-engine" }]
}
```

## Placement options (decision record)

| Surface | Verdict |
| --- | --- |
| **`doctor --agent-instruction-surface`** | **Yes (optional)** — behind **`kit.cae.advisoryInstructionSurface`** (or equivalent) so doctor stays quiet when CAE disabled. |
| **`buildAgentInstructionSurface` JSON** | **Yes** — primary agent-facing path for IDE/extensions consuming the same payload as doctor. |
| **Dedicated `wk run cae-*` only** | **No** — insufficient; agents must see CAE beside the instruction catalog they already fetch. |
| **stderr-only** | **No** — breaks JSON-only automation; stderr may duplicate **diagnostics** only. |

## Size budget

- **Default cap:** **4 KiB** for the entire **`cae`** object once JSON-stringified (configurable downward, not upward without ADR).
- **Truncation:** drop **`issues[]`** tail first (oldest first), then shorten **`summary`** strings with explicit **`truncated: true`** flag inside **`cae`** (field added in **T865**).
- **Never** embed full **`effective-activation-bundle`** or raw trace **events** here — use **`traceId`** + **`cae-explain`** (**`T862`**).

## Naming: avoid collision with `activationReport`

- **Do not** overload **`activationReport`** / **`ModuleActivationReport`** for CAE.
- **Use** top-level **`cae`** (or **`contextActivation`** if bikeshedded) — **never** `moduleActivation` / `activationReport` for CAE.

## Extension field for **`AGENT-CLI-MAP.md`**

Agents documenting payloads should reference:

- **`.ai/cae/advisory-surfacing.md`** (this file) — semantics.
- **`.ai/cae/cli-read-only.md`** — read-only **`cae-*`** commands.

## Kill-switch / feature flags (env)

- Prefer **config** keys under **`kit.cae.*`** (effective config) — not ad-hoc env, except **`WORKSPACE_KIT_*`** patterns already used for CLI diagnostics.
- Proposed: **`kit.cae.enabled`**, **`kit.cae.advisoryInstructionSurface`**, **`kit.cae.shadowMode`** — exact defaults in **`T847`/`T848`** implementation.

## Advisory vs enforcement

| Path | May block work? |
| --- | --- |
| **Advisory (`cae` on instruction surface)** | **No** — hints only. |
| **Enforcement (`T866`)** | **Yes** — allowlisted commands only; separate **`ok: false`** contract on **`wk run`**. |

Normative failure behavior: **`.ai/cae/failure-recovery.md`** (**`T853`**).
