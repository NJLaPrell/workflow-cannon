# Documentation Module Config

Defines module-level configuration keys used by the documentation module.

- `sources.aiRoot`: canonical AI docs root (default: `/.ai`)
- `sources.humanRoot`: human docs root (default: `docs/maintainers`)
- `sources.templatesRoot`: document template root (default: `src/modules/documentation/templates`)
- `sources.instructionsRoot`: instruction root (default: `src/modules/documentation/instructions`)
- `sources.schemasRoot`: schema root (default: `src/modules/documentation/schemas`)
- `generation.enforceParity`: fail generation when AI and human surfaces diverge
- `generation.enforceSectionCoverage`: fail when expected template sections are missing in output
- `generation.resolveOrRetryOnValidationError`: auto-resolve issues or retry generation before returning failure
- `generation.maxValidationAttempts`: maximum validate/retry attempts (default: `3`)
- `generation.allowTemplatelessFallback`: when template is missing, require user confirmation before continuing
