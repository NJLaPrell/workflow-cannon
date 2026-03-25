meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=agent_operating_guidance|scope=repo
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=module_build|path=.ai/module-build.md
ref|name=roadmap|path=docs/maintainers/ROADMAP.md
ref|name=tasks|path=docs/maintainers/TASKS.md
ref|name=releasing|path=docs/maintainers/RELEASING.md
ref|name=terms|path=docs/maintainers/TERMS.md
ref|name=module_guide|path=docs/maintainers/module-build-guide.md
truth|order=ai_principles>ai_module_build>roadmap>tasks>releasing>terms>module_guide

rule|A001|must|agent|use_high_autonomy_when_task_intent_is_clear|risk=low|ap=none|ov=auto|st=active|refs=.ai/PRINCIPLES.md
rule|A002|must|agent|soft_gate_on_principle_conflicts_state_conflict_and_ask_confirmation|risk=high|ap=prompt|ov=prompt|st=active|refs=.ai/PRINCIPLES.md
rule|A003|must|agent|require_human_approval_before_release_migration_or_policy_changes|risk=critical|ap=required|ov=stop|st=active|refs=.ai/PRINCIPLES.md
rule|A004|must|agent|prefer_small_reversible_evidence_backed_changes|risk=medium|ap=none|ov=warn|st=active|refs=.ai/PRINCIPLES.md
rule|A005|must|agent|stop_on_irreversible_data_loss_or_secret_risk_without_approval|risk=critical|ap=required|ov=stop|st=active|refs=.ai/PRINCIPLES.md
rule|A006|must|agent|emit_structured_evidence_for_validation_and_generation_operations|risk=medium|ap=none|ov=warn|st=active|refs=.ai/PRINCIPLES.md

rule|A010|must|agent|keep_strategy_in_roadmap_execution_in_tasks_release_ops_in_releasing|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/ROADMAP.md,docs/maintainers/TASKS.md,docs/maintainers/RELEASING.md
rule|A011|must|agent|update_related_docs_in_same_changeset_when_scope_changes|risk=medium|ap=none|ov=warn|st=active
rule|A012|must|agent|preserve_deterministic_behavior_and_document_migration_impact|risk=high|ap=none|ov=stop|st=active|refs=.ai/PRINCIPLES.md

rule|A020|must|agent|execute_tasks_in_dependency_order_from_tasks_queue|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/TASKS.md
rule|A021|must|agent|treat_approach_scope_acceptance_as_binding_implementation_guidance|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/TASKS.md
rule|A022|must|agent|split_oversized_tasks_before_implementation|risk=low|ap=none|ov=warn|st=active|refs=docs/maintainers/TASKS.md

rule|A030|must|agent|use_document_project_for_batch_and_generate_document_for_single|risk=low|ap=none|ov=auto|st=active|refs=src/modules/documentation/RULES.md
rule|A031|must|agent|follow_documentation_module_rules_md_before_generation|risk=medium|ap=none|ov=warn|st=active|refs=src/modules/documentation/RULES.md

cmd|C001|name=document-project|use=module_command_router|scope=documentation|expect=batch_generation_all_templates|risk=low|st=active
cmd|C002|name=generate-document|use=module_command_router|scope=documentation|expect=single_document_generation|risk=low|st=active
