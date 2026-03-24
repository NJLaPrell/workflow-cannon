# Documentation Module

Translates between canonical AI-optimized documentation and human-readable maintainership docs.

Primary responsibilities:

- maintain parity between `/.ai` and configured human docs roots (default: `docs/maintainers`)
- execute instruction-file driven documentation generation
- record deterministic documentation generation state and evidence

See `src/modules/documentation/RULES.md` for the canonical usage order and validation rules.
