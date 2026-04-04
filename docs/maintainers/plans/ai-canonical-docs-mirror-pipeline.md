# Plan: `.ai/` → `docs/` doc pipeline (single direction)

**Status:** Draft (convert to `T###` when slotted)  
**North star:** **Source of truth is only `.ai/`**, in a consistent **AI-optimized structure**. Human-readable files under `docs/maintainers/` (and any other in-scope `docs/` paths) are **always generated from `.ai/`** — never the other way around. Maintainers do not hand-edit generated `docs/` for covered paths; they edit `.ai/` and run the generator. **Module command truth** stays `src/modules/*/instructions/*.md` unless a later phase explicitly generates those from `.ai/` too.

## Pipeline (non-negotiable)

```
.ai/<agent-optimized sources>  →  generator  →  docs/<human-readable outputs>
```

- **One direction only.** There is no “sync back” from `docs/` into `.ai/`.
- **CI** regenerates from `.ai/` and **fails** if `git diff` shows stale or hand-edited human outputs for in-scope paths.

## Context

Today the repo mixes models:

- **Workbooks:** maintainer prose in `docs/maintainers/workbooks/` pairs with `.ai/workbooks/`; `module-build-guide.md` still says **human first, then sync `.ai/`** — **wrong** for this plan; migration flips to **`.ai/` only**.
- **Runbooks:** many human files under `docs/maintainers/runbooks/`; few `.ai/runbooks/` sources — migration means **moving canonical text into `.ai/`** and treating current `docs/` copies as **outputs** once the generator exists.
- **Playbooks:** long checklists under `docs/maintainers/playbooks/`; agents use `.ai/MACHINE-PLAYBOOKS.md` — target is **canonical machine sources under `.ai/`** (per playbook or structured bundle) **generating** maintainer playbooks.
- **Exercises:** e.g. `docs/exercises/` — out of scope by default unless you add an `.ai/` source and generate into `docs/exercises/`.
- **Orphan instructions:** `scripts/check-orphan-instructions.mjs` already guards `src/modules/*/instructions/*.md`.

## Definitions

| Term | Meaning |
| --- | --- |
| **Agent-optimized source** | Canonical markdown (or agreed structured format) under `.ai/` — schema defined in Phase 1. |
| **Human render** | Generated markdown under `docs/`; **not** edited by hand for in-scope paths. |
| **Exception manifest** | Versioned list of **`docs/` paths** (or glob patterns) that are **not** produced from `.ai/` (one-offs, legacy, data-driven docs like `ROADMAP.md` from JSON, etc.). Each row: **path**, **reason**, **owner**, optional **reviewBy**. |
| **Coverage set** | The set of **`.ai/` source paths** (or logical doc ids) that **must** map to generated `docs/` outputs; anything not exempt on the `docs/` side must be the result of generation from some `.ai/` source. |

## Non-goals (initial phases)

- **Bidirectional** sync or “human edits `docs`, then update `.ai`.”
- Rewriting **all** root `README.md` / marketing copy through this pipeline unless added to coverage.
- Deleting **Cursor rules** (`.cursor/rules/*.mdc`); thin pointers until you optionally generate them later.
- **JSON/data-driven docs** (`roadmap-data.json` → `ROADMAP.md`, config metadata → `CONFIG.md`, etc.) remain **separate pipelines**; list them in the **exception manifest** so the **`.ai` → `docs`** drift check does not treat them as `.ai`-sourced.

## Phase 0 — Inventory and policy lock

**Outcome:** Coverage + exceptions are explicit; ADR locks single direction.

1. **Enumerate** `.ai/**`, `docs/maintainers/**`, `docs/exercises/**`, `src/modules/*/instructions/**`.
2. **Exception manifest** — suggested `docs/maintainers/data/docs-from-ai-exceptions.yaml`: every **`docs/`** path that will **not** be generated from `.ai/` (with reason/owner).
3. **Coverage set** — list **`.ai/`** roots or globs that participate in `.ai` → `docs` (e.g. `.ai/workbooks/*.md` → `docs/maintainers/workbooks/*.md`).
4. **ADR (one paragraph):** **Canonical maintainer/process prose for agents lives in `.ai/`; matching `docs/` files are generated outputs. Editing human files for covered paths is forbidden except via regenerating from `.ai/`.**

**Task-friendly exit:** Manifest + coverage + ADR merged.

## Phase 1 — Agent format + generator spike

**Outcome:** Proves **`.ai/` → `docs/`** on a small slice.

1. **Define** minimal **agent-optimized schema** (metadata block, sections, link rules).
2. **Pick 2–3 pilots** — e.g. one `.ai/runbooks/*`, one playbook machine file, one workbook.
3. **Implement generator** (`scripts/` or documentation module) that:
   - reads **only** `.ai/` sources,
   - writes the mapped `docs/` paths,
   - is **idempotent**.
4. **Document** maintainer workflow: edit `.ai/` → run generator → commit both if CI expects both (or commit `.ai/` only if CI generates — team choice; either way **truth is `.ai/`**).

**Task-friendly exit:** Check stage runs generator + fails on drift for pilot mappings.

## Phase 2 — Workbook, runbook, and playbook migration

**Outcome:** Canonical text lives under `.ai/`; `docs/` is output.

1. **Workbooks:** Ensure each `docs/maintainers/workbooks/*.md` in coverage is emitted from `.ai/workbooks/*`; update `module-build-guide.md` to **`.ai/` first only** (no human-canonical workbook edits).
2. **Runbooks:** For each in-scope runbook, **authoritative content in `.ai/runbooks/`** (new or moved); generator produces `docs/maintainers/runbooks/`. Legacy human-only files either migrated or added to **exception manifest**.
3. **Playbooks:** Canonical sources under `.ai/` (e.g. `.ai/playbooks/<id>.md` or structured fragments); generator produces `docs/maintainers/playbooks/*.md`. Replace hand-maintained long-form checklists as sources move.

**Task-friendly exit:** No in-scope `docs/` runbook/workbook/playbook without a declared `.ai/` source; guide text matches.

## Phase 3 — Remaining maintainer docs + pointer alignment

**Outcome:** AGENTS / TERMS / CLI map tell the truth.

1. **AGENTS.md / TERMS.md / AGENT-CLI-MAP** (human **generated** from `.ai/` where covered, or explicitly excepted): state that **agents read `.ai/`** for maintainer process content; **maintainers change `.ai/`** and regenerate `docs/` for covered paths.
2. **Data-driven `docs/`** — remain exceptions; cross-link from coverage doc so the drift check skips them deliberately.
3. **Exercises** — remain **out of coverage** unless you add `.ai/ideation/*` → `docs/exercises/*`.

**Task-friendly exit:** No doc claims “edit `docs/maintainers/workbooks` first” for covered types.

## Phase 4 — Final gates

### Gate A — Orphan instructions (keep + optional `.ai` hygiene)

1. **Keep** `scripts/check-orphan-instructions.mjs` green.
2. **Optional `check-orphan-ai-sources.mjs`:** every `.ai/**/*.md` in the **coverage set** appears in the **generation manifest** (source → output map); flag `.ai` files with no consumer or no declared output.
3. **Optional:** assert no **hand-edited** in-scope `docs/` file without running generator (same as Gate B, stricter messaging).

**Exit:** New stages wired in `run-check-stages.mjs` with clear failures.

### Gate B — Drift: generated `docs/` must match `.ai/`

1. **Implement** `scripts/check-ai-to-docs-drift.mjs` (name flexible):
   - load **coverage map** (`.ai` path → `docs` path) + **exception manifest** for `docs/` paths to ignore;
   - run **generator** from `.ai/`;
   - **`git diff --exit-code`** (or equivalent) on generated paths — **fail** if `docs/` does not match generator output.
2. **CI order:** install deps → **generate from `.ai/`** → **drift check** → rest of `check`.

**Exit:** Hand-editing in-scope `docs/` without updating `.ai/` breaks CI.

### Gate C — One-off tracking

1. Only **exception manifest** excuses a `docs/` path from the drift check; review periodically to **shrink** exceptions.
2. **CHANGELOG** when the pipeline becomes mandatory.

## Task breakdown (Phase 56 — task-engine)

| Task id | Scope |
| --- | --- |
| **T654** | Phase 0: exception manifest + coverage map + ADR |
| **T655** | Phase 1: schema + pilots + generator + CI drift for pilots (`dependsOn`: T654) |
| **T656** | Phase 2: workbooks migration + module-build-guide (`dependsOn`: T655) |
| **T657** | Phase 2: runbooks `.ai` sources + generation (`dependsOn`: T655) |
| **T658** | Phase 2: playbooks `.ai` sources + generation (`dependsOn`: T655) |
| **T659** | Phase 3: AGENTS/TERMS/CLI map (generated or aligned) (`dependsOn`: T656, T657, T658) |
| **T660** | Phase 4a: optional `.ai` orphan / manifest coverage (`dependsOn`: T659) |
| **T661** | Phase 4b: `check-ai-to-docs-drift` + CI ordering (`dependsOn`: T659) |

All are **`proposed`**, **`phaseKey` `56`**, **`type` `workspace-kit`**, **`priority` `P2`**, with `metadata.planRef` → this file.

## References

- `docs/maintainers/module-build-guide.md` — today workbook pairing (flip post-migration).
- `docs/maintainers/AGENTS.md`
- `scripts/check-orphan-instructions.mjs`
- `src/modules/documentation/RULES.md` — may extend with `ai-to-docs` generation.
- `.ai/MACHINE-PLAYBOOKS.md` — interim; target per-playbook `.ai` sources.

## Open decisions (before Phase 1 coding)

1. **Intermediate format:** pure `.ai/*.md` only vs small JSON/YAML front matter vs separate structured files — pick for maintainability; generator stays **`.ai/` → `docs/`** regardless.
2. **Commit policy:** commit **both** `.ai/` and generated `docs/` in PRs vs generate only in CI (truth still `.ai/`; policy affects reviewer workflow).
3. **Module `instructions/`:** whether they are ever generated from `.ai/` fragments — **default no** until explicitly scoped.
