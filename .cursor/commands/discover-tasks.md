---
description: Discover project task templates
---

When a user asks what task commands are available:

1. Inspect `tasks/*.md`.
2. Read `taskName` from each template frontmatter.
3. Return command forms as `/qt/<taskName>`.
4. If no tasks exist, say so and suggest creating one in `tasks/`.

