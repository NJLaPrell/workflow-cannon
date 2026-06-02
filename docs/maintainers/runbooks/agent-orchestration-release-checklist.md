<!-- GENERATED FROM .ai/runbooks/agent-orchestration-release-checklist.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Agent orchestration release checklist

**Artifact:** A-RELEASE-ORCH
**Use when:** Closing a phase that delivered orchestration behavior and preparing the phase branch for release.

This checklist is the operational companion to [phase-closeout-and-release.md](./phase-closeout-and-release.md) and [RELEASING.md](../RELEASING.md). It keeps the release evidence focused on orchestration artifacts and their validation.

## Required gates

- [ ] `phase-closeout-readiness` passes for the target phase.
- [ ] `phase-delivery-preflight` passes without unresolved evidence gaps.
- [ ] `release-evidence-manifest` records the shipped scope and known risks.
- [ ] `pnpm run build` passes.
- [ ] `pnpm run check` passes.
- [ ] `pnpm run test` passes.
- [ ] `pnpm run parity` passes when required by the phase release path.
- [ ] `pnpm run pre-merge-gates` passes.
- [ ] `propose-release-version` has been applied to the working branch.
- [ ] `publish:npm` is approved and launched through CI, not local publish.

## Orchestration-specific checks

- [ ] `dashboard-summary` exposes the current agent activity slice.
- [ ] The new activity projection is compatible with the existing `agentStatus` fallback.
- [ ] Assignment, subagent, and activity records reconcile cleanly.
- [ ] No blocked or stale worker state is silently treated as fresh work.
- [ ] Docs and prompts that define the orchestration flow are present in `.ai/`.

## Evidence table

| Check | Evidence |
| --- | --- |
| Branch ready | `release/phase-<N>` tip and clean release diff |
| Validation | build / check / test / parity logs |
| Version | proposed semver bump and package manifest |
| Publish | GitHub Actions run URL and npm artifact proof |
| Follow-up | release notes, known risks, and next-phase handoff |

## Sign-off

- [ ] Phase closeout evidence is complete.
- [ ] Publish was explicitly approved.
- [ ] Post-publish verification has been recorded.
