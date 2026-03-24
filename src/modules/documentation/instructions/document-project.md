# document-project

Generate project documentation for both canonical AI and human-readable surfaces.

## Inputs

- Requested documentation target(s)
- Project context from `.ai/PRINCIPLES.md`, `docs/maintainers/TASKS.md`, and `README.md`

## Required behavior

1. Read source-of-truth docs in precedence order.
2. Generate or update AI-optimized docs under `/.ai`.
3. Generate or update human-readable docs under `/docs`.
4. Ensure both surfaces reflect the same decisions and constraints.
5. Emit a concise evidence summary of changed files and validation results.
