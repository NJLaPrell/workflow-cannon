# CAE runtime registry source (F1 audit)

**Task:** **T903** / **CAE_PLAN** Epic 6 F1.

## Rule

Runtime evaluation, shadow preflight, advisory instruction surface, and **`cae-*`** handlers that need a registry must resolve it via **`loadCaeRegistryForKit(workspacePath, effective)`** (see **`src/core/cae/cae-registry-effective.ts`**), so **`kit.cae.registryStore`** controls JSON vs SQLite.

## Audit (repo)

Intentional **`loadCaeRegistry(...)`** call sites (allowed):

| Area | Reason |
| --- | --- |
| **`cae-registry-effective.ts`** | JSON branch when **`registryStore === "json"`**. |
| **`cae-import-json-registry`** | Seed import from JSON files before SQLite replace. |
| **`scripts/check-cae-registry.mjs`** | CI idempotent seed from default JSON paths. |
| **Tests** | Direct JSON fixture loads. |

No remaining production path should call **`loadCaeRegistry`** for runtime evaluation while **`registryStore`** is **`sqlite`** (default).
