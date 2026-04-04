---
description: Workflow Cannon tavern behavior interview — six numbered questions; save each answer
---

The user invoked **behavior-interview**. Follow **`docs/maintainers/playbooks/workspace-kit-chat-behavior-interview.md`** (id **`workspace-kit-chat-behavior-interview`**). Optional: **`.cursor/rules/playbook-workspace-kit-chat-behavior-interview.mdc`**.

**Match chat onboarding treatment**

1. One question per message; **no** dimension ids or `builtin:` in player copy.
2. **`action:start` once** — it **resets** the session; do not “refresh” mid-quiz.
3. After each answer: **`interview-behavior-profile`** `{"action":"answer","value":"…"}` (see playbook value map).
4. **`back`** / **`discard`** / **`apply`** / custom **`custom:slug`** + optional **`label:`** per playbook §4.
5. Close with **`get-next-actions`** smoke + **`## Behavior interview complete!`**
