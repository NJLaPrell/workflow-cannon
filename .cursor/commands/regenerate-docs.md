---
description: Regenerate maintainer docs via the documentation module (document-project / generate-document)
---

The user invoked **`/regenerate-docs`**. Follow **`src/modules/documentation/RULES.md`** precedence before writing anything.

**Batch (typical after touching multiple templates or `.ai` keyed sources):**

`pnpm run wk run document-project '{}'`

**Single document type** (when the user names one type only, e.g. after editing one view/template pair):

`pnpm run wk run generate-document '{"documentType":"<basename>","options":{}}'`

Use **`documentType`** values from **`src/modules/documentation/instructions/generate-document.md`** (e.g. **`README.md`**, **`ROADMAP.md`**, **`AGENTS.md`**, runbooks under **`runbooks/...`**). Honor user intent on **`dryRun`**, **`overwriteAi`**, **`overwriteHuman`**, and **`strict`** flags via the JSON **`options`** object when they ask.

Parse stdout JSON: list paths written, skipped, or failed, and any validation warnings. Do not claim files changed without matching CLI output.
