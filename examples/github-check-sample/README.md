# Sample: GitHub Check (read-only kit health)

**Experimental.** Run **`doctor`** (or **`queue-health`**) in CI with a checked-out repo. Use a fine-scoped token only if your workflow must clone private deps — default sample uses **no** secrets.

## Security checklist

- Do not echo **`policyApproval`** or workspace paths into public logs.
- Redact **`.workspace-kit/**`** contents from artifacts uploaded to public forks.
- Treat check output as **signals**, not proof of maintainer task completion.

## Workflow

See **`workflow.yml`** — copy into `.github/workflows/` in a fork and adjust `working-directory` if needed.
