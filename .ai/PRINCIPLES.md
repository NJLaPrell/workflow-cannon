meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=workflow_platform|scope=repo
prio|safety_and_trustworthiness>correctness_and_determinism>compatibility_and_upgrade_safety>operability_and_evidence_quality>delivery_speed_and_convenience
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs
ref|name=tasks_engine_state|path=.workspace-kit/tasks/state.json
ref|name=tasks_view|path=.workspace-kit/tasks/state.json
ref|name=strategic_direction|path=docs/maintainers/ROADMAP.md
ref|name=decisions_log|path=docs/maintainers/DECISIONS.md
ref|name=release_workflow|path=docs/maintainers/RELEASING.md

rule|R001|must|repo|prioritize_safety_and_trustworthiness_first_in_tradeoffs|risk=critical|ap=required|ov=stop|st=active|refs=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json
rule|R002|must|repo|maintain_correct_and_deterministic_behavior_for_supported_workflows|risk=high|ap=none|ov=stop|st=active
rule|R003|must|behavior_change|preserve_compatibility_or_provide_documented_migration_path|risk=high|ap=required|ov=stop|st=active|refs=docs/maintainers/RELEASING.md,docs/maintainers/CHANGELOG.md
rule|R004|must|release|produce_release_evidence_for_readiness_and_parity_checks|risk=high|ap=required|ov=stop|st=active|refs=docs/maintainers/RELEASING.md
rule|R005|should|repo|optimize_for_fast_iteration_in_low_risk_clear_routine_work|risk=low|ap=none|ov=auto|st=active
rule|R006|must|planning_and_architecture|apply_high_agent_autonomy_when_user_intent_is_clear|risk=medium|ap=none|ov=auto|st=active
rule|R007|must|release_actions|require_human_approval_before_release_execution|risk=critical|ap=required|ov=stop|st=active
rule|R008|must|migration_and_upgrade_path|require_human_approval_before_migration_or_upgrade_path_changes|risk=critical|ap=required|ov=stop|st=active
rule|R009|must|policy_and_approval_model|require_human_approval_before_policy_or_approval_model_changes|risk=critical|ap=required|ov=stop|st=active
rule|R010|must|secrets_and_data_integrity|stop_when_action_can_cause_irreversible_data_loss_or_critical_secret_risk_without_approval|risk=critical|ap=required|ov=stop|st=active
rule|R011|must|principle_conflict|use_soft_gate_behavior_by_stating_conflict_and_requesting_confirmation_before_proceeding|risk=high|ap=prompt|ov=prompt|st=active
rule|R012|must|implementation_scope|prefer_incremental_reversible_changes_over_broad_high_risk_changes|risk=medium|ap=none|ov=warn|st=active
rule|R013|must|documentation_boundaries|keep_strategy_in_roadmap_execution_in_task_engine_state_and_release_operations_in_releasing|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json,docs/maintainers/RELEASING.md
rule|R014|must_not|repo|bypass_release_migration_or_policy_gates_to_increase_delivery_speed|risk=critical|ap=required|ov=stop|st=active
rule|R015|must|principle_override|record_explicit_override_rationale_in_task_engine_or_decisions|risk=medium|ap=prompt|ov=warn|st=active|refs=.workspace-kit/tasks/state.json,docs/maintainers/DECISIONS.md

check|K001|scope=release|assert=release_has_readiness_and_parity_evidence|when=before_release|on_fail=stop|st=active|refs=docs/maintainers/RELEASING.md
check|K002|scope=compatibility_changes|assert=migration_guidance_exists_for_compatibility_impact|when=before_merge_or_release|on_fail=stop|st=active|refs=docs/maintainers/CHANGELOG.md
check|K003|scope=policy_sensitive_changes|assert=required_human_approval_recorded|when=before_execution|on_fail=stop|st=active
