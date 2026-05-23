# Webview styleguide (CAE pointer)

**Canonical rules:** [.github/instructions/cursor-workflow-cannon-ui.instructions.md](../../../.github/instructions/cursor-workflow-cannon-ui.instructions.md)

That file is the single source of truth for webview UX in the `cursor-workflow-cannon` extension. It is auto-attached to agent context whenever a file under `extensions/cursor-workflow-cannon/src/views/` is opened or edited (via its `applyTo` glob).

This CAE pointer exists so the same ruleset surfaces through **think / do / review** activations when an agent is working a task tagged for dashboard, webview, drawer, or `cursor-extension` UX work — even before any view file is opened.

## When CAE surfaces this artifact

Agents working any of the following will see this artifact in their effective activation bundle:

- A task whose `metadata.tags` contains any of: `dashboard`, `webview`, `drawer`, `dashboard-ux`, `ux-consistency`, `styleguide`.
- A task whose `features` contains `cursor-extension`.
- A `wk run` command operating on extension UI work (paired with the above task tags).

## Rules (do not duplicate here)

Read the rule index (R1–R18) at the top of the canonical file. Cite rules by ID (`R3.2`, `R8.4`, `R17.2`, `R18.4`, etc.) in commit messages and PR reviews.

## Mutation policy

Do **not** edit this pointer to add styleguide rules. If a rule needs to change:

1. Edit [.github/instructions/cursor-workflow-cannon-ui.instructions.md](../../../.github/instructions/cursor-workflow-cannon-ui.instructions.md) (canonical).
2. Bump the rule index if rule IDs shift.
3. Leave this pointer untouched unless the canonical file's path changes.
