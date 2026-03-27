---
quicktaskVersion: 1
taskName: generate_doc
---
# generate_doc

- Goal: 1. Consider the document you are generating and pull in other documentation you will need for context. 2. Find the best practices for sections, ordering, section titles, formatting, and table of contents for this particular type of document. 3. Implement these best practices by stubing out the document title, table of contents, section headers, subheaders, etc. 4. Find best practices for writing style, tone, formatting, emoji usage, etc. 5. Implement those best practices and generate the document contents. 6. Review the document and find the largest weaknesses. 7. Continuing to use the appropriate best practices, make the needed corrections.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** If generating canonical maintainer/AI docs with the kit, run `workspace-kit run generate-document` or `workspace-kit run document-project` with JSON (and `policyApproval` when not `dryRun`) — see `docs/maintainers/AGENT-CLI-MAP.md`. This `/qt` template alone does **not** invoke the CLI.