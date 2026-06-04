<!--
agentCapsule|v=1|command=phase-release-state|module=task-engine|schema_only=pnpm exec wk run phase-release-state --schema-only '{}'
-->

# phase-release-state

```bash
pnpm exec wk run phase-release-state '{"phaseKey":"131"}'
```

Builds a compact pre-release readiness packet for a phase after task drain and before release artifact preparation.

The packet returns `packetKind:"phaseReleaseState"`, `canProceedToRelease`, explicit `publishSafety`, bounded `missingRequirements[]`, and exact follow-up refs. Use it after phase tasks are terminal and before `prepare-release-artifacts` / final `release-closeout-result`.

Read-only. `phaseKey` is optional and defaults through the same canonical workspace phase path as other phase readouts.
