---
description: Agent collaboration style — onboarding, behavior interview, and CLI profiles
---

The user invoked **`/collaboration-profiles`**. Summarize how this repo tunes **advisory** collaboration (tone, depth, handoff style) **without** replacing **`policyApproval`** JSON or approval gates for gated **`wk run`** commands.

**Cursor chat playbooks (numbered, transcript-shaped):**

- **`/onboarding`** — **`.cursor/commands/onboarding.md`** → **`docs/maintainers/playbooks/workspace-kit-chat-onboarding.md`**
- **`/behavior-interview`** — **`.cursor/commands/behavior-interview.md`** → **`docs/maintainers/playbooks/workspace-kit-chat-behavior-interview.md`**

**CLI (source of truth for persisted profiles):** use **`pnpm run wk run`** with the **agent-behavior** module commands (discover exact names via **`pnpm run wk run`** with no subcommand). Follow **`src/modules/agent-behavior/README.md`** and **`.ai/AGENT-CLI-MAP.md`** for tiers and JSON shapes.

If the user wants to **change** saved guidance, run the matching **`wk run`** mutators with required **`policyApproval`** when the CLI map says so — chat-only approval is not enough for sensitive lanes.
