meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=glossary|scope=repo
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=roadmap|path=docs/maintainers/ROADMAP.md
ref|name=tasks_engine_state|path=.workspace-kit/tasks/state.json
ref|name=tasks_view|path=docs/maintainers/TASKS.md
ref|name=releasing|path=docs/maintainers/RELEASING.md
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

usage|prefer_these_terms_in_docs_tasks_prs_and_release_notes
usage|add_new_terms_here_before_broad_adoption
usage|keep_definitions_operational_and_project_specific
usage|one_primary_definition_source_per_term

surface|S001|name=canonical_glossary|path=docs/maintainers/TERMS.md|role=primary_definitions
surface|S002|name=canonical_principles|path=.ai/PRINCIPLES.md|role=goals_and_decision_rules
surface|S003|name=project_intent|paths=README.md,docs/maintainers/ROADMAP.md,docs/maintainers/ARCHITECTURE.md|role=boundaries_and_direction
surface|S004|name=execution|paths=.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md|role=task_engine_queue_and_generated_human_view
surface|S005|name=operational|paths=docs/maintainers/RELEASING.md,docs/maintainers/|role=runbooks_and_playbooks
surface|S006|name=agent_enforcement|path=.cursor/rules/*.mdc|role=editor_agent_layer
surface|S007|name=agent_task_templates|path=tasks/*.md|role=reusable_task_templates

term|directive|def=high_level_intent_telling_agent_what_outcome_to_optimize_for|defined_in=docs/maintainers/TERMS.md,README.md,docs/maintainers/ROADMAP.md|enforced_in=.cursor/rules/
term|goal|def=desired_project_outcome_for_evaluating_progress_and_direction|defined_in=.ai/PRINCIPLES.md,README.md|enforced_in=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md
term|principle|def=cross_cutting_decision_rule_for_trade_offs|defined_in=.ai/PRINCIPLES.md|enforced_in=.cursor/rules/project-principles.mdc
term|rule|def=mandatory_constraint_must_or_must_not|defined_in=docs/maintainers/TERMS.md|enforced_in=.cursor/rules/*.mdc
term|guardrail|def=safety_boundary_limiting_risky_behavior_while_allowing_progress|defined_in=docs/maintainers/TERMS.md,docs/maintainers/RELEASING.md|enforced_in=.cursor/rules/*.mdc,release_gates
term|policy|def=decision_framework_for_allowed_denied_or_approval_gated_actions|defined_in=docs/maintainers/TERMS.md,docs/maintainers/ROADMAP.md|enforced_in=runtime,cursor_rules
term|workflow|def=ordered_sequence_of_steps_for_recurring_job|defined_in=docs/maintainers/RELEASING.md,docs/maintainers/|enforced_in=tasks/*.md,ci_checks
term|runbook|def=incident_or_recovery_workflow_for_failure_scenarios|defined_in=docs/maintainers/|enforced_in=incident_execution
term|playbook|def=reusable_strategy_for_a_class_of_work|defined_in=docs/maintainers/|enforced_in=.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md
term|template_contract|def=required_structure_fields_and_formatting_for_generated_outputs|defined_in=docs/maintainers/TERMS.md,tasks/*.md|enforced_in=template_checks_and_tests
term|approval_gate|def=checkpoint_requiring_explicit_human_confirmation|defined_in=docs/maintainers/RELEASING.md|enforced_in=release_process
term|evidence_requirement|def=minimum_proof_artifacts_for_valid_releasable_work|defined_in=docs/maintainers/RELEASING.md,.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md|enforced_in=release_checklist
term|escalation_trigger|def=condition_requiring_agent_to_stop_and_ask_human|defined_in=docs/maintainers/TERMS.md|enforced_in=.cursor/rules/*.mdc
term|capability_pack|def=modular_bundle_of_rules_directives_and_templates_defining_behavior_profile|defined_in=roadmap_and_task_refs|enforced_in=activation_sync_workflows
