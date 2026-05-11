<!--
agentCapsule|v=1|command=list-phase-catalog|module=task-engine|schema_only=pnpm exec wk run list-phase-catalog --schema-only '{}'
-->

# list-phase-catalog

Read-only: returns **`phases`** (ordered) with **`phaseKey`**, optional **`shortDescription`**, and **`inCatalog`** (whether the row exists in **`kit_phase_catalog`** vs inferred from **`kit_workspace_status`** current/next keys only).

Requires planning SQLite **user_version ≥ 23** (table created on first migrate after upgrade). When older, **`supported`** is **`false`** and **`phases`** may be empty.

## Usage

```
pnpm exec wk run list-phase-catalog '{}'
```
