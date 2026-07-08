<!--
agentCapsule|v=1|command=get-plan-artifact-template|module=planning|schema_only=pnpm exec wk run get-plan-artifact-template --schema-only '{}'
-->

# get-plan-artifact-template

Return a **minimal valid PlanArtifact v1 skeleton** from the planning module kernel fixture. The handler validates the template against `plan-artifact.v1` JSON Schema on every run.

**Tier:** C (read-only, no `policyApproval`).

## Usage

```bash
pnpm exec wk run get-plan-artifact-template '{}'
```

## Returns

`ok: true`, **`code`**: `plan-artifact-template-retrieved`, and:

- `data.templateSource` — `fixtures/kernel/plan-artifact-template.v1.json`
- `data.artifact` — schema-valid PlanArtifact v1 skeleton (replace `planId` / content before `draft-plan-artifact` persist)

Shape mirrors `fixtures/planning/plan-artifact-minimal.valid.v1.json`.

## Related

- `draft-plan-artifact` — validate or persist a filled-in artifact
- `get-plan-artifact` — read persisted plan versions
