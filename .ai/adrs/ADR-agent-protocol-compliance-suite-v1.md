# ADR: Agent protocol compliance suite (v1)

## Status

Proposed — Phase 74 (**T990**). This proposal depends on **T989** / `ADR-command-contract-registry-v1.md`.

## Context

Agent-facing commands are only reliable when their behavior is executable, discoverable, and stable under failure. Today the repo has several strong checks (`check-builtin-command-manifest`, pilot run-args snapshot validation, instruction-section checks, CLI map coverage), but they are still separate guardrails. A command can pass one check while drifting in schema-only output, policy metadata, planning-generation behavior, idempotency declarations, remediation paths, or response shape.

The compliance suite should make the agent protocol a first-class CI contract. It should test what agents depend on, not just TypeScript compile success.

## Decision

Add an **agent protocol compliance suite** that evaluates every router-registered executable command against a matrix of required metadata, runtime behavior, and failure-shape guarantees. The suite consumes the unified command contract registry from T989 when available; until then, it can run against existing compatibility sources.

## Compliance Matrix

| Area | Pass rule | Initial source | Future source |
| --- | --- | --- | --- |
| Command registration | Every executable command has a unique name, module id, instruction path, and description. | `ModuleCommandRouter` + builtin manifest | Command contract registry |
| Args schema | Every command returns `ok:true` from `--schema-only` with `schema`, `sampleArgs`, and examples. Sensitive commands require strict schema or explicit waiver. | `schemas/pilot-run-args.snapshot.json` + schema-only fallback | Registry `args` |
| Instruction coverage | Every executable command has an instruction file with generated args sections where applicable. | `src/modules/*/instructions/*.md` | Registry-rendered instruction sections |
| Policy metadata | Sensitive commands declare `operationId`; dry-run-sensitive commands declare the dry-run arg path. | builtin manifest + `policy.ts` checks | Registry `policy` |
| Planning generation | Mutating task/planning commands declare whether `expectedPlanningGeneration` is required under repo policy. | `schemas/planning-generation-cli-prelude.json` | Registry `planningGeneration` |
| Idempotency | Commands accepting `clientMutationId` declare replay and conflict behavior. | pilot schemas + handler tests | Registry `idempotency` + golden tests |
| Response templates | Commands declare manifest defaults and contextual phase-shipping behavior is covered. | builtin manifest + response-template shaping tests | Registry `responsePresentation` + router overlay tests |
| Remediation | Standard failures include stable `code`, actionable message, and remediation paths. | `cli-remediation.ts` + targeted tests | Registry `remediation` |
| Runtime no-op semantics | Intent commands return structured no-op / violation responses instead of accidental mutation. | task-engine tests | Registry categories + command golden tests |

Explicit exclusions are allowed only with `command`, `area`, `rationale`, `owner`, and `expiresAfterPhase` or a linked implementation task.

## Golden Failure Fixtures

The suite should include stable examples for the failure modes agents most often need to recover from:

```json
{
  "code": "policy-denied",
  "required": ["policyApproval"],
  "remediation": {
    "docPath": ".ai/POLICY-APPROVAL.md"
  }
}
```

```json
{
  "code": "planning-generation-required",
  "required": ["expectedPlanningGeneration"],
  "remediation": {
    "instructionPath": "src/modules/task-engine/instructions/update-task.md"
  }
}
```

```json
{
  "code": "planning-generation-mismatch",
  "recoverBy": "re-read list-tasks/get-task/get-next-actions and retry with fresh generation"
}
```

```json
{
  "code": "invalid-run-args",
  "details": {
    "command": "run-transition",
    "errors": []
  },
  "remediation": {
    "instructionPath": "src/modules/task-engine/instructions/run-transition.md"
  }
}
```

```json
{
  "code": "idempotency-key-conflict",
  "recoverBy": "choose a new clientMutationId or inspect the prior mutation"
}
```

```json
{
  "code": "unknown-command",
  "recoverBy": "run workspace-kit run or doctor --agent-instruction-surface for the catalog"
}
```

```json
{
  "code": "dependency-unsatisfied",
  "recoverBy": "inspect unmet dependencies and choose a runnable task"
}
```

Golden tests should assert stable `code`, remediation presence, bounded messages, and no accidental mutation on failures.

## Test Plan By Command Class

| Command class | Representative commands | Required suites |
| --- | --- | --- |
| Lifecycle transitions | `run-transition`, `start-task`, `complete-task`, `claim-next-task` | policy denial, stale generation, idempotent replay/conflict, dependency-blocked, delivery-evidence guard |
| Task CRUD and planning persistence | `create-task`, `update-task`, `persist-planning-execution-drafts`, `review-planning-execution-drafts` | schema validation, generation prelude, type guardrails, no-op/dry-run paths |
| Phase and release | `set-current-phase`, `phase-delivery-preflight`, `release-evidence-manifest` | workspace revision/generation boundaries, evidence manifest failures, phase_ship response sections |
| Documentation commands | `generate-document`, `document-project` | dry-run sensitivity, generated-section drift, overwrite policy |
| Non-task modules | `cae-*`, `agent-behavior`, `skills`, `team-execution`, `subagents` | command registration, schema-only coverage, peer-disabled behavior, remediation |

Immediate tests that can land before T989 implementation:

- Extend `check-builtin-command-manifest` to assert policy/template metadata for every executable command.
- Add golden tests for `policy-denied`, `planning-generation-required`, `invalid-run-args`, `unknown-command`, and `idempotency-key-conflict`.
- Expand `check-pilot-run-args-snapshot` so sensitive command waivers require owner/rationale/expiry.
- Add a schema-only smoke test that loops over `workspace-kit run` command descriptors and executes `<command> --schema-only`.

Tests that should wait for the registry:

- Registry row completeness for every executable command.
- Generated compatibility snapshots for manifest, pilot schemas, and planning-generation prelude.
- Registry-rendered instruction section drift checks.
- Registry-driven response-template and remediation coverage.

## CI Integration

Add a single `agent-protocol-compliance` check stage that runs after TypeScript and before generated-doc drift checks:

1. Build the command catalog from the enabled module registry.
2. Load command contracts from the registry, or compatibility sources during migration.
3. Evaluate each matrix area and exclusions.
4. Run golden failure fixtures against a disposable test workspace.
5. Emit a compact JSON report with `commandCount`, `passCount`, `warningCount`, `failureCount`, and per-command failures.

CI should fail when:

- A new executable command lacks schema-only coverage.
- A sensitive command lacks strict args validation or an unexpired waiver.
- A command with policy sensitivity lacks an operation id.
- A planning-generation mutator is missing from the declared prelude.
- A standard failure lacks remediation metadata.
- A command changes a golden failure code or response envelope without an explicit migration note.

## Follow-On Implementation Tasks

- Add `agent-protocol-compliance` report generation using current compatibility sources.
- Add golden failure fixtures for policy, planning generation, invalid args, unknown command, idempotency, and dependency failures.
- Add strict waiver metadata for permissive schemas and sensitive commands.
- Wire registry-backed compliance after T989 migrates command contract rows.
- Add disposable-workspace mutation tests for lifecycle and planning commands.

## Compatibility Risks

- Over-strict CI can block routine command work. Use explicit, expiring exclusions during migration.
- Golden responses can freeze poor wording. Assert stable codes and required fields first; keep message snapshots bounded.
- Some commands are disabled by peer modules. Compliance should distinguish non-executable instruction rows from executable commands in the active registry.
- Runtime mutation tests must use disposable workspace state so they do not corrupt maintainer task data.

## Consequences

The repo gets an executable definition of “agent-safe command.” New commands will need schema, instruction, policy, planning-generation, idempotency, response, and remediation coverage before they ship. The cost is more upfront contract work, paid back by fewer borked agent workflows and cleaner release evidence.
