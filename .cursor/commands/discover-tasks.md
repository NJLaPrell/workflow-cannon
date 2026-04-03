---
description: Discover project task templates
---

When a user asks what maintainer task templates exist:

1. Inspect `tasks/*.md`.
2. Read `taskName` from each template frontmatter (see `templateVersion` in frontmatter).
3. List them as repository paths, e.g. `tasks/<taskName>.md` — these are **prompt-only** and do not invoke **`workspace-kit`**.
4. If no templates exist, say so and suggest adding one under `tasks/`.

