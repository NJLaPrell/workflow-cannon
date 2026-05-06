# CAE workspace artifact conventions

Workspace-authored CAE artifact bodies live as markdown files under `.ai/cae/artifacts/`. The CAE registry remains the runtime source of truth for artifact metadata and activation references; this convention only defines where dashboard-created artifact files should be placed.

## Namespaces

| Namespace | Owner | Rule |
| --- | --- | --- |
| `cae.*` | Workflow Cannon defaults | Shipped defaults are immutable; dashboard users may duplicate or hide them, not edit them in place. |
| `workspace.*` | Current workspace | Dashboard-authored artifacts and activations use this namespace by default. |

## Artifact body paths

| Artifact type | Default body directory |
| --- | --- |
| `playbook` | `.ai/cae/artifacts/playbooks/` |
| `runbook` | `.ai/cae/artifacts/runbooks/` |
| `checklist` | `.ai/cae/artifacts/checklists/` |
| `review-template` | `.ai/cae/artifacts/review-templates/` |
| `reasoning-template` | `.ai/cae/artifacts/reasoning-templates/` |
| `policy-doc` | `.ai/cae/artifacts/policy-docs/` |

File names use a lowercase slug plus `.md`, for example `.ai/cae/artifacts/playbooks/release-sanity.md`.

## Validation

Workspace artifact slugs are file stems, not paths. They must use lowercase letters, digits, dot, underscore, or hyphen separators. Absolute paths, slash separators, backslash separators, empty strings, and traversal segments are invalid.

The core helper implementation lives in `src/core/cae/workspace-artifact-conventions.ts`; fixture examples live under `fixtures/cae/workspace-artifacts/`.