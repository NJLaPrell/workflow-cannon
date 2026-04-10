# CAE stable error codes (loader & runtime)

**Task:** **`T858`** (loader). **Broader matrix:** **`.ai/cae/failure-recovery.md`** (**`T853`**).

| Code | Source | Meaning |
| --- | --- | --- |
| **`cae-registry-read-error`** | `loadCaeRegistry` | Missing or unreadable registry file. |
| **`cae-registry-invalid-json`** | `loadCaeRegistry` | File is not valid JSON. |
| **`cae-registry-schema-invalid`** | `loadCaeRegistry` | Envelope shape, duplicate **`artifactId`**, or row fails **`registry-entry.v1.json`**; unknown **`artifactId`** referenced from an activation. |
| **`cae-activations-schema-invalid`** | `loadCaeRegistry` | Envelope shape, duplicate **`activationId`**, or row fails **`activation-definition.schema.json`**. |
| **`cae-artifact-missing`** | `loadCaeRegistry` | **`ref.path`** missing on disk (when path verification enabled). |
| **`cae-ack-not-applicable`** | `cae-satisfy-ack` | Activation row has no **`acknowledgement.token`** (use git+PR to add one). |
| **`cae-ack-token-mismatch`** | `cae-satisfy-ack` | **`ackToken`** argv ≠ registry **`acknowledgement.token`**. |

Remediation: fix paths under **`.ai/cae/registry/`**, re-run **`pnpm run check`**, then **`cae-health`** when shipped (**`T862`**).
