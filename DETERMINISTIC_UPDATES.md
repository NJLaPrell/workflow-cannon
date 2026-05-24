# Deterministic Updates Plan

This document inventories areas where Workflow Cannon currently relies too much on AI prompts, playbooks, or manual agent orchestration, and identifies where those flows should become deterministic scripts, commands, schemas, or release gates before 1.0.

## Guiding Rule

> If a mistake would cause a bad release, broken install, wrong package contents, unsafe agent guidance, stale dashboard, invalid task transition, or consumer-project confusion, it belongs in scripts/code — not in an AI prompt.

AI may propose, summarize, draft, explain, and clarify. Code must validate, persist, gate, package, migrate, release, and certify.

## What Should Stay Prompt-Driven

Some work is legitimately AI-shaped and should remain conversational.

| Area | Why prompt/AI is appropriate |
| --- | --- |
| Clarifying ambiguous operator intent | Humans often describe work vaguely |
| Drafting summaries, release notes, and task descriptions | Language generation is useful |
| Ranking tradeoffs when evidence is incomplete | Judgment calls may need context and nuance |
| Asking onboarding or interview questions | Conversational UX is appropriate |
| Explaining remediation in plain English | Scripts can detect; AI can translate findings for humans |
| Suggesting task decomposition | Useful, as long as deterministic validation happens before persistence |

## Prompt-to-Code Conversions Needed Before 1.0

### 1. First Release Readiness Command

Current state: release and phase closeout are largely orchestrated by playbooks and ordered checklist prompts, even though many underlying checks already exist.

Target state:

```bash
wk run first-release-readiness '{"targetVersion":"1.0.0"}'
```

The command should emit structured JSON:

```json
{
  "passed": false,
  "gates": [
    {
      "id": "package-boundary",
      "status": "failed",
      "severity": "blocker",
      "findings": []
    }
  ],
  "nextActions": []
}
```

The command should be the release authority. Playbooks may remain as human guidance, but should not be the primary source of release readiness truth.

### 2. Package Boundary Audit

Current state: package contents can be reviewed manually or by an agent, but 1.0 requires deterministic proof that the installed package includes required runtime assets and excludes or quarantines internal-only development directives.

Target command:

```bash
pnpm run check:package-boundary
```

or:

```bash
wk run package-boundary-audit '{}'
```

The audit should inspect the packed npm tarball, not only the repository tree.

It should classify every shipped path as one of:

- runtime required
- consumer-safe guidance
- template/scaffold source
- fixture/test asset
- internal-only
- forbidden

It should fail on:

- internal maintainer docs in the package
- Workflow Cannon repo-specific `.ai` directives exposed as consumer guidance
- release runbooks shipped without quarantine
- local artifacts or evidence
- accidental private files
- package files not justified by a package-boundary manifest

### 3. Consumer Guidance Audit

Current state: consumer guidance safety can be reasoned about in prompts, but that is not enough for 1.0.

Target command:

```bash
wk run consumer-guidance-audit '{"fixture":"fresh-project"}'
```

The audit should verify generated consumer files do not contain or reference:

- Workflow Cannon internal roadmap process
- phase closeout playbooks
- maintainer release runbooks
- package development directives
- Workflow Cannon repo `.ai/agent-source-of-truth-order.md`
- `docs/maintainers` paths
- internal task IDs or phase machinery unless intentionally part of the consumer contract

The AI-based consumer confusion test can remain as supplemental smoke coverage, but deterministic generated-guidance checks should be the primary gate.

### 4. Release Truth Consistency Check

Current state: release/version truth can drift between package metadata, roadmap, status files, changelog, plugin version, compatibility matrix, GitHub release, and npm state.

Target command:

```bash
pnpm run check:release-truth
```

The check should compare:

- `package.json`
- Dashboard UI Plugin version or compatibility range
- changelog latest section
- roadmap current state
- status YAML
- compatibility matrix
- npm/package metadata during release
- GitHub release tag after publish

The script should fail if any public surface contradicts the canonical release metadata source.

### 5. Dashboard Consumer Compatibility Test

Current state: the Dashboard UI Plugin is compiled and checked, but 1.0 needs proof that it works as a primary product surface against a consumer project.

Target command:

```bash
pnpm run test:dashboard-consumer
```

The test should:

- create a temporary consumer project
- install the packed Workflow Kit package
- run `wk init`
- start or simulate the kit backend
- run dashboard data-provider calls
- verify the dashboard renders expected sections
- verify missing or stale kit state produces useful remediation
- verify the plugin does not rely on Workflow Cannon repo-local files

### 6. Wishlist Conversion Planner

Current state: wishlist intake relies on an agent to score open ideas, identify duplicates, choose phase buckets, ask questions, and build `convert-wishlist` payloads.

Target command:

```bash
wk run plan-wishlist-conversion '{"wishlistTaskId":"T###"}'
```

The command should deterministically return:

- duplicate candidates
- existing related tasks
- recommended phase bucket
- missing required fields
- dependency suggestions
- valid payload skeleton
- planning generation token
- whether conversion is currently safe

AI can still help clarify intent and write task descriptions, but code should perform dedupe, phase bucket selection, required-field checks, and conversion readiness.

### 7. Onboarding Session State Machine

Current state: onboarding is driven by a detailed markdown playbook with exact text, wait points, accepted answers, and persistence commands.

Target command family:

```bash
wk run onboarding-session '{"action":"start"}'
wk run onboarding-session '{"action":"answer-role","value":"Wizard"}'
wk run onboarding-session '{"action":"answer-temperament","value":"calculated"}'
```

Each response should include:

```json
{
  "step": "agent-temperament",
  "prompt": "...",
  "choices": [],
  "state": {},
  "nextCommand": {}
}
```

Code should own:

- valid choices
- current step
- accepted answer mapping
- persistence commands
- planning generation handling
- completion state

AI should only present the prompt and explain choices.

### 8. Feature Stability Metadata

Current state: feature status and stability are mostly described in generated docs or roadmap prose.

Target state: feature metadata should explicitly drive stable, preview, and internal labeling.

Example metadata:

```json
{
  "featureId": "task-engine",
  "stability": "stable",
  "consumerSurface": true,
  "shipsInPackage": true,
  "dashboardSurface": true
}
```

This metadata should generate or validate:

- stability matrix
- package boundary expectations
- README feature table
- dashboard compatibility table
- release readiness inputs

### 9. First Release Evidence Bundle

Current state: release evidence can be assembled by following release docs and agent summaries.

Target command:

```bash
wk run first-release-evidence-bundle '{"targetVersion":"1.0.0"}'
```

The bundle should include:

- readiness gate statuses
- package tarball audit
- consumer install transcript
- dashboard validation result
- migration fixture result
- version truth result
- security/trust check result
- docs consistency result
- known risks
- follow-up tasks

The agent can summarize the generated bundle, but should not manually assemble it.

### 10. Public Documentation Boundary Check

Current state: AI can rewrite docs, but user-facing documentation architecture should be validated deterministically.

Target command:

```bash
pnpm run check:public-doc-boundary
```

The check should fail if:

- README points normal consumers to maintainer runbooks
- public quickstart references internal phase closeout
- Dashboard UI Plugin is not represented as a primary 1.0 surface
- consumer docs omit what gets generated
- consumer docs omit what does not get imported
- old `dashboard-summary` terminology appears in user-facing contexts
- docs mention deprecated install paths

## Recommended New Deterministic Commands and Scripts

| Priority | Command/script | Purpose |
| --- | --- | --- |
| P0 | `wk run first-release-readiness` | One authoritative 1.0 pass/fail gate |
| P0 | `pnpm run check:package-boundary` | Audit packed npm contents |
| P0 | `wk run consumer-guidance-audit` | Verify generated consumer instructions are safe |
| P0 | `pnpm run test:consumer-install` | Fresh project install/init/doctor/start smoke |
| P0 | `pnpm run test:dashboard-consumer` | Dashboard plugin against packed consumer install |
| P0 | `pnpm run check:release-truth` | Version/status/changelog/roadmap consistency |
| P1 | `wk run first-release-evidence-bundle` | Generate release proof package |
| P1 | `wk run plan-wishlist-conversion` | Deterministic wishlist conversion preflight |
| P1 | `wk run onboarding-session` | State-machine onboarding flow |
| P1 | `pnpm run check:public-doc-boundary` | Verify public docs do not leak internal process |
| P1 | `pnpm run check:feature-stability-matrix` | Stable/preview/internal consistency |
| P2 | `wk run migration-readiness` | Existing project upgrade/migration preflight |
| P2 | `wk run dashboard-contract-check` | Validate plugin/backend contract schema compatibility |

## Workflows That Should No Longer Be Primarily Prompt-Based by 1.0

1. Release readiness orchestration
2. Package content review
3. Consumer guidance safety review
4. Version truth comparison
5. Dashboard plugin compatibility validation
6. Generated docs boundary validation
7. Migration readiness
8. Evidence bundle assembly
9. Wishlist dedupe and phase-bucket calculation
10. Onboarding flow state management

## Implementation Strategy

Use prompts as the conversation layer and code as the authority.

A good 1.0 architecture for each workflow is:

1. User or operator describes intent in chat.
2. Agent asks clarifying questions when needed.
3. Agent calls deterministic Workflow Cannon command.
4. Command validates state and returns structured result.
5. Agent explains the result and asks for explicit approval when required.
6. Command performs persistence or mutation only through approved, structured inputs.
7. Evidence is emitted automatically.

## Summary

Workflow Cannon should not depend on agents remembering critical procedures.

The AI should remain the narrator, analyst, and drafter. Workflow Cannon itself should be the source of truth, validator, enforcer, and evidence generator.
