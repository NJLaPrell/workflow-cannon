# CAE UX Authoring Plan

## Summary

This plan completes the product direction for a first-class CAE authoring experience. The goal is not a thin CRUD table over registry rows; the goal is a Guidance authoring surface that lets users safely modify CAE entries and artifacts while preserving shipped defaults, validation, preview, auditability, and rollback.

The recommended direction is:

- Shipped CAE defaults are immutable and can be cloned, hidden, or reset to, but not edited in place.
- Workspace customizations are first-class and live in a workspace layer.
- CAE registry metadata, activation rows, versions, and audits remain in kit SQLite.
- User-authored artifact bodies live as normal markdown files under `.ai/cae/artifacts/`.
- Dashboard UI calls workspace-kit commands; it never writes SQLite directly.
- Activation authoring is draft-first, preview-backed, and explicit before activation.
- Delete is modeled as disable, retire, hide default, remove override, or advanced physical file deletion.

This produces a first-class UX if the MVP includes the complete authoring loop: create or duplicate an artifact, edit its content and metadata, create a draft activation that points to it, preview blast radius and conflicts, activate it, and later disable or retire it with visible audit history.

## Problem Statement

CAE currently has a structured registry of artifact rows and activation rows. It can evaluate context and return effective Guidance backed by artifact IDs. The active registry is SQLite-backed, while JSON under `.ai/cae/registry/` acts as seed/fixture material.

The next product step is authoring: users need a dashboard plugin UI that can create, update, and retire CAE artifacts and CAE activation entries. The UI must retain a default preloaded CAE configuration while allowing workspace-level customization.

The main risk is treating this as generic CRUD. CAE authoring changes how agents receive situational guidance. Bad edits can over-activate policy, hide important runbooks, create conflicting activations, or leave broken file references. The UX must make those changes understandable and recoverable.

## Definitions

- **Artifact body**: The referenced content, usually a markdown document such as a runbook or playbook.
- **Artifact registry row**: Structured metadata with `artifactId`, `artifactType`, `ref.path`, title, tags, and optional fragment.
- **Activation entry**: A CAE rule with family, lifecycle state, priority, scope conditions, artifact references, and optional acknowledgement.
- **Default artifact**: Shipped guidance provided by Workflow Cannon.
- **Workspace artifact**: User-created or user-customized guidance in the current workspace.
- **Draft activation**: An activation that can be edited and previewed but is not active Guidance yet.
- **Retire**: Remove a registry row or activation from normal operation without necessarily deleting its file.
- **Hide default**: Workspace-level suppression of a shipped default without modifying the default itself.

## Recommended Decisions

### 1. Defaults Are Immutable

Packaged defaults should not be edited directly. The UI should show defaults with a `Default` source label and offer these actions:

- Duplicate to workspace
- Hide in this workspace
- Preview
- Reset workspace override, when applicable

This keeps package upgrades and resets comprehensible. Users know which guidance came from Workflow Cannon and which guidance they changed.

### 2. Workspace Artifact Bodies Live In Files

User-authored artifact bodies should be stored as markdown files under:

```text
.ai/cae/artifacts/
  playbooks/
  runbooks/
  checklists/
  review-templates/
  reasoning-templates/
  policy-docs/
```

SQLite should store metadata and references, not the markdown body. File-backed artifacts are reviewable, diffable, editable outside the dashboard, and recoverable with normal source control.

### 3. Registry Metadata Stays In SQLite

The kit SQLite registry remains authoritative for runtime CAE state:

- registry versions
- artifact registry rows
- activation rows
- active version pointer
- mutation audit rows
- trace and acknowledgement persistence when enabled

The dashboard must call workspace-kit commands for all registry mutations.

### 4. Use Higher-Level Authoring Commands For UI Workflows

The existing low-level CAE registry admin commands are good primitives, but the UI should not stitch together file creation and registry mutation itself. Add higher-level authoring commands that perform file and registry operations atomically.

For example, creating a workspace artifact should validate the path, write the markdown file, insert the registry row, run post-mutation registry validation, and write audit metadata as one operation.

### 5. Draft First, Preview Before Activate

Activation authoring should create drafts first. Users should preview impact before activation, especially for:

- `policy` family activations
- `always` scopes
- broad command prefix scopes
- activations with acknowledgement requirements
- activations that conflict with existing rows

The existing `cae-guidance-preview` draft overlay direction should become a core part of the authoring UX.

### 6. Primary Destructive Actions Are Disable And Retire

The normal UI should avoid hard delete. It should expose:

- Disable activation
- Retire activation
- Retire workspace artifact
- Hide default artifact
- Remove workspace override

Physical file deletion should be advanced, confirmed, and allowed only for workspace-owned files with no active references.

### 7. Namespace User Content Separately

Reserve `cae.*` for shipped defaults and use `workspace.*` for user-created content by default.

Examples:

- `workspace.playbook.release-sanity`
- `workspace.runbook.local-troubleshooting`
- `workspace.policy.branch-hygiene`

Future org/team prefixes can be added later, but the MVP should use a clear workspace namespace.

### 8. Checkpoint On Publish, Audit Every Save

Every save should record an audit row. Named registry checkpoints should be created at publish or activation boundaries, not necessarily for every text edit. This keeps rollback meaningful without turning every keystroke into a version.

## Storage Model

### Layered Guidance Model

| Layer | Role | Storage |
| --- | --- | --- |
| Packaged defaults | Immutable starter guidance | Packaged seed and imported default registry version |
| Workspace registry | Active/custom registry metadata | Kit SQLite `cae_registry_*` tables |
| Workspace artifact bodies | User-created markdown content | `.ai/cae/artifacts/<type>/<slug>.md` |
| Audit and history | Mutation provenance and recovery | Kit SQLite `cae_registry_mutations` and registry versions |

### Artifact Body Paths

The UI should default file creation based on artifact type:

| Artifact type | Default directory |
| --- | --- |
| `playbook` | `.ai/cae/artifacts/playbooks/` |
| `runbook` | `.ai/cae/artifacts/runbooks/` |
| `checklist` | `.ai/cae/artifacts/checklists/` |
| `review-template` | `.ai/cae/artifacts/review-templates/` |
| `reasoning-template` | `.ai/cae/artifacts/reasoning-templates/` |
| `policy-doc` | `.ai/cae/artifacts/policy-docs/` |

The path picker should stay inside schema-allowed roots and prefer `.ai/cae/artifacts/` for new workspace-authored content.

### Default Update Semantics

When a new Workflow Cannon version ships updated defaults, the dashboard should be able to show:

- new default artifacts
- changed default artifacts
- defaults hidden in this workspace
- workspace artifacts cloned from older defaults
- conflicts between workspace customizations and updated defaults

MVP can defer full reconciliation, but the storage model should not make it impossible.

## Backend Plan

### MVP Commands

Add UI-oriented commands that wrap existing primitives and return dashboard-friendly payloads.

#### `cae-authoring-summary`

Read-only. Returns the complete bounded authoring surface for the dashboard.

Response should include:

- active registry version
- defaults available in the active/default layer
- workspace artifacts
- workspace activations
- retired/disabled counts
- artifact type counts
- activation family counts
- validation warnings
- audit summary
- native SQLite / registry readiness status

#### `cae-create-workspace-artifact`

Creates a markdown file and matching registry row.

Inputs:

- `artifactId`
- `artifactType`
- `title`
- optional `tags`
- optional `slug`
- optional `contentMarkdown`
- optional `fragment`
- `actor`
- `caeMutationApproval`

Behavior:

- derive default path from type and slug
- reject absolute paths and traversal
- reject duplicate artifact IDs
- write markdown file only under the workspace artifact directory unless explicitly advanced
- insert registry row
- validate registry after mutation
- audit mutation

#### `cae-update-workspace-artifact`

Updates workspace-owned artifact metadata and optionally markdown content.

Behavior:

- reject direct edits to default artifacts
- validate updated metadata
- validate updated file content can be saved safely
- optionally support path rename in MVP only if simple and low risk
- audit mutation

#### `cae-duplicate-default-artifact`

Creates a workspace artifact from a default artifact.

Behavior:

- copy default body into `.ai/cae/artifacts/<type>/`
- create a new `workspace.*` artifact ID
- preserve source metadata in audit or metadata
- do not overwrite the default row

#### `cae-retire-workspace-artifact`

Retires a workspace artifact row.

Behavior:

- reject if active activations reference it, unless explicit cascade disables or updates those activations
- keep backing file by default
- optionally archive file under a later phase
- audit mutation

#### `cae-create-draft-activation`

Creates an activation in `draft` lifecycle state.

Inputs:

- `activationId`
- `family`
- `priority`
- `scope`
- `artifactRefs`
- optional acknowledgement
- `actor`
- `caeMutationApproval`

Behavior:

- validate all artifact refs exist
- validate scope schema
- compute warnings for broad scopes
- audit mutation

#### `cae-update-draft-activation`

Updates a draft activation.

Behavior:

- allow metadata, scope, priority, family, lifecycle, artifact refs, and acknowledgement edits while draft
- reject unsafe transition to active; use activation command instead
- audit mutation

#### `cae-activate-draft-activation`

Promotes draft to active.

Behavior:

- require fresh preview evidence for broad or policy-affecting activations
- validate conflicts
- create named checkpoint or publish marker
- audit mutation

#### `cae-hide-default-artifact`

Suppresses a default artifact in the workspace layer.

MVP can implement this as a retired overlay or explicit suppression metadata. Prefer explicit suppression metadata if the layered default model is implemented; use retired overlay only if defaults are fully imported into active SQLite.

### MVP Reuse Of Existing Commands

The UI can reuse these current concepts:

- `cae-list-artifacts`
- `cae-get-artifact`
- `cae-list-activations`
- `cae-get-activation`
- `cae-guidance-preview`
- `cae-registry-validate`
- existing create/update/retire admin primitives where higher-level commands delegate internally

### Second-Phase Commands

Add feature-complete authoring and recovery commands:

- `cae-create-registry-checkpoint`
- `cae-compare-registry-versions`
- `cae-rollback-registry-version`
- `cae-export-guidance-pack`
- `cae-import-guidance-pack`
- `cae-reconcile-defaults`
- `cae-list-orphan-artifact-files`
- `cae-archive-retired-artifact-file`
- `cae-rename-workspace-artifact-file`

## Dashboard UX Plan

### Placement

Authoring should live in a dedicated Guidance view. The sidebar can show summary and quick actions, but full authoring should open an editor-area panel because the work needs tables, forms, markdown editing, preview, and audit context.

Top-level tabs:

```text
Overview | Artifacts | Activations | Preview | Versions / Audit
```

For MVP, `Versions / Audit` can be a compact read-only section rather than a full management tab.

### Overview Tab

Purpose: give users confidence about current CAE health and entry points.

Show:

- CAE enabled status
- active registry version
- registry store type
- artifact counts by type
- activation counts by family
- draft count
- disabled/retired count
- validation warnings
- native SQLite / CLI health
- recent mutations

Primary actions:

- New Artifact
- New Activation
- Preview Guidance
- Validate Registry

### Artifacts Tab

Purpose: manage the guidance documents CAE can point at.

Table columns:

- Title
- Artifact ID
- Type
- Source: Default, Workspace, Override, Hidden, Retired
- Path
- Used by activations
- Status
- Last changed

Filters:

- search by title, ID, or path
- type filter
- source filter
- status filter

Row actions:

- Open file
- Preview
- Duplicate
- Edit
- Retire
- Hide default
- Remove override

Default rows:

- read-only metadata
- no direct content edit
- duplicate and hide actions available

Workspace rows:

- editable metadata
- editable content
- retire action available
- physical delete hidden behind advanced confirmation

### Artifact Editor

Use a split layout.

Metadata side:

- `artifactId`
- `artifactType`
- title
- tags
- `ref.path`
- optional fragment
- source/default clone information

Content side:

- markdown editor for workspace-owned content
- rendered preview
- open file in editor action
- validation state

Save behavior:

- validate fields inline
- validate path and file existence before save
- show impacted activations
- audit every save

### Activations Tab

Purpose: manage when CAE guidance appears.

Group rows by family:

- `policy`
- `think`
- `do`
- `review`

Table columns:

- Activation ID
- Family
- Lifecycle state
- Priority
- Scope summary
- Artifact refs
- Acknowledgement strength
- Source
- Status warnings

Row actions:

- Edit
- Duplicate
- Preview
- Activate draft
- Disable
- Retire

### Activation Editor

Normal mode should use structured controls instead of raw JSON.

Fields:

- activation ID
- family selector
- lifecycle state
- priority input
- artifact picker
- acknowledgement controls
- scope builder

Scope presets:

- Always
- Command name exact
- Command name prefix
- Task tag any/all
- Task ID pattern
- Phase key
- Command arg equals

Advanced drawer:

- raw JSON scope editor
- full activation JSON preview
- schema validation output

Artifact picker:

- searchable
- grouped by artifact type
- source/status badges
- warning for retired or missing artifacts

### Preview Tab

Purpose: make changes understandable before activation.

Use `cae-guidance-preview` and draft overlay support.

Preview inputs:

- task ID
- command/workflow
- command args
- current draft activation
- current draft artifact
- evaluation mode

Show:

- baseline Guidance cards
- draft Guidance cards
- family count differences
- activation match explanation
- broad-scope warning
- conflict summary
- pending acknowledgements
- representative samples
- readiness verdict: OK, Warning, Stop and confirm

Activation should be blocked or strongly confirmed when readiness is `stop_confirm`.

### Versions / Audit Tab

MVP read-only:

- active version
- recent mutation rows
- affected IDs
- actor
- timestamp
- command name
- note/rationale

Second phase:

- named checkpoints
- compare versions
- rollback
- import/export
- default reconciliation

## MVP Phase

### Goal

Deliver a safe, complete authoring loop for workspace-level CAE guidance.

The user can:

1. View current default and workspace CAE artifacts.
2. Duplicate a default artifact or create a new workspace artifact.
3. Edit workspace artifact metadata and markdown content.
4. Create a draft activation pointing to the artifact.
5. Preview the activation against representative context.
6. Activate the draft.
7. Disable or retire the activation.
8. Retire the workspace artifact once references are clear.
9. See validation and audit information throughout.

### MVP Backend Scope

- Define `.ai/cae/artifacts/` workspace content convention.
- Add `cae-authoring-summary`.
- Add high-level workspace artifact commands.
- Add high-level draft activation commands.
- Add activation promotion command with preview evidence support.
- Add default duplication support.
- Add default hide support if the active storage model can support it safely.
- Ensure every mutation audits through `cae_registry_mutations`.
- Add referential integrity checks before retire/disable operations.
- Add schema and path validation for all authoring commands.

### MVP Dashboard Scope

- Add Guidance authoring entry point.
- Add editor-area Guidance panel.
- Implement Overview, Artifacts, Activations, and Preview tabs.
- Implement artifact create/duplicate/edit/retire flows.
- Implement activation create draft/edit draft/preview/activate/disable flows.
- Render native SQLite and registry readiness failures as actionable status.
- Refresh on kit state changes and guard against stale editor saves.

### MVP Guardrails

- No direct editing of shipped defaults.
- No hard delete in primary UI.
- No active policy or broad always-on activation without preview.
- No retiring an artifact while active activations reference it.
- No arbitrary file paths outside allowed roots.
- No markdown script execution in preview rendering.
- No webview direct SQLite mutation.

### MVP Acceptance Criteria

- A user can duplicate `cae.playbook.task-to-phase-branch` into a workspace artifact and edit the copied markdown.
- A user can create a new `workspace.playbook.*` artifact from scratch.
- A user can create a draft `do` activation that references the workspace artifact.
- A user can preview baseline vs draft impact.
- A user can activate the draft and see it in the active registry.
- A user can disable the activation and verify it no longer appears in preview output.
- A user can retire the artifact after references are cleared.
- All UI mutations produce audit rows.
- The dashboard shows clear validation errors for duplicate IDs, missing files, invalid refs, broad scopes, and stale registry state.
- The UI remains usable when CAE is disabled or SQLite is unavailable, showing repair guidance instead of a blank panel.

## MVP Task Breakdown

The MVP should be delivered as a vertical authoring slice, not as isolated backend and UI piles. Backend contracts should land before the dashboard depends on them, but each UI task should exercise real command output as soon as its supporting command exists.

### CAEUX-MVP-01 - Workspace Artifact Convention

**Goal:** Define the workspace-owned artifact file convention and ID namespace.

**Depends on:** None.

**Deliverables:**

- Document `.ai/cae/artifacts/<type>/<slug>.md` as the default workspace artifact path.
- Reserve `cae.*` for shipped defaults and `workspace.*` for user-created artifacts.
- Add helper functions for artifact type to directory mapping and slug validation.
- Add fixture examples for each supported artifact type.

**Acceptance:** New helpers reject traversal, absolute paths, unsupported artifact types, and invalid `workspace.*` IDs. Fixtures make the recommended layout obvious.

### CAEUX-MVP-02 - Authoring Source Classification

**Goal:** Teach the read model to classify CAE rows as default, workspace, override, hidden, retired, missing-file, or external-allowed.

**Depends on:** CAEUX-MVP-01.

**Deliverables:**

- Add source classification helpers for artifact rows and activation rows.
- Include file ownership status for every artifact reference.
- Include `registryDigest`, active version ID, and row lifecycle status in authoring payloads.

**Acceptance:** The same active registry can be rendered with stable source/status labels without reading raw SQLite in the extension.

### CAEUX-MVP-03 - `cae-authoring-summary` Read Command

**Goal:** Provide a single read-only dashboard contract for Guidance authoring.

**Depends on:** CAEUX-MVP-02.

**Deliverables:**

- Add `cae-authoring-summary` command.
- Return active version metadata, artifacts, activations, counts, validation warnings, recent mutations, and readiness status.
- Add schema or contract tests for the response shape.

**Acceptance:** Dashboard can render Overview, Artifacts, Activations, and Audit summary from this command alone, with no direct DB reads.

### CAEUX-MVP-04 - Mutation Staleness Contract

**Goal:** Prevent overwriting registry changes made from another dashboard, terminal, or agent session.

**Depends on:** CAEUX-MVP-03.

**Deliverables:**

- Require expected active version ID and/or expected registry digest on UI mutations.
- Return a stable stale-state error when expectations do not match.
- Include repair guidance in the error payload.

**Acceptance:** Opening an edit form, mutating the registry elsewhere, and saving from the stale form fails safely with a refreshable error.

### CAEUX-MVP-05 - Atomic Workspace Artifact Create

**Goal:** Create markdown content and the matching registry artifact row in one backend operation.

**Depends on:** CAEUX-MVP-01, CAEUX-MVP-04.

**Deliverables:**

- Add `cae-create-workspace-artifact`.
- Validate ID, type, slug, title, tags, path, and markdown body.
- Write the markdown file under `.ai/cae/artifacts/`.
- Insert the registry row through existing CAE registry primitives.
- Run post-mutation registry validation and audit the mutation.

**Acceptance:** A valid request creates exactly one file, exactly one registry row, and exactly one audit row. Invalid requests leave no partial file or registry row behind.

### CAEUX-MVP-06 - Atomic Workspace Artifact Update

**Goal:** Update workspace-owned artifact metadata and markdown content safely.

**Depends on:** CAEUX-MVP-05.

**Deliverables:**

- Add `cae-update-workspace-artifact`.
- Reject direct edits to default-owned artifacts.
- Support metadata updates and content updates.
- Return impacted activation refs and validation warnings.
- Audit each successful update.

**Acceptance:** Workspace artifacts can be edited from the UI contract, defaults cannot be edited in place, and broken paths/content are rejected before mutation.

### CAEUX-MVP-07 - Duplicate Default Artifact

**Goal:** Let users start from shipped defaults without mutating them.

**Depends on:** CAEUX-MVP-05.

**Deliverables:**

- Add `cae-duplicate-default-artifact`.
- Copy default artifact body into `.ai/cae/artifacts/<type>/`.
- Create a new `workspace.*` artifact row.
- Store source default ID and source content hash in metadata or audit payload.

**Acceptance:** Duplicating a default produces an editable workspace artifact and leaves the shipped default unchanged.

### CAEUX-MVP-08 - Retire Workspace Artifact And Hide Default

**Goal:** Provide safe non-destructive removal semantics for artifact rows.

**Depends on:** CAEUX-MVP-02, CAEUX-MVP-04.

**Deliverables:**

- Add `cae-retire-workspace-artifact`.
- Add `cae-hide-default-artifact` if the current layering model can represent suppression safely.
- Block retirement when active activations still reference the artifact unless an explicit supported cascade is provided.
- Keep backing files by default.

**Acceptance:** Artifact removal actions do not strand active activations, do not delete files by default, and are visible in audit history.

### CAEUX-MVP-09 - Draft Activation Create And Update

**Goal:** Add draft-first activation authoring commands.

**Depends on:** CAEUX-MVP-03, CAEUX-MVP-04.

**Deliverables:**

- Add `cae-create-draft-activation`.
- Add `cae-update-draft-activation`.
- Validate family, priority, lifecycle, scope, artifact refs, and acknowledgement.
- Compute broad-scope warnings for `always`, command prefix, and policy activations.
- Audit all successful draft mutations.

**Acceptance:** Users can create and revise draft activations without making them active Guidance.

### CAEUX-MVP-10 - Activation Disable And Retire Integrity

**Goal:** Expose safe lifecycle changes for active and draft activations.

**Depends on:** CAEUX-MVP-09.

**Deliverables:**

- Add or wrap disable/retire activation flows for UI use.
- Return affected artifact refs and current lifecycle state.
- Ensure disabled and retired activations no longer affect preview/evaluation.
- Audit lifecycle changes.

**Acceptance:** The UI can disable or retire an activation and immediately verify through preview that it no longer applies.

### CAEUX-MVP-11 - Preview Evidence And Draft Activation Publish

**Goal:** Promote drafts to active only after fresh preview evidence when risk requires it.

**Depends on:** CAEUX-MVP-09, CAEUX-MVP-10.

**Deliverables:**

- Add `cae-activate-draft-activation`.
- Accept preview evidence from `cae-guidance-preview` for broad or policy-impacting drafts.
- Revalidate scope, conflicts, artifact refs, and registry digest before activation.
- Create publish/checkpoint metadata where supported.
- Audit activation.

**Acceptance:** Broad or policy-like drafts cannot become active without preview evidence; narrow drafts still validate and audit cleanly.

### CAEUX-MVP-12 - Dashboard Guidance Panel Shell

**Goal:** Add a first-class editor-area Guidance authoring panel.

**Depends on:** CAEUX-MVP-03.

**Deliverables:**

- Add a dedicated editor-area command/view entry point for Guidance authoring.
- Render a stable shell with Overview, Artifacts, Activations, Preview, and compact Audit tabs.
- Back panel readiness and refresh from `cae-authoring-summary` rather than embedding ad hoc registry logic in the webview.
- Show actionable degraded states for disabled CAE, missing registry or DB, native SQLite failures, and registry validation failures.

**Acceptance:** Users can open a dedicated Guidance authoring panel and see authoring readiness without touching terminal commands; CRUD stays out of scope for this slice.

### CAEUX-MVP-13 - Overview Tab

**Goal:** Summarize CAE health, counts, active version, and entry actions.

**Depends on:** CAEUX-MVP-12.

**Deliverables:**

- Render a read-mostly overview card set over `cae-authoring-summary` showing enabled status, registry store, active version, artifact counts, activation counts, draft count, validation warnings, and recent mutation summary.
- Add bounded entry actions for New Artifact, New Activation, Preview Guidance, and Validate Registry.
- Keep the tab focused on readiness and navigation rather than in-tab authoring workflows.

**Acceptance:** The overview answers whether authoring is ready, what exists, and what action the user can take next.

### CAEUX-MVP-14 - Artifacts Table

**Goal:** Give users a scannable management surface for artifact rows and file refs.

**Depends on:** CAEUX-MVP-12.

**Deliverables:**

- Add a searchable and filterable artifacts table.
- Show title, ID, type, source, path, used-by count, status, and last changed when available.
- Enable row actions for Open, Preview, Duplicate, Edit, Retire, Hide Default, and Remove Override only when the source and lifecycle make the action valid.
- Keep editing and mutation confirmation work in downstream slices.

**Acceptance:** Defaults and workspace artifacts are visibly distinct and only valid row actions are enabled.

### CAEUX-MVP-15 - Artifact Editor

**Goal:** Let users create and edit workspace artifact metadata and markdown content.

**Depends on:** CAEUX-MVP-05, CAEUX-MVP-06, CAEUX-MVP-07, CAEUX-MVP-14.

**Deliverables:**

- Add a workspace-artifact editor for ID, type, title, tags, path, and fragment.
- Support markdown content editing or a bounded open-file workflow for workspace-owned files only.
- Add rendered or sanitized preview for the current workspace artifact draft.
- Wire create, update, duplicate, and retire entry points to existing backend commands without allowing direct default edits.
- Keep mutation confirmations, publish-style prompts, and cross-artifact recovery behavior out of scope.

**Acceptance:** A user can create a workspace artifact, edit it, preview it, and retire it without leaving the dashboard.

### CAEUX-MVP-16 - Activations Table

**Goal:** Give users a scannable management surface for CAE activation rows.

**Depends on:** CAEUX-MVP-12.

**Deliverables:**

- Add an activations table grouped by `policy`, `think`, `do`, and `review`.
- Show lifecycle, priority, scope summary, artifact refs, acknowledgement, source, and status warnings.
- Surface bounded row actions for Edit, Preview, Activate Draft, Disable, and Retire, plus Duplicate only if supported by the current backend contract.
- Keep editor logic, publish gating, and confirmation UX in downstream slices.

**Acceptance:** Users can see which rules drive Guidance and identify drafts, active rows, and risky scopes.

### CAEUX-MVP-17 - Activation Editor And Scope Builder

**Goal:** Let users author activation rows without raw JSON as the default path.

**Depends on:** CAEUX-MVP-09, CAEUX-MVP-16.

**Deliverables:**

- Add structured form fields for activation ID, family, priority, lifecycle, artifact refs, acknowledgement, and scope.
- Add preset controls for Always, command exact, command prefix, task tag, task ID pattern, phase key, and command arg equals.
- Add an artifact picker grouped by type with source and status badges.
- Add an advanced JSON drawer as an escape hatch rather than the default path.
- Keep activation publish, readiness verdicts, and confirmation UX in downstream slices.

**Acceptance:** Users can create a draft activation with structured controls, and invalid scope JSON cannot be saved.

### CAEUX-MVP-18 - Preview Tab And Readiness Verdict

**Goal:** Make activation impact understandable before publish.

**Depends on:** CAEUX-MVP-11, CAEUX-MVP-17.

**Deliverables:**

- Wire `cae-guidance-preview` with draft overlays from the activation editor.
- Show baseline vs draft Guidance cards, family count deltas, broad-scope warnings, conflict summary, pending acknowledgements, and sample matches.
- Show a bounded readiness verdict of OK, Warning, or Stop and confirm.
- Produce fresh preview evidence that downstream publish and confirmation flows can consume.
- Keep publish confirmation and mutation result UX out of scope.

**Acceptance:** Users can preview a draft and understand where it applies before activating it.

### CAEUX-MVP-19 - Mutation Confirmations And Toasts

**Goal:** Make state-changing UI actions explicit and recoverable.

**Depends on:** CAEUX-MVP-15, CAEUX-MVP-17, CAEUX-MVP-18.

**Deliverables:**

- Add confirmation flows for activation publish, disable, retire, hide default, and artifact retire.
- Capture `actor` and CAE mutation rationale where required by the backend contract.
- Add result toasts with follow-up actions such as Open File, Preview, View Audit, and Refresh.
- Keep the actual mutation logic in existing backend commands and the editor/table tasks that invoke them.

**Acceptance:** Mutations are not silent, and users can immediately inspect the result.

### CAEUX-MVP-20 - Stale State And Failure Handling

**Goal:** Keep the UI safe when registry state changes or infrastructure is unavailable.

**Depends on:** CAEUX-MVP-04, CAEUX-MVP-12.

**Deliverables:**

- Handle stale registry save failures with Refresh and Review Changes actions in the Guidance authoring surface.
- Render actionable degraded states for disabled CAE, JSON-store read-only mode, admin mutations off, missing DB or registry, and native SQLite load failures.
- Ensure forms and save affordances do not remain enabled after an unrecoverable authoring precondition fails.
- Keep this slice focused on authoring guardrails rather than backend recovery redesign.

**Acceptance:** Failure states are legible and actionable instead of blank or terminal-only, and unsafe saves are disabled once authoring preconditions fail.

### CAEUX-MVP-21 - MVP Backend Tests

**Goal:** Prove command behavior and mutation safety.

**Depends on:** CAEUX-MVP-05 through CAEUX-MVP-11.

**Deliverables:**

- Add backend command-contract tests for artifact create, update, duplicate, retire, and related authoring flows delivered by MVP-05 through MVP-08.
- Add backend command-contract tests for draft activation create, update, activate, disable, and retire flows delivered by MVP-09 through MVP-11.
- Add tests for validation, referential integrity, audit rows, stale registry errors, and partial-write rollback.
- Keep coverage bounded to delivered backend contracts rather than dashboard UI execution.

**Acceptance:** Backend tests cover successful command flows and the main mutation-safety failures without relying on dashboard UI.

### CAEUX-MVP-22 - MVP Dashboard Tests

**Goal:** Prove the dashboard renders and drives the authoring loop.

**Depends on:** CAEUX-MVP-12 through CAEUX-MVP-20.

**Deliverables:**

- Add render tests for empty, healthy, warning, disabled, and SQLite failure states.
- Add message-handler tests for the supported create, update, preview, activate, disable, and retire entry points exposed by the panel.
- Add a bounded manual or automated webview smoke path for the MVP authoring loop.
- Keep coverage focused on panel rendering and message handling rather than duplicating backend command-contract tests.

**Acceptance:** The UI can be validated without manually inspecting every screen after each change.

### CAEUX-MVP-23 - Operator Docs And Release Gate

**Goal:** Make the MVP operable and releasable.

**Depends on:** CAEUX-MVP-21, CAEUX-MVP-22.

**Deliverables:**

- Add or update operator docs for Guidance authoring.
- Document recovery from stale state, missing files, invalid refs, disabled mutations, and the major degraded states surfaced by the authoring panel.
- Add a release evidence checklist or smoke path for CAE authoring.
- Keep this slice focused on operability guidance and release readiness rather than product behavior changes.

**Acceptance:** A maintainer can run the MVP smoke path and recover from expected failure modes using checked-in guidance.

## Second Phase: Feature Complete

### Goal

Make CAE authoring durable, shareable, recoverable, and comfortable for long-term workspace use.

### Storage And Versioning

- Named registry checkpoints.
- Version comparison.
- Rollback UI.
- Reset-to-default flow.
- Default update reconciliation.
- Workspace override diffing.
- Import/export of guidance packs.

### Artifact Management

- Safe rename and move for workspace artifact files.
- Archive retired files by default.
- Detect orphan files under `.ai/cae/artifacts/`.
- Detect registry rows pointing to missing files.
- Add markdown validation and render checks.
- Add starter templates per artifact type.
- Add duplicate-from-any-artifact, not only defaults.

### Activation Authoring

- Richer scope builder with multiple AND conditions.
- Conflict assistant for family priority and specificity ties.
- Activation cloning.
- Bulk disable and retire.
- Match explanation per sample.
- Suggested priority ranges by family.
- Preview against larger bounded task/workflow samples.

### Governance

- Replace `kit.cae.adminMutations` break-glass posture with a product-friendly permission model.
- Support separate draft author and activation publisher roles if needed.
- Keep global `policyApproval` separate from CAE mutation approval.
- Add clearer approval prompts only at publish or activation time.

### Dashboard UX

- Full diff view for default vs override.
- Audit timeline with filters.
- Recent guidance changes card.
- Toast actions for Open file, Preview, Roll back, and View audit.
- Better empty states for no workspace customizations.
- Guided onboarding for first custom artifact.

### Testing And Release

- Backend tests for atomic file + registry commands.
- Registry validation tests for new workspace artifact paths.
- Extension rendering tests for empty, healthy, warning, and failure states.
- Webview workflow smoke tests for create, preview, activate, disable, retire, and rollback.
- Migration tests for registries created before workspace artifact files existed.
- Recovery runbook for broken Guidance authoring state.

## Second Phase Task Breakdown

The second phase should start after the MVP authoring loop is usable and audited. Its job is to make CAE authoring durable across upgrades, portable across workspaces, and pleasant for larger guidance sets.

### CAEUX-P2-01 - Named Registry Checkpoints

**Goal:** Make publish boundaries explicit and rollback-friendly.

**Depends on:** CAEUX-MVP-11.

**Deliverables:**

- Add named checkpoint creation at publish time.
- Store checkpoint label, actor, note, active version ID, registry digest, and mutation IDs.
- Expose checkpoints in read models.

**Acceptance:** Users can identify meaningful restore points rather than only raw mutation rows.

### CAEUX-P2-02 - Registry Version Compare Backend

**Goal:** Compare two registry versions or a default version against workspace state.

**Depends on:** CAEUX-P2-01.

**Deliverables:**

- Add `cae-compare-registry-versions`.
- Report added, removed, changed, hidden, retired, and conflicting artifact and activation rows.
- Include file content hash differences for workspace artifacts where available.

**Acceptance:** The UI can show meaningful diffs without reconstructing registry semantics client-side.

### CAEUX-P2-03 - Rollback And Reset Backend

**Goal:** Restore known-good CAE state safely.

**Depends on:** CAEUX-P2-01, CAEUX-P2-02.

**Deliverables:**

- Add rollback to checkpoint or version.
- Add reset-to-default flow.
- Validate current digest before rollback.
- Preserve audit trail for rollback operations.

**Acceptance:** A user can revert a bad Guidance change and inspect what changed.

### CAEUX-P2-04 - Default Reconciliation Backend

**Goal:** Handle new or changed shipped defaults after package upgrades.

**Depends on:** CAEUX-MVP-07, CAEUX-P2-02.

**Deliverables:**

- Add `cae-reconcile-defaults` read model.
- Detect new defaults, changed defaults, hidden defaults, and workspace clones from older default hashes.
- Return recommended actions: keep workspace, adopt default, compare, or duplicate newer default.

**Acceptance:** Package updates do not leave users guessing whether their guidance is stale.

### CAEUX-P2-05 - Guidance Pack Import And Export

**Goal:** Make custom Guidance portable between workspaces.

**Depends on:** CAEUX-P2-02.

**Deliverables:**

- Add export command for selected workspace artifacts and activations.
- Add import command with dry-run diff and conflict detection.
- Include markdown files, registry rows, activation rows, metadata, and checksums.

**Acceptance:** Users can share a guidance pack and import it without overwriting local customizations unexpectedly.

### CAEUX-P2-06 - Artifact File Rename, Move, And Archive

**Goal:** Manage workspace artifact files safely after creation.

**Depends on:** CAEUX-MVP-06, CAEUX-MVP-08.

**Deliverables:**

- Add safe rename/move command for workspace-owned files.
- Update registry refs atomically with file moves.
- Add archive command for retired artifact files.
- Keep hard delete behind advanced confirmation.

**Acceptance:** Users can reorganize workspace artifacts without breaking registry refs.

### CAEUX-P2-07 - Orphan And Broken Reference Detection

**Goal:** Find files and rows that no longer line up.

**Depends on:** CAEUX-P2-06.

**Deliverables:**

- Add orphan file scan under `.ai/cae/artifacts/`.
- Add broken ref scan for missing files and invalid fragments.
- Add repair suggestions for each finding.

**Acceptance:** The dashboard can surface and repair drift between artifact files and registry rows.

### CAEUX-P2-08 - Artifact Templates And Markdown Validation

**Goal:** Improve artifact quality and safe preview rendering.

**Depends on:** CAEUX-MVP-15.

**Deliverables:**

- Add starter templates per artifact type.
- Add markdown lint or structural validation for headings and empty content.
- Add sanitized render checks for dashboard preview.

**Acceptance:** Newly created artifacts have useful shape and unsafe preview content is blocked or sanitized.

### CAEUX-P2-09 - Duplicate Any Artifact And Override Diff

**Goal:** Let users clone from any artifact and understand workspace overrides.

**Depends on:** CAEUX-MVP-07, CAEUX-P2-02.

**Deliverables:**

- Add duplicate-from-any-artifact support.
- Track source artifact ID and content hash for clones.
- Add default vs workspace override diff payloads.

**Acceptance:** Users can fork existing workspace or default guidance and inspect what diverged.

### CAEUX-P2-10 - Rich Scope Builder

**Goal:** Support complex activation scopes without forcing raw JSON.

**Depends on:** CAEUX-MVP-17.

**Deliverables:**

- Add multiple AND conditions in the visual scope builder.
- Add condition reordering, duplication, and deletion.
- Add inline plain-language scope summary.

**Acceptance:** Users can express multi-condition scopes through structured controls and still inspect generated JSON.

### CAEUX-P2-11 - Conflict Assistant

**Goal:** Help users resolve family, priority, specificity, and artifact conflicts.

**Depends on:** CAEUX-MVP-18, CAEUX-P2-10.

**Deliverables:**

- Add conflict explanation for same-family ties and policy-over-advisory collisions.
- Suggest priority or scope changes.
- Link conflicts to affected activations and artifacts.

**Acceptance:** Users can understand why an activation is shadowed, blocked, or losing precedence.

### CAEUX-P2-12 - Activation Cloning And Bulk Lifecycle Actions

**Goal:** Make larger activation sets manageable.

**Depends on:** CAEUX-MVP-16, CAEUX-MVP-17.

**Deliverables:**

- Add activation clone action.
- Add bulk disable, retire, and draft lifecycle actions.
- Add bulk confirmation with affected artifact and preview summary.

**Acceptance:** Users can manage related activation groups without repetitive single-row edits.

### CAEUX-P2-13 - Expanded Preview Samples And Match Explanation

**Goal:** Make preview representative enough for real confidence.

**Depends on:** CAEUX-MVP-18.

**Deliverables:**

- Add broader bounded task and workflow samples.
- Explain why each activation matched or did not match a sample.
- Show sample category tallies and top matched contexts.

**Acceptance:** Users can judge blast radius across realistic workspace workflows.

### CAEUX-P2-14 - Product Permission Model

**Goal:** Replace break-glass admin mutation posture with product-ready permissions.

**Depends on:** CAEUX-MVP-19.

**Deliverables:**

- Define roles or capabilities for draft edit, publish, rollback, import, and destructive actions.
- Keep CAE mutation approval separate from global `policyApproval`.
- Add user-facing prompts aligned with those capabilities.

**Acceptance:** The dashboard no longer relies on a raw `kit.cae.adminMutations` mental model for normal authoring.

### CAEUX-P2-15 - Optional Draft Review And Publish Flow

**Goal:** Support teams that want separation between authoring and publishing.

**Depends on:** CAEUX-P2-14.

**Deliverables:**

- Add review-ready lifecycle or metadata.
- Add publish approval prompt and audit payload.
- Add dashboard filters for drafts needing review.

**Acceptance:** Teams can review CAE changes before activation without external spreadsheets or ad hoc notes.

### CAEUX-P2-16 - Versions And Audit UI

**Goal:** Turn audit/version data into a practical recovery surface.

**Depends on:** CAEUX-P2-01, CAEUX-P2-02, CAEUX-P2-03.

**Deliverables:**

- Add full Versions / Audit tab.
- Show checkpoint list, active version, mutation timeline, actor, command, note, and affected rows.
- Add compare and rollback actions.

**Acceptance:** Users can answer what changed, who changed it, and how to roll it back.

### CAEUX-P2-17 - Default Reconciliation UI

**Goal:** Present package default changes as manageable choices.

**Depends on:** CAEUX-P2-04, CAEUX-P2-16.

**Deliverables:**

- Add changed-defaults review screen.
- Show default vs workspace clone diff.
- Offer keep, adopt, duplicate newer default, or continue hiding.

**Acceptance:** Users can upgrade Workflow Cannon defaults without losing or unknowingly bypassing workspace choices.

### CAEUX-P2-18 - Import Export UI

**Goal:** Make guidance packs usable without terminal JSON.

**Depends on:** CAEUX-P2-05, CAEUX-P2-16.

**Deliverables:**

- Add export wizard for selected artifacts/activations.
- Add import dry-run UI with conflicts and target namespace choices.
- Add post-import preview and audit links.

**Acceptance:** Users can move Guidance between workspaces and review every imported change before applying it.

### CAEUX-P2-19 - Guidance Onboarding And Empty States

**Goal:** Make first-time customization approachable.

**Depends on:** CAEUX-MVP-13, CAEUX-MVP-15, CAEUX-MVP-17.

**Deliverables:**

- Add first custom artifact guide.
- Add empty workspace customization state.
- Add recommended starter templates and duplicate-from-default suggestions.

**Acceptance:** A new user can discover how to create useful Guidance without reading implementation docs first.

### CAEUX-P2-20 - Feature-Complete Test Matrix

**Goal:** Cover advanced authoring, recovery, and portability behavior.

**Depends on:** CAEUX-P2-01 through CAEUX-P2-19.

**Deliverables:**

- Add backend tests for checkpoints, compare, rollback, import/export, reconciliation, rename/archive, and orphan repair.
- Add dashboard tests for Versions / Audit, diffs, rollback, import/export, reconciliation, and bulk lifecycle actions.
- Add migration tests for older CAE registries.

**Acceptance:** The feature-complete phase can be released with confidence that recovery and portability paths work.

### CAEUX-P2-21 - Feature-Complete Docs And Recovery Runbook

**Goal:** Make the expanded product surface operable.

**Depends on:** CAEUX-P2-20.

**Deliverables:**

- Document authoring workflows, versioning, rollback, import/export, reconciliation, and permissions.
- Add recovery runbook for broken Guidance authoring state.
- Update dashboard README or operator guidance with the full UX scope.

**Acceptance:** Maintainers and users have checked-in instructions for normal use and recovery.

## Remaining Gaps To Plan For

### Default Reconciliation

MVP can clone defaults and prevent direct edits, but package upgrades need a future reconciliation flow. Plan now for metadata that records the source default artifact ID and source content hash when duplicating.

### Suppression Semantics

Hiding a default needs a precise storage model. Decide whether hidden defaults are represented by suppression metadata or retired overlay rows. Suppression metadata is cleaner for layered defaults; retired overlay rows are easier if defaults are imported into the active registry.

### Registry Version Boundaries

Decide whether activation publish always creates a named registry version or only records a mutation. The recommended approach is audit every save and checkpoint on activation/publish.

### Concurrency

The dashboard should include active version and registry digest in edit forms. Saves should fail with a clear stale-state error if another process changed the registry.

### File Ownership

The UI must know whether a file is default-owned, workspace-owned, missing, external-but-allowed, or orphaned. This should be part of `cae-authoring-summary`.

### Permission Model

The current `kit.cae.adminMutations` gate is appropriate for operator/admin flows but awkward for a product authoring UI. MVP may retain it, but feature-complete UX should define a clearer permission model.

### Physical Deletion

Physical deletion should remain advanced. Plan an archive model before exposing hard delete broadly.

### Markdown Rendering Safety

The dashboard renderer must sanitize markdown preview output. Artifact markdown should never execute scripts or command actions.

### Multi-Root And Wrong-Root Handling

The extension should show which workspace root owns the registry. It should refuse to author when the active root does not contain the expected workspace-kit files.

## Implementation Order

1. Define workspace artifact path convention and ID namespace rules.
2. Add `cae-authoring-summary` read model.
3. Add high-level create/update/duplicate/retire artifact commands.
4. Add high-level draft activation and activate commands.
5. Add backend validation and audit coverage.
6. Add dashboard Guidance panel shell and Overview tab.
7. Add Artifacts table and editor.
8. Add Activations table and editor.
9. Add Preview tab with draft overlay integration.
10. Add stale-state, disabled-CAE, and SQLite failure handling.
11. Add MVP tests and operator docs.
12. Start second-phase version compare, rollback, import/export, and reconciliation work.

## Non-Goals For MVP

- Full import/export guidance packs.
- Rich default upgrade reconciliation.
- Physical file deletion as a common path.
- Multi-user role management.
- Arbitrary artifact storage outside the recommended workspace folder.
- Editing shipped defaults directly.
- Raw JSON-only authoring UI.

## Success Standard

This plan is complete when the dashboard can function as a first-class CAE authoring surface rather than a registry inspector. Users should be able to understand what Guidance exists, create their own artifacts, connect them to activation rules, preview when those rules will apply, activate them confidently, and recover when a change was wrong.

The MVP should feel safe and useful for real workspace customization. The second phase should make that customization portable, comparable, reversible, and comfortable at scale.