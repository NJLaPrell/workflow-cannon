meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=architecture_overview|scope=repo
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=module_build|path=.ai/module-build.md
ref|name=roadmap|path=docs/maintainers/ROADMAP.md
ref|name=tasks_engine_state|path=.workspace-kit/tasks/state.json
ref|name=tasks_view|path=docs/maintainers/TASKS.md
ref|name=releasing|path=docs/maintainers/RELEASING.md
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

intent|Workflow Cannon is a modular developer workflow platform for safe, reproducible, package-first automation with deterministic outcomes, evidence capture, and human-governed improvement loops.

direction|D001|modular_capability_system_with_explicit_contracts_dependency_graphs_and_command_dispatch|st=active|refs=src/contracts/module-contract.ts,src/core/module-registry.ts,src/core/module-command-router.ts
direction|D002|structured_task_engine_with_typed_schemas_lifecycle_transitions_and_pluggable_adapters|st=active|refs=.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md
direction|D003|deterministic_configuration_and_policy_evaluation_with_explainable_precedence|st=planned|refs=docs/maintainers/ROADMAP.md
direction|D004|human_governed_enhancement_loop_with_evidence_backed_recommendations|st=planned|refs=docs/maintainers/ROADMAP.md
direction|D005|package_first_delivery_with_parity_validation_and_release_blocking_evidence|st=active|refs=scripts/run-parity.mjs,schemas/parity-evidence.schema.json
direction|D006|safe_by_default_automation_with_dry_run_diff_and_rollback|st=active|refs=.ai/PRINCIPLES.md
direction|D007|observability_and_supportability_as_first_class_design_constraints|st=planned|refs=docs/maintainers/ROADMAP.md

block|B001|name=module_registry|role=dependency_graph_validation_and_startup_ordering|path=src/core/module-registry.ts|st=active
block|B002|name=module_command_router|role=command_discovery_alias_resolution_and_dispatch|path=src/core/module-command-router.ts|st=active
block|B003|name=documentation_module|role=template_driven_paired_ai_and_human_doc_generation|path=src/modules/documentation|st=active
block|B004|name=task_engine|role=core_schema_lifecycle_transitions_and_task_type_adapters|path=src/modules/task-engine|st=active|phase=1
block|B005|name=configuration_registry|role=typed_config_with_deterministic_precedence|st=planned|phase=2
block|B006|name=policy_engine|role=approval_gates_decision_traces_and_migration_orchestration|st=planned|phase=2
block|B007|name=enhancement_engine|role=recommendation_intake_evidence_generation_and_artifact_lineage|st=planned|phase=3

principle|P001|safety_and_trustworthiness_over_speed_and_convenience|refs=.ai/PRINCIPLES.md
principle|P002|deterministic_behavior_for_supported_workflows|refs=.ai/PRINCIPLES.md
principle|P003|backward_compatible_evolution_with_explicit_migration_paths|refs=.ai/PRINCIPLES.md
principle|P004|clear_boundaries_between_canonical_ai_docs_generated_human_docs_and_runtime_state|refs=.ai/PRINCIPLES.md
principle|P005|evidence_backed_decisions_and_auditable_provenance|refs=.ai/PRINCIPLES.md
principle|P006|incremental_reversible_changes_over_broad_rewrites|refs=.ai/PRINCIPLES.md
