# interview-behavior-profile

Stateful interview; session file under `.workspace-kit/agent-behavior/interview-session.json`.

**Planning store:** This command does **not** read or write task-engine planning generation / SQLite task rows — only the JSON session file and (on `finalize` + `apply`) behavior profiles. No `expectedPlanningGeneration` token.

```bash
workspace-kit run interview-behavior-profile '{"action":"status"}'
workspace-kit run interview-behavior-profile '{"action":"start"}'
workspace-kit run interview-behavior-profile '{"action":"start","forceRestart":true}'
workspace-kit run interview-behavior-profile '{"action":"answer","value":"balanced"}'
workspace-kit run interview-behavior-profile '{"action":"back"}'
workspace-kit run interview-behavior-profile '{"action":"finalize","apply":true}'
workspace-kit run interview-behavior-profile '{"action":"finalize","customId":"custom:from-interview","label":"My profile","apply":true}'
workspace-kit run interview-behavior-profile '{"action":"discard"}'
```

- **`status`** — Read-only: `data.active`, current `stepIndex`, `question`, `answers`, `complete`.
- **`start`** — Fails with `behavior-interview-session-exists` if a session file already exists (in progress or complete-but-not-finalized). Use **`discard`** first or pass **`forceRestart":true`** to wipe and begin at step 0.
- **`finalize`** — Omit **`customId`** to auto-pick the first free id in order `custom:chat-behavior-interview`, `custom:chat-behavior-interview-2`, … Default **`label`** for that path is **`Scribe's profile`**. With an explicit **`customId`**, default label is **`Interview profile`** if **`label`** is omitted.
- **`apply:true`** — Creates the custom profile and sets it active, then clears the session.
