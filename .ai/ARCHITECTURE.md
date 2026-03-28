meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=architecture_overview|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=module_build|target=.ai/module-build.md|type=file|status=active
ref|id=roadmap|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

intent|slot1=Workflow Cannon is a modular developer workflow platform for safe, reproducible, package-first automation with deterministic outcomes, evidence capture, and human-governed improvement loops.

direction|slot1=D001|slot2=modular_capability_system_with_explicit_contracts_dependency_graphs_and_command_dispatch|status=active|refs=src/contracts/module-contract.ts,src/core/module-registry.ts,src/core/module-command-router.ts
direction|slot1=D002|slot2=structured_task_engine_with_typed_schemas_lifecycle_transitions_and_pluggable_adapters|status=active|refs=.workspace-kit/tasks/state.json
direction|slot1=D003|slot2=deterministic_configuration_and_policy_evaluation_with_explainable_precedence|status=planned|refs=docs/maintainers/ROADMAP.md
direction|slot1=D004|slot2=human_governed_enhancement_loop_with_evidence_backed_recommendations|status=planned|refs=docs/maintainers/ROADMAP.md
direction|slot1=D005|slot2=package_first_delivery_with_parity_validation_and_release_blocking_evidence|status=active|refs=scripts/run-parity.mjs,schemas/parity-evidence.schema.json
direction|slot1=D006|slot2=safe_by_default_automation_with_dry_run_diff_and_rollback|status=active|refs=.ai/PRINCIPLES.md
direction|slot1=D007|slot2=observability_and_supportability_as_first_class_design_constraints|status=planned|refs=docs/maintainers/ROADMAP.md

block|slot1=B001|name=module_registry|role=dependency_graph_validation_and_startup_ordering|target=src/core/module-registry.ts|status=active
block|slot1=B002|name=module_command_router|role=command_discovery_alias_resolution_and_dispatch|target=src/core/module-command-router.ts|status=active
block|slot1=B003|name=documentation_module|role=template_driven_paired_ai_and_human_doc_generation|target=src/modules/documentation|status=active
block|slot1=B004|name=task_engine|role=core_schema_lifecycle_transitions_and_task_type_adapters|target=src/modules/task-engine|status=active|phase=1
block|slot1=B005|name=configuration_registry|role=typed_config_with_deterministic_precedence|status=planned|phase=2
block|slot1=B006|name=policy_engine|role=approval_gates_decision_traces_and_migration_orchestration|status=planned|phase=2
block|slot1=B007|name=enhancement_engine|role=recommendation_intake_evidence_generation_and_artifact_lineage|status=planned|phase=3

principle|slot1=P001|slot2=safety_and_trustworthiness_over_speed_and_convenience|refs=.ai/PRINCIPLES.md
principle|slot1=P002|slot2=deterministic_behavior_for_supported_workflows|refs=.ai/PRINCIPLES.md
principle|slot1=P003|slot2=backward_compatible_evolution_with_explicit_migration_paths|refs=.ai/PRINCIPLES.md
principle|slot1=P004|slot2=clear_boundaries_between_canonical_ai_docs_generated_human_docs_and_runtime_state|refs=.ai/PRINCIPLES.md
principle|slot1=P005|slot2=evidence_backed_decisions_and_auditable_provenance|refs=.ai/PRINCIPLES.md
principle|slot1=P006|slot2=incremental_reversible_changes_over_broad_rewrites|refs=.ai/PRINCIPLES.md
