# interview-behavior-profile

Stateful interview; session file under `.workspace-kit/agent-behavior/interview-session.json`.

```bash
workspace-kit run interview-behavior-profile '{"action":"start"}'
workspace-kit run interview-behavior-profile '{"action":"answer","value":"balanced"}'
workspace-kit run interview-behavior-profile '{"action":"back"}'
workspace-kit run interview-behavior-profile '{"action":"finalize","customId":"custom:from-interview","label":"My profile","apply":true}'
workspace-kit run interview-behavior-profile '{"action":"discard"}'
```

`apply:true` creates the custom profile and sets it active.
