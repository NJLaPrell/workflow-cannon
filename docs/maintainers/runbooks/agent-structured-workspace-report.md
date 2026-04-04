<!-- GENERATED FROM .ai/runbooks/agent-structured-workspace-report.md — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Agent structured workspace report (guidance)

When ending a session or handing off to a maintainer, prefer a **short, reproducible** summary instead of a huge dump of absolute paths and unverified claims.

## Recommended sections

1. **Scope** — what you were asked to do (one sentence).
2. **Commands run** — exact commands (copy-paste), working directory = repo root.
3. **Files touched** — paths **relative to repository root** (e.g. `docs/maintainers/ROADMAP.md`).
4. **Task-engine pointer** — cite task **`id`** values from `.workspace-kit/tasks/state.json` when claiming status; do not infer “current phase” only from prose in old chat turns.
5. **Evidence** — links/paths to maintainer docs or runbooks you relied on.
6. **Risks / open questions** — blocking items only.

## Anti-patterns

- Listing **`/Users/...`** home paths in final reports (use relative paths in examples).
- Stating “Phase N is current” without checking **`docs/maintainers/data/workspace-kit-status.yaml`** or **`docs/maintainers/ROADMAP.md`** plus task state.
- Claiming full directory contents or file counts without a command others can rerun.

## Consistency

- **Task truth:** `.workspace-kit/tasks/state.json`
- **Phase / roadmap narrative:** `docs/maintainers/ROADMAP.md`
- **Terminology:** `docs/maintainers/TERMS.md`
