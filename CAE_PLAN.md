CAE Registry Migration Plan — SQLite Runtime Source of Truth

Purpose

Move the CAE registry from repo JSON files to SQLite as the authoritative runtime source of truth, and expose a complete admin-oriented CLI surface for managing CAE artifacts and activations.

This plan is intentionally not backward-compatible. We are optimizing for a cleaner architecture from the current repo state, not preserving old workflows.

Decisions already made

These are fixed unless explicitly changed by the user:
	•	Authoritative registry storage: SQLite only
	•	Primary operators: developers
	•	Edit model: live edits may affect runtime immediately
	•	Evaluation target: latest active registry is acceptable
	•	Concurrency model: single operator for now
	•	Artifact model: artifacts remain file references only
	•	Governance: separate CAE governance lane, not Tier A/B policyApproval
	•	Offline portability: not important
	•	UI scope later: admin editing only
	•	History model: versioned snapshots are sufficient
	•	Backward compatibility: not required

Current repo state to assume

From the current CAE implementation:
	•	CAE registry is currently stored in JSON:
	•	.ai/cae/registry/artifacts.v1.json
	•	.ai/cae/registry/activations.v1.json
	•	Loader logic currently reads and validates those JSON files.
	•	CAE traces and ack satisfaction already persist in the kit SQLite DB.
	•	CLI already has read-oriented CAE commands and a limited mutating path for cae-satisfy-ack.
	•	Artifacts are references to repo files, not embedded content.  ￼

Target architecture

New source of truth

The CAE registry lives in SQLite inside the existing kit DB.

The JSON registry files stop being authoritative and are removed from the runtime path.

What remains file-based

Artifacts continue to reference files on disk by path.
The DB stores artifact metadata and activation rules, not document bodies.

Runtime lookup model

CAE evaluation resolves against the latest active registry version.

No draft/publish workflow is required in v1 of this migration.

Versioning model

Registry changes are versioned in SQLite as snapshots sufficient for rollback and inspection.

Row history is not required beyond versioned state.

Non-goals
	•	No backward-compatible dual-loader mode
	•	No file-registry fallback
	•	No end-user UI
	•	No artifact-body storage in SQLite
	•	No multi-operator locking workflow beyond what SQLite already provides
	•	No Git/PR registry workflow as a required runtime path

⸻

Implementation strategy

Summary

The agent should open tasks to do the following, in order:
	1.	Introduce SQLite registry schema
	2.	Add registry data access layer
	3.	Migrate current JSON registry into SQLite
	4.	Switch evaluator/runtime to SQLite-backed registry loading
	5.	Replace CLI read endpoints to use SQLite
	6.	Add full admin mutation CLI
	7.	Add CAE-specific governance rules
	8.	Add version snapshot and rollback support
	9.	Remove JSON registry from authoritative runtime path
	10.	Update docs and tests

⸻

Task breakdown

Epic 1 — Registry storage model in SQLite

Goal

Create a relational CAE registry model in the existing kit DB.

Tasks

Task A1 — Define SQLite schema for CAE registry
Create migrations for tables such as:
	•	cae_registry_versions
	•	cae_registry_artifacts
	•	cae_registry_activations

Suggested minimum fields:

cae_registry_versions
	•	version_id
	•	created_at
	•	created_by
	•	is_active
	•	note

cae_registry_artifacts
	•	version_id
	•	artifact_id
	•	artifact_type
	•	path
	•	title
	•	description
	•	metadata_json
	•	retired_at nullable

cae_registry_activations
	•	version_id
	•	activation_id
	•	family
	•	priority
	•	lifecycle_state
	•	scope_json
	•	artifact_refs_json
	•	acknowledgement_json
	•	metadata_json
	•	retired_at nullable

Constraints to add:
	•	uniqueness on (version_id, artifact_id)
	•	uniqueness on (version_id, activation_id)
	•	foreign key integrity from activation artifact refs handled in validation layer

Task A2 — Extend kit SQLite migration ladder
Add CAE registry tables through the central migration chain in src/core/state/workspace-kit-sqlite.ts.

Do not create ad hoc DB initialization outside the kit migration path.

Task A3 — Add DB helpers
Extend src/core/cae/cae-kit-sqlite.ts or add adjacent files for:
	•	load latest active registry version
	•	load artifacts by version
	•	load activations by version
	•	activate a version
	•	create a new version
	•	replace version contents
	•	rollback active version

⸻

Epic 2 — SQLite-backed registry loader

Goal

Replace the file-based registry loader with a SQLite-backed loader.

Tasks

Task B1 — Create CAE registry repository layer
Add a dedicated module, for example:
	•	src/core/cae/cae-registry-sqlite.ts

Responsibilities:
	•	read active version
	•	assemble runtime registry object
	•	validate structural completeness
	•	return the same effective in-memory shape expected by evaluator where practical

Task B2 — Replace current loader entrypoint
Refactor src/core/cae/cae-registry-load.ts so it no longer treats JSON files as the authoritative registry source.

Preferred end state:
	•	loadCaeRegistry(...) reads from SQLite
	•	file existence checks remain only for artifact path validation

Task B3 — Strengthen registry digest
Replace current digest behavior based on sorted IDs with a stronger content-based digest computed from normalized row content.

This digest should include:
	•	active version id
	•	normalized artifact rows
	•	normalized activation rows

⸻

Epic 3 — One-time migration from JSON to SQLite

Goal

Import the current CAE registry into SQLite and make that the live registry.

Tasks

Task C1 — Build import command
Add a one-time or operator-usable CLI command such as:
	•	cae-import-json-registry

Inputs:
	•	current .ai/cae/registry/artifacts.v1.json
	•	current .ai/cae/registry/activations.v1.json

Behavior:
	•	validate current JSON via existing schema logic
	•	create a new SQLite registry version
	•	insert all rows
	•	mark that version active

Task C2 — Add artifact path verification during import
Ensure imported artifact paths still exist where required.

Task C3 — Remove runtime dependency on JSON registry after import
After import succeeds and tests pass, JSON registry should no longer be used by CAE evaluation.

JSON files may remain temporarily only as migration source or fixtures, but not as runtime authority.

⸻

Epic 4 — Full admin CLI for registry management

Goal

Expose a complete CLI surface for developer/admin management of CAE registry state.

Tasks

Task D1 — Add artifact admin commands
Add commands such as:
	•	cae-list-artifacts
	•	cae-get-artifact
	•	cae-create-artifact
	•	cae-update-artifact
	•	cae-retire-artifact

Task D2 — Add activation admin commands
Add commands such as:
	•	cae-list-activations
	•	cae-get-activation
	•	cae-create-activation
	•	cae-update-activation
	•	cae-disable-activation
	•	cae-retire-activation

Task D3 — Add version management commands
Add commands such as:
	•	cae-list-registry-versions
	•	cae-get-registry-version
	•	cae-create-registry-version
	•	cae-clone-registry-version
	•	cae-activate-registry-version
	•	cae-delete-registry-version
	•	cae-rollback-registry-version

Task D4 — Add validation command
Add:
	•	cae-validate-registry

This should validate the active registry or a specified version for:
	•	duplicate ids
	•	bad artifact references
	•	invalid lifecycle state
	•	invalid scope shapes
	•	invalid ack config
	•	missing referenced file paths where applicable

Task D5 — Keep current evaluation/explain commands
Ensure these continue to work against SQLite-backed registry:
	•	cae-evaluate
	•	cae-explain
	•	cae-health
	•	cae-conflicts
	•	cae-get-trace

⸻

Epic 5 — CAE governance lane

Goal

Add a separate governance model for CAE mutation, distinct from existing Tier A/B policy approval.

Tasks

Task E1 — Define CAE mutation policy
Add a CAE-specific governance doc and implementation rule set.

Suggested initial rule:
	•	CAE mutation commands are allowed only when kit.cae.enabled is true and CAE admin mode is enabled
	•	commands require a CAE-specific confirmation structure, not generic policyApproval

Task E2 — Add CAE mutation gate in CLI manifest/router
Each mutating CAE registry command should be explicitly marked as CAE-admin mutating.

Task E3 — Add audit fields
Every mutation should record:
	•	actor
	•	timestamp
	•	command
	•	affected version id
	•	note/reason if provided

This can go in version metadata rather than full per-row history.

⸻

Epic 6 — Evaluator/runtime integration cleanup

Goal

Ensure all runtime paths consume the SQLite registry correctly.

Tasks

Task F1 — Update preflight and run pipeline
Ensure:
	•	runCaeCliPreflight
	•	evaluator calls
	•	command result merging
all use the SQLite-backed active registry.

Task F2 — Verify enforcement lane compatibility
Ensure enforcement allowlist and activation matching still operate correctly once registry comes from SQLite.

Task F3 — Verify advisory surfacing compatibility
Ensure agent instruction surface continues to work with the new registry source.

⸻

Epic 7 — Documentation and deprecation cleanup

Goal

Make the new architecture explicit and remove ambiguity.

Tasks

Task G1 — Rewrite CAE docs
Update:
	•	CAE_PLAN.md
	•	.ai/cae/README.md
	•	persistence ADRs
	•	mutation governance docs
	•	debug/operator docs

New docs should state clearly:
	•	SQLite is the authoritative CAE registry source
	•	artifacts remain file references
	•	JSON registry is no longer runtime authority

Task G2 — Deprecate or remove JSON registry docs
Remove or rewrite references that imply:
	•	.ai/cae/registry/*.json is authoritative at runtime
	•	Git/PR is the default registry editing model

Task G3 — Decide fate of JSON files
Since backward compatibility is not needed, preferred path is:
	•	remove them from runtime docs
	•	keep only as test fixtures or migration seed, if still useful

⸻

Epic 8 — Test coverage

Goal

Cover the new storage and mutation model properly.

Tasks

Task H1 — Migration tests
Test importing current JSON registry into SQLite.

Task H2 — Loader tests
Test active-version loading, digest generation, and malformed DB rows.

Task H3 — CLI CRUD tests
Test create/update/retire/activate/rollback flows.

Task H4 — Evaluator regression tests
Ensure the same activation semantics still hold after registry source changes.

Task H5 — Governance tests
Test CAE mutation gating and rejected unauthorized mutations.

Task H6 — Health/doctor tests
Add CAE registry health checks to doctor and CAE health output.

⸻

Suggested execution order

The agent should create and sequence tasks in this order:
	1.	Schema + migration
	2.	SQLite registry repository
	3.	JSON import command
	4.	Switch loadCaeRegistry to SQLite
	5.	Content-based registry digest
	6.	Read CLI commands on SQLite
	7.	Mutating artifact/activation/version CLI
	8.	CAE-specific governance
	9.	Rollback/version activation
	10.	Docs rewrite
	11.	Cleanup old JSON authority
	12.	Full regression test pass

⸻

Acceptance criteria

This migration is complete when all of the following are true:
	•	CAE evaluation no longer depends on .ai/cae/registry/*.json
	•	Active CAE registry is loaded entirely from SQLite
	•	Artifact rows still point to files, not embedded content
	•	CLI supports full admin management of artifacts, activations, and registry versions
	•	Registry changes can be versioned and rolled back
	•	CAE mutation uses a separate governance lane
	•	Docs consistently describe SQLite as authoritative
	•	Tests cover migration, loading, mutation, evaluation, and rollback

⸻

Instructions to the agent opening the work

Open implementation tasks from the current repo state, not from a greenfield assumption.

When creating tasks:
	•	treat existing JSON registry loader and files as the source to migrate away from
	•	treat existing SQLite trace/ack infrastructure as the architectural anchor to build on
	•	do not preserve backward compatibility
	•	do not design for end-user UI yet
	•	do not move artifact bodies into SQLite
	•	do not introduce a parallel CAE database
	•	do not add Git-based registry editing as a required runtime workflow

Open the tasks as a coherent implementation wave, with clear dependencies and minimal ambiguity.

Use this plan as the source of truth for that wave.