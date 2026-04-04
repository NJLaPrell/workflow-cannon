---
description: Workflow Cannon tavern onboarding — numbered role & temperament; save each step
---

The user invoked **onboarding**. Follow **`docs/maintainers/playbooks/workspace-kit-chat-onboarding.md`** (id **`workspace-kit-chat-onboarding`**). Optional: **`.cursor/rules/playbook-workspace-kit-chat-onboarding.mdc`**.

**Must match player transcript spec**

1. Welcome is only **`Welcome to the tavern!`**
2. **`## Your Role`**: numbered **1–5**; **`Adventurer (Default)`** on line 2 only; **`(Selected)`** + **`← you are here`** on the active saved tier; **`**Current:**`** only when **`usingDefaultTier`** is false. Prompt: **Reply with a role and I’ll save it and move on to Agent Temperament.**
3. **`## Agent Temperament`**: numbered **1–4** RPG names; **`(Default)`** on **The Steady Adventurer** only; **`(Selected)`** on the line matching **`effective.id`**; no “in spirit” / no **`builtin:`** in confirmations. Prompt: **Reply with a temperament and I’ll save it.**
4. **`get-next-actions`** immediately before each **`set-agent-guidance`** / **`set-active-behavior-profile`** when planning policy is **`require`**.
5. Wait after each section; optional side quest; then smoke + **`## Onboarding Complete!`**
