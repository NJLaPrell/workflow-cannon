# CAE rollout defaults (product-shaped)

Normative config keys live under **`kit.cae`** in **`src/core/workspace-kit-config.ts`**. This note captures **intended** operator defaults by rollout stage; repos may override in layered config.

| Stage | `kit.cae.enabled` | `kit.cae.runtime.shadowPreflight` | `kit.cae.enforcement.enabled` | `kit.cae.persistence` |
| --- | --- | --- | --- | --- |
| Off (legacy) | `false` | `false` | `false` | `false` |
| Advisory / shadow pilot | `true` | `true` | `false` | `false` |
| Persistence + ack audit | `true` | `true` | `false` | `true` |
| Narrow enforcement pilot | `true` | `true` | `true` (allowlist only) | per operator |

**Principles:** keep **enforcement** off until shadow volume is trusted; turn **persistence** on before relying on **`cae-get-trace`** / **`cae-satisfy-ack`** across process restarts. See **`.ai/cae/enforcement-lane.md`** for allowlist semantics.

**Local shadow override:** operators may set env **`WORKSPACE_KIT_CAE_SHADOW=1`** to force shadow preflight on for experiments when config is off — see **`.ai/cae/shadow-mode.md`**.
