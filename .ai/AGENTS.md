meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=agent_operating_guidance|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=module_build|target=.ai/module-build.md|type=file|status=active
ref|id=roadmap|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active
ref|id=policy_approval|target=docs/maintainers/POLICY-APPROVAL.md|type=file|status=active
ref|id=agent_cli_map|target=docs/maintainers/AGENT-CLI-MAP.md|type=file|status=active
ref|id=terms|target=docs/maintainers/TERMS.md|type=file|status=active
ref|id=module_guide|target=docs/maintainers/module-build-guide.md|type=file|status=active
truth|order=ai_principles>ai_module_build>roadmap>tasks_engine_state>tasks_view>agent_cli_map>policy_approval>releasing>terms>module_guide

rule|id=A001|level=must|scope=agent|directive=use_high_autonomy_when_task_intent_is_clear|risk=low|approval=none|override=auto|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A001
rule|id=A002|level=must|scope=agent|directive=soft_gate_on_principle_conflicts_state_conflict_and_ask_confirmation|risk=high|approval=prompt|override=prompt|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A002
rule|id=A003|level=must|scope=agent|directive=require_human_approval_before_release_migration_or_policy_changes|risk=critical|approval=required|override=stop|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A003
rule|id=A004|level=must|scope=agent|directive=prefer_small_reversible_evidence_backed_changes|risk=medium|approval=none|override=warn|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A004
rule|id=A005|level=must|scope=agent|directive=stop_on_irreversible_data_loss_or_secret_risk_without_approval|risk=critical|approval=required|override=stop|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A005
rule|id=A006|level=must|scope=agent|directive=emit_structured_evidence_for_validation_and_generation_operations|risk=medium|approval=none|override=warn|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A006

rule|id=A010|level=must|scope=agent|directive=keep_strategy_in_roadmap_execution_in_task_engine_state_and_release_ops_in_releasing|risk=medium|approval=none|override=warn|status=active|refs=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json,docs/maintainers/RELEASING.md|why=rationale_for_A010
rule|id=A011|level=must|scope=agent|directive=update_related_docs_in_same_changeset_when_scope_changes|risk=medium|approval=none|override=warn|status=active|why=rationale_for_A011
rule|id=A012|level=must|scope=agent|directive=preserve_deterministic_behavior_and_document_migration_impact|risk=high|approval=none|override=stop|status=active|refs=.ai/PRINCIPLES.md|why=rationale_for_A012

rule|id=A020|level=must|scope=agent|directive=execute_tasks_in_dependency_order_from_task_engine_queue|risk=medium|approval=none|override=warn|status=active|refs=.workspace-kit/tasks/state.json|why=rationale_for_A020
rule|id=A021|level=must|scope=agent|directive=treat_task_metadata_scope_acceptance_as_binding_implementation_guidance|risk=medium|approval=none|override=warn|status=active|refs=.workspace-kit/tasks/state.json|why=rationale_for_A021
rule|id=A022|level=must|scope=agent|directive=split_oversized_tasks_before_implementation|risk=low|approval=none|override=warn|status=active|refs=.workspace-kit/tasks/state.json|why=rationale_for_A022

rule|id=A023|level=must|scope=agent|directive=before_mutating_kit_owned_state_run_matching_workspace_kit_command|risk=high|approval=none|override=stop|status=active|refs=docs/maintainers/AGENT-CLI-MAP.md,docs/maintainers/POLICY-APPROVAL.md|why=rationale_for_A023
rule|id=A024|level=must_not|scope=agent|directive=rely_on_chat_only_approval_for_policy_gated_workspace_kit_run|risk=critical|approval=none|override=stop|status=active|refs=docs/maintainers/POLICY-APPROVAL.md|why=rationale_for_A024
rule|id=A025|level=must_not|scope=agent|directive=hand_edit_task_engine_state_json_for_routine_lifecycle_transitions|risk=high|approval=none|override=stop|status=active|refs=docs/maintainers/AGENT-CLI-MAP.md,.workspace-kit/tasks/state.json|why=rationale_for_A025

rule|id=A030|level=must|scope=agent|directive=use_document_project_for_batch_and_generate_document_for_single|risk=low|approval=none|override=auto|status=active|refs=src/modules/documentation/RULES.md|why=rationale_for_A030
rule|id=A031|level=must|scope=agent|directive=follow_documentation_module_rules_md_before_generation|risk=medium|approval=none|override=warn|status=active|refs=src/modules/documentation/RULES.md|why=rationale_for_A031

command|id=C001|name=document-project|use=module_command_router|scope=documentation|expectation=batch_generation_all_templates|risk=low|status=active
command|id=C002|name=generate-document|use=module_command_router|scope=documentation|expectation=single_document_generation|risk=low|status=active
