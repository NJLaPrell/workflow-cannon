# Agent Presentation Policy

Workflow Cannon controls visible agent communication through a baseline `agentPresentation` config plus scoped Guidance when a workflow needs temporary presentation changes.

## Baseline

Use `agentPresentation` for workspace defaults:

- `workLog`: `off`, `minimal`, `normal`, `frequent`, or `derived`
- `rationale`: `none`, `simple`, `technical`, or `derived`
- `technicality`: `plain`, `balanced`, `technical`, or `derived`
- `finalAnswerDetail`: `concise`, `normal`, `detailed`, or `derived`

The resolver always sets `privateReasoning` to `never_disclose`. Do not create config, Guidance, docs, or UI labels that ask agents to show private reasoning.

Use config when the preference should apply to the whole workspace. Use CAE Guidance when the presentation change is situational: a command, onboarding flow, task completion, phase, task tag, or policy-remediation path. CAE Guidance is advisory text; it does not mutate `agentPresentation` and it does not replace CLI policy gates.

## Scoped Guidance Patterns

Use CAE Guidance for workflow-specific presentation changes instead of adding new global config combinations. Curated draft-rule examples live in `.ai/cae/presentation-guidance-examples.v1.json` and can be previewed before publishing.

### Onboarding Simpler

Scope to the onboarding workflow or prompt surface. Keep work logs minimal, use simple rationale summaries, and use plain language. This helps new operators without changing maintainer release behavior.

Preview shape:

```bash
workspace-kit run cae-guidance-preview '{"schemaVersion":1,"commandName":"interview-behavior-profile","evalMode":"shadow","draftRule":{"schemaVersion":1,"title":"Presentation: onboarding simple language","family":"think","priority":640,"artifactType":"runbook","refPath":".ai/runbooks/agent-presentation-policy.md","scopeDraft":{"preset":"workflow","workflowName":"interview-behavior-profile"}}}'
```

### Phase Closeout Technical

Scope to task completion or release evidence workflows for the active phase. Increase technicality and final-answer detail so validation, blockers, release evidence, and residual risks are easy to audit.

Preview shape:

```bash
workspace-kit run cae-guidance-preview '{"schemaVersion":1,"commandName":"run-transition","commandArgs":{"action":"complete"},"currentKitPhase":"80","evalMode":"shadow","draftRule":{"schemaVersion":1,"title":"Presentation: phase closeout technical evidence","family":"review","priority":720,"artifactType":"runbook","refPath":".ai/runbooks/agent-presentation-policy.md","scopeDraft":{"preset":"completingTask","phaseKey":"80"}}}'
```

### Sensitive Command Remediation

Scope to sensitive workflows such as `run-transition`. Keep rationale summaries technical enough to explain policy gates, approvals, stale planning generation, and retry instructions. This must not replace JSON `policyApproval`.

Preview shape:

```bash
workspace-kit run cae-guidance-preview '{"schemaVersion":1,"commandName":"set-current-phase","commandArgs":{"dryRun":false},"evalMode":"shadow","draftRule":{"schemaVersion":1,"title":"Presentation: sensitive command remediation","family":"policy","priority":760,"artifactType":"runbook","refPath":".ai/runbooks/agent-presentation-policy.md","scopeDraft":{"preset":"advancedCommand","commandName":"set-current-phase","commandArgPath":"dryRun","commandArgValue":false},"acknowledgement":{"strength":"surface","token":"presentation-sensitive-command-remediation"}}}'
```

## Conflict Posture

When multiple CAE presentation rules match, treat them as layered advisory Guidance. The highest-priority matching rule should supply the dominant presentation hint for that workflow, while lower-priority rules remain context. Do not write the CAE result back into baseline config.

## Preview Safety

Always preview draft Guidance with `cae-guidance-preview` before publishing. Treat `scopeWarnings`, `broadScopeWarnings`, and `activationReadiness.level: "stop_confirm"` as a sign to narrow scope by workflow, phase, task, task tag, or command argument.

Broad scopes are allowed for exploration, but durable Guidance should be narrow enough that it changes presentation only for the workflow that needs it.
