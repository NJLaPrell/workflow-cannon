---
quicktaskVersion: 1
taskName: generate_doc
---

> **`/qt` is not `workspace-kit`:** This template is editor-only. It never satisfies JSON **`policyApproval`**. To change task-engine or other kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# generate_doc

- Goal: 1. Consider the document you are generating and pull in other documentation you will need for context. 2. Find the best practices for sections, ordering, section titles, formatting, and table of contents for this particular type of document. 3. Implement these best practices by stubing out the document title, table of contents, section headers, subheaders, etc. 4. Find best practices for writing style, tone, formatting, emoji usage, etc. 5. Implement those best practices and generate the document contents. 6. Review the document and find the largest weaknesses. 7. Continuing to use the appropriate best practices, make the needed corrections.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** If generating canonical maintainer/AI docs with the kit, run an explicit command (this `/qt` template alone does **not** invoke the CLI):

```bash
# Non-sensitive dry run
workspace-kit run generate-document '{"documentType":"ROADMAP.md","options":{"dryRun":true}}'

# Sensitive write (requires JSON policyApproval on run path)
workspace-kit run document-project '{"options":{"overwriteHuman":true},"policyApproval":{"confirmed":true,"rationale":"regenerate docs after source update"}}'
```

See `docs/maintainers/AGENT-CLI-MAP.md` for tiering and additional command examples.