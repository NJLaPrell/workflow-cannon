# ADR: Unified command contract registry (v1)

## Status

Proposed — Phase 74 (**T989**). This ADR defines the target architecture; implementation should land as small follow-on tasks.

## Context

`workspace-kit run` commands now expose enough machine-readable behavior for agents to operate safely, but the metadata is split across several surfaces:

| Current surface | Today | Target |
| --- | --- | --- |
| `src/contracts/builtin-run-command-manifest.json` / `.ts` | command ownership, instruction file, policy classification, default response template | Replaced by generated compatibility output from the registry after migration. |
| `schemas/pilot-run-args.snapshot.json` | strict or permissive args schemas for schema-only and runtime validation | Replaced by generated schema bundle from registry rows. |
| `schemas/planning-generation-cli-prelude.json` | command list that needs CLI-level `expectedPlanningGeneration` checks | Generated from `planningGeneration` fields in registry rows. |
| `src/modules/*/instructions/*.md` | human and agent command instructions, partly generated sections | Retained as rendered docs generated from registry fields plus command-specific prose. |
| `src/core/policy.ts` and policy config | sensitivity and dry-run approval behavior | Consumes registry `policy` metadata, with config-only dynamic sensitivity as an overlay. |
| `src/core/response-template-shaping.ts` | response template precedence, contextual phase-shipping defaults | Consumes registry `responsePresentation` defaults while keeping contextual release behavior as a router overlay. |
| handler-local validation and checks | command-specific invariants, idempotency, dependency and state checks | Retained for domain invariants; registry declares the external contract and required standard gates. |
| `src/core/cli-remediation.ts` | stable remediation paths for common errors | Generated or validated from registry `remediation` metadata. |

The problem is not that these files exist. The problem is that agents and module authors must infer one command contract from many partial declarations. That drift makes schema-only output, policy traces, planning-generation checks, docs generation, and CI coverage harder to trust.

## Decision

Introduce a versioned **command contract registry** as the source of truth for agent-facing command metadata. Runtime handlers remain responsible for domain behavior, but every executable command declares one registry row that the router, schema-only output, policy checks, documentation generation, response shaping, remediation, and CI coverage can consume.

The registry should be code-first TypeScript for author ergonomics, with generated JSON snapshots for packaged consumers and CI comparison.

```ts
export type CommandContractRow = {
  schemaVersion: 1;
  name: string;
  moduleId: string;
  description: string;
  instruction: {
    file: string;
    generatedSections?: Array<"args" | "examples" | "policy" | "planningGeneration" | "idempotency">;
    requiresPeers?: string[];
  };
  args: {
    schema: JsonSchemaObject;
    sampleArgs: Record<string, unknown>;
    examples: Array<{ description: string; argv: string }>;
    validationMode: "strict" | "permissive";
  };
  policy: {
    sensitivity: "non-sensitive" | "sensitive" | "sensitive-with-dryrun";
    operationId?: string;
    dryRunArgPath?: string;
    approvalSurface?: "json-policyApproval";
  };
  planningGeneration: {
    expectedPlanningGeneration: "not-applicable" | "optional" | "required-when-policy-require";
    cliPrelude: boolean;
  };
  idempotency: {
    clientMutationId: boolean;
    replayCode?: string;
    conflictCode?: "idempotency-key-conflict";
  };
  responsePresentation: {
    defaultResponseTemplateId?: string;
    contextualTemplateAllowed?: boolean;
  };
  remediation: {
    instructionPath: string;
    docPath?: string;
    commonFailureCodes: string[];
  };
};
```

## Consumption Model

1. **Module authors declare contracts beside module command registration.** The module exports command handlers and registry rows together, or imports shared builtin rows from the module package. The router rejects duplicate command names and executable commands without a contract row.
2. **Schema-only output is a registry projection.** `workspace-kit run <command> --schema-only` reads `args`, `policy`, `planningGeneration`, `idempotency`, `responsePresentation`, and `remediation` from the same row used by runtime checks.
3. **Runtime validation uses generated validators.** Strict command schemas compile from `args.schema`. Permissive rows still produce usable sample args and docs, but CI flags them unless explicitly allowed.
4. **Policy checks use registry metadata first.** `policy.sensitivity`, `operationId`, and `dryRunArgPath` drive `isSensitiveModuleCommand`; `policy.extraSensitiveModuleCommands` stays as a config overlay for local governance.
5. **Planning-generation checks use registry metadata.** The CLI prelude list becomes generated compatibility output from rows where `planningGeneration.cliPrelude` is true.
6. **Instruction markdown is rendered from registry sections.** Human prose remains in `instructions/*.md`; generated args/examples/policy/concurrency sections are rewritten from registry rows.
7. **Response templates keep layered precedence.** Explicit args and config overrides still win. Registry defaults replace manifest defaults; contextual phase-shipping behavior stays a router-level overlay because it depends on command args and release context.
8. **Remediation becomes validated coverage.** Every standard failure code returned before handler dispatch must map to registry remediation metadata or a shared core remediation row.

## Migration Plan

1. **Add registry types and adapters.** Introduce `CommandContractRow`, a registry loader, duplicate detection, and compatibility adapters that emit today’s manifest, schema-only metadata, and planning-generation prelude.
2. **Migrate task-engine commands first.** Move `run-transition`, `create-task`, `update-task`, `start-task`, `complete-task`, `claim-next-task`, `set-current-phase`, and release evidence commands into registry rows while keeping existing JSON files generated and checked.
3. **Wire consumers one at a time.** Switch schema-only output first, then runtime args validation, then policy sensitivity, then instruction generation, then response-template defaults.
4. **Add CI drift checks.** Fail when generated compatibility outputs differ from committed snapshots, when an executable command lacks a registry row, or when strict/permissive waivers lack rationale.
5. **Deprecate compatibility sources.** After all registered commands consume registry metadata, keep generated JSON snapshots for one release cycle, then remove hand-maintained manifests and prelude files.

Reviewable implementation tasks:

- Add registry types, loader, duplicate checks, and generated compatibility output for the existing builtin manifest.
- Migrate task-engine command rows and make `--schema-only` read registry projections.
- Generate instruction contract sections from registry rows and add drift checks.
- Replace `planning-generation-cli-prelude.json` with a generated artifact and registry-backed CLI prelude.
- Replace manifest policy/template lookups with registry-backed lookups plus config/contextual overlays.

## Compatibility Risks

- Packaged consumers may import current manifest helpers. Keep adapter exports stable until the generated snapshot fully replaces hand-maintained data.
- Permissive schemas can hide weak command contracts. CI should allow them only with explicit rationale and a target migration issue.
- Dry-run sensitivity is easy to model incorrectly. Registry rows must declare the arg path that makes a sensitive command non-mutating.
- Handler-local invariants must not disappear. The registry describes the public protocol; domain services still enforce state, dependency, and evidence rules.
- Documentation generation can overwrite human prose if boundaries blur. Only generated sections should be registry-owned.

## Open Questions

- Should registry rows live in each module directory or in a central `src/contracts` bundle with module-owned imports?
- Do plugin-provided commands get the same registry contract at install time, or a reduced plugin manifest shape with runtime validation?
- Should `responsePresentation.contextualTemplateAllowed` be a simple boolean or a typed predicate registry for phase/release commands?
- How strict should CI be for permissive schemas during the first migration release?

## Consequences

The router becomes the enforcement point for command metadata completeness, and agents get one stable machine protocol for command invocation. The cost is a careful migration: existing manifests, schema snapshots, prelude files, generated instructions, and policy lookups must be kept compatible until the registry owns them.
