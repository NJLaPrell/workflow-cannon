## What's New in 1.0.9

This release focuses on **Agent Bug Reporting** (Phase 148).

### Highlights

- Registers an agent-bug-reporting WorkflowModule scaffold so agents can later file evidence-backed bug reports through the kit.
- Agents can file rich proposed improvements via Tier C `file-bug-report` without interactive policyApproval.
- Adds the `wc-bug-report` skill pack: fire-and-forget parent spawn contract, structured handoff schema, and cheap composer-2.5 child filing with CLI fallback.
- Seed `wc-bug-reporter` subagent definition and host-agnostic spawn adapters (Cursor + CLI implemented; Antigravity/VS Code Copilot stubs).
- Advisory CAE do activations nudge spawn wc-bug-reporter / file-bug-report on WC failure and agent friction without ready/release powers.
- Empty/first-run test coverage and documented module-disable fallback so filing can be toggled off without breaking agents.

---

_Technical changelog: [`docs/maintainers/CHANGELOG.md`](docs/maintainers/CHANGELOG.md)_
