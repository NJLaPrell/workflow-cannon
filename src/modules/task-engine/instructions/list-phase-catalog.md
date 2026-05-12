<!--
agentCapsule|v=1|command=list-phase-catalog|module=task-engine|schema_only=pnpm exec wk run list-phase-catalog --schema-only '{}'
-->

# list-phase-catalog

Read-only: returns **`phases`** (ordered) with **`phaseKey`**, optional **`shortDescription`**, and **`inCatalog`** (whether the row exists in **`kit_phase_catalog`**). When **`inCatalog`** is **`false`**, the key is still listed if it appears on **`kit_workspace_status`** current/next and/or on **any non-archived task** (including **`completed`** and **`cancelled`**) with an inferable **`phaseKey`** or parseable **`phase`** label — no separate catalog registration is required for roster visibility.

When **`shortDescription`** is omitted in the catalog for a **future** phase (leading phase number strictly greater than workspace **`current_kit_phase`** digits), the response may include a **derived** one-line title built from the first task **`title`** values (then **`summary`**) in that phase, deterministic by task **`id`**, up to two headlines joined with **` · `** (not persisted; catalog SQL unchanged).

Requires planning SQLite **user_version ≥ 23** (table created on first migrate after upgrade). When older, **`supported`** is **`false`** and **`phases`** may be empty.

## Usage

```
pnpm exec wk run list-phase-catalog '{}'
```
