meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=glossary|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=roadmap|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active
ref|id=cae_architecture_adr|target=.ai/adrs/ADR-context-activation-engine-architecture-v1.md|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

usage|slot1=prefer_these_terms_in_docs_tasks_prs_and_release_notes
usage|slot1=add_new_terms_here_before_broad_adoption
usage|slot1=keep_definitions_operational_and_project_specific
usage|slot1=one_primary_definition_source_per_term

surface|slot1=S001|name=canonical_glossary|target=docs/maintainers/TERMS.md|role=primary_definitions
surface|slot1=S002|name=canonical_principles|target=.ai/PRINCIPLES.md|role=goals_and_decision_rules
surface|slot1=S003|name=project_intent|paths=README.md,docs/maintainers/ROADMAP.md,docs/maintainers/ARCHITECTURE.md|role=boundaries_and_direction
surface|slot1=S004|name=execution|paths=.workspace-kit/tasks/state.json|role=task_engine_queue_and_generated_human_view
surface|slot1=S005|name=operational|paths=docs/maintainers/RELEASING.md,docs/maintainers/|role=runbooks_and_playbooks
surface|slot1=S006|name=agent_enforcement|target=.cursor/rules/*.mdc|role=editor_agent_layer
surface|slot1=S007|name=agent_task_templates|target=tasks/*.md|role=reusable_task_templates

term|name=directive|definition=high_level_intent_telling_agent_what_outcome_to_optimize_for|defined_in=docs/maintainers/TERMS.md,README.md,docs/maintainers/ROADMAP.md|enforced_in=.cursor/rules/
term|name=goal|definition=desired_project_outcome_for_evaluating_progress_and_direction|defined_in=.ai/PRINCIPLES.md,README.md|enforced_in=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json
term|name=principle|definition=cross_cutting_decision_rule_for_trade_offs|defined_in=.ai/PRINCIPLES.md|enforced_in=.cursor/rules/project-principles.mdc
term|name=rule|definition=mandatory_constraint_must_or_must_not|defined_in=docs/maintainers/TERMS.md|enforced_in=.cursor/rules/*.mdc
term|name=guardrail|definition=safety_boundary_limiting_risky_behavior_while_allowing_progress|defined_in=docs/maintainers/TERMS.md,docs/maintainers/RELEASING.md|enforced_in=.cursor/rules/*.mdc,release_gates
term|name=policy|definition=decision_framework_for_allowed_denied_or_approval_gated_actions|defined_in=docs/maintainers/TERMS.md,docs/maintainers/ROADMAP.md|enforced_in=runtime,cursor_rules
term|name=workflow|definition=ordered_sequence_of_steps_for_recurring_job|defined_in=docs/maintainers/RELEASING.md,docs/maintainers/|enforced_in=tasks/*.md,ci_checks
term|name=runbook|definition=incident_or_recovery_workflow_for_failure_scenarios|defined_in=docs/maintainers/|enforced_in=incident_execution
term|name=playbook|definition=reusable_strategy_for_a_class_of_work|defined_in=docs/maintainers/|enforced_in=.workspace-kit/tasks/state.json
term|name=template_contract|definition=required_structure_fields_and_formatting_for_generated_outputs|defined_in=docs/maintainers/TERMS.md,tasks/*.md|enforced_in=template_checks_and_tests
term|name=approval_gate|definition=checkpoint_requiring_explicit_human_confirmation|defined_in=docs/maintainers/RELEASING.md|enforced_in=release_process
term|name=evidence_requirement|definition=minimum_proof_artifacts_for_valid_releasable_work|defined_in=docs/maintainers/RELEASING.md,.workspace-kit/tasks/state.json|enforced_in=release_checklist
term|name=escalation_trigger|definition=condition_requiring_agent_to_stop_and_ask_human|defined_in=docs/maintainers/TERMS.md|enforced_in=.cursor/rules/*.mdc
term|name=capability_pack|definition=modular_bundle_of_rules_directives_and_templates_defining_behavior_profile_distinct_from_cae_activation_bundle_engine_output|defined_in=roadmap_and_task_refs,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=activation_sync_workflows
term|name=context_activation_engine|definition=CAE_evaluates_structured_workspace_and_task_command_context_returns_deterministic_activation_bundles_planned_kit_module_id_context_activation|defined_in=.ai/adrs/ADR-context-activation-engine-architecture-v1.md,tasks/cae/CAE-PROGRAM-CONTEXT.md|enforced_in=cae_implementation_tasks
term|name=module_activation_report|definition=ModuleActivationReport_snapshot_per_module_enabled_flag_dependency_and_optional_peer_satisfaction_not_a_cae_activation|defined_in=.ai/adrs/ADR-context-activation-engine-architecture-v1.md,src/core/module-registry.ts|enforced_in=src/core/agent-instruction-surface.ts,src/core/module-registry.ts
term|name=cae_activation|definition=declared_evaluated_CAE_activation_policy_think_do_review_families_via_registry_artifact_ids_precedence_acks_and_trace|defined_in=.ai/adrs/ADR-context-activation-engine-architecture-v1.md,tasks/cae/CAE-PROGRAM-CONTEXT.md|enforced_in=cae_implementation_tasks
term|name=activation_family|definition=policy_think_do_or_review_bucket_classifying_a_cae_activation|defined_in=tasks/cae/CAE-PROGRAM-CONTEXT.md,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=cae_implementation_tasks
term|name=activation_artifact|definition=registry_record_addressing_external_docs_by_stable_id_and_type_without_embedding_full_bodies_in_payloads|defined_in=tasks/cae/CAE-PROGRAM-CONTEXT.md,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=cae_implementation_tasks
term|name=activation_bundle|definition=effective_merged_policy_think_do_review_result_for_a_resolution_including_pending_acks_and_conflict_or_shadow_summary|defined_in=tasks/cae/CAE-PROGRAM-CONTEXT.md,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=cae_implementation_tasks
term|name=activation_trace|definition=correlation_and_explanation_surface_for_a_cae_resolution_including_trace_identifier|defined_in=tasks/cae/CAE-PROGRAM-CONTEXT.md,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=cae_implementation_tasks
term|name=shadow_mode|definition=cae_runs_parallel_to_commands_reporting_would_activate_or_would_enforce_without_changing_outcomes|defined_in=tasks/cae/CAE-PROGRAM-CONTEXT.md,.ai/adrs/ADR-context-activation-engine-architecture-v1.md|enforced_in=cae_implementation_tasks
term|name=acknowledgement_strength|definition=cae_ack_level_none_surface_recommend_ack_required_satisfy_required_not_tier_A_B_policyApproval|defined_in=.ai/adrs/ADR-context-activation-engine-architecture-v1.md,.ai/POLICY-APPROVAL.md|enforced_in=cae_implementation_tasks
