# ADR: `.ai/` canonical maintainer/process docs → generated `docs/maintainers/`

## Status

Accepted — Phase 56 (`T654`–`T661`), release **`v0.56.0`**.

## Context

The repository serves **both** humans and **agents**. Agents already prefer repo-root **`.ai/`** (machine-oriented markdown). Maintainer playbooks, runbooks, and workbooks historically lived under **`docs/maintainers/`** with ambiguous “edit human first” guidance, creating **drift** and conflicting source-of-truth stories.

## Decision

1. **Single direction** — For paths listed in **`docs/maintainers/data/ai-to-docs-coverage.json`**, **`.ai/` sources are canonical**. Matching files under **`docs/maintainers/`** are **generated output** only. **Do not** hand-edit generated outputs except by running the generator after editing **`.ai/`**.

2. **Exception manifest** — **`docs/maintainers/data/docs-from-ai-exceptions.yaml`** lists **`docs/`** paths (or glob prefixes) that **are not** produced from **`.ai/`** (data-driven docs, ADRs, changelog, plans, etc.). The drift gate **ignores** those paths.

3. **Generator** — **`scripts/generate-maintainer-docs-from-ai.mjs`** reads the coverage map and writes human renders with a **banner** pointing back to the canonical **`.ai/`** path.

4. **CI** — **`pnpm run check`** runs **`scripts/check-ai-to-docs-drift.mjs`** (regenerate + diff) and **`scripts/check-orphan-ai-sources.mjs`** (covered trees must map every `*.md`).

5. **Non-goals (v1)** — Bidirectional sync; generating **`.cursor/rules/*.mdc`**; generating module **`instructions/*.md`** (still **`src/modules/**`** truth).

## Consequences

- Maintainer workflow: **edit `.ai/` → `pnpm run generate-maintainer-docs-from-ai` → commit sources + generated `docs/` together** (or rely on CI to fail until you do).  
- **`docs/maintainers/module-build-guide.md`** workbook guidance: for covered workbooks, edit **`.ai/workbooks/`** only.

## References

- Plan: **`docs/maintainers/plans/ai-canonical-docs-mirror-pipeline.md`**  
- Coverage map: **`docs/maintainers/data/ai-to-docs-coverage.json`**  
- Exceptions: **`docs/maintainers/data/docs-from-ai-exceptions.yaml`**
