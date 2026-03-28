meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=workflow_platform|scope=repo
prio|slot1=safety_and_trustworthiness>correctness_and_determinism>compatibility_and_upgrade_safety>operability_and_evidence_quality>delivery_speed_and_convenience
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=strategic_direction|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=decisions_log|target=docs/maintainers/DECISIONS.md|type=file|status=active
ref|id=release_workflow|target=docs/maintainers/RELEASING.md|type=file|status=active

rule|id=R001|level=must|scope=repo|directive=prioritize_safety_and_trustworthiness_first_in_tradeoffs|risk=critical|approval=required|override=stop|status=active|refs=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json|why=rationale_for_R001
rule|id=R002|level=must|scope=repo|directive=maintain_correct_and_deterministic_behavior_for_supported_workflows|risk=high|approval=none|override=stop|status=active|why=rationale_for_R002
rule|id=R003|level=must|scope=behavior_change|directive=preserve_compatibility_or_provide_documented_migration_path|risk=high|approval=required|override=stop|status=active|refs=docs/maintainers/RELEASING.md,docs/maintainers/CHANGELOG.md|why=rationale_for_R003
rule|id=R004|level=must|scope=release|directive=produce_release_evidence_for_readiness_and_parity_checks|risk=high|approval=required|override=stop|status=active|refs=docs/maintainers/RELEASING.md|why=rationale_for_R004
rule|id=R005|level=should|scope=repo|directive=optimize_for_fast_iteration_in_low_risk_clear_routine_work|risk=low|approval=none|override=auto|status=active|why=rationale_for_R005
rule|id=R006|level=must|scope=planning_and_architecture|directive=apply_high_agent_autonomy_when_user_intent_is_clear|risk=medium|approval=none|override=auto|status=active|why=rationale_for_R006
rule|id=R007|level=must|scope=release_actions|directive=require_human_approval_before_release_execution|risk=critical|approval=required|override=stop|status=active|why=rationale_for_R007
rule|id=R008|level=must|scope=migration_and_upgrade_path|directive=require_human_approval_before_migration_or_upgrade_path_changes|risk=critical|approval=required|override=stop|status=active|why=rationale_for_R008
rule|id=R009|level=must|scope=policy_and_approval_model|directive=require_human_approval_before_policy_or_approval_model_changes|risk=critical|approval=required|override=stop|status=active|why=rationale_for_R009
rule|id=R010|level=must|scope=secrets_and_data_integrity|directive=stop_when_action_can_cause_irreversible_data_loss_or_critical_secret_risk_without_approval|risk=critical|approval=required|override=stop|status=active|why=rationale_for_R010
rule|id=R011|level=must|scope=principle_conflict|directive=use_soft_gate_behavior_by_stating_conflict_and_requesting_confirmation_before_proceeding|risk=high|approval=prompt|override=prompt|status=active|why=rationale_for_R011
rule|id=R012|level=must|scope=implementation_scope|directive=prefer_incremental_reversible_changes_over_broad_high_risk_changes|risk=medium|approval=none|override=warn|status=active|why=rationale_for_R012
rule|id=R013|level=must|scope=documentation_boundaries|directive=keep_strategy_in_roadmap_execution_in_task_engine_state_and_release_operations_in_releasing|risk=medium|approval=none|override=warn|status=active|refs=docs/maintainers/ROADMAP.md,.workspace-kit/tasks/state.json,docs/maintainers/RELEASING.md|why=rationale_for_R013
rule|id=R014|level=must_not|scope=repo|directive=bypass_release_migration_or_policy_gates_to_increase_delivery_speed|risk=critical|approval=required|override=stop|status=active|why=rationale_for_R014
rule|id=R015|level=must|scope=principle_override|directive=record_explicit_override_rationale_in_task_engine_or_decisions|risk=medium|approval=prompt|override=warn|status=active|refs=.workspace-kit/tasks/state.json,docs/maintainers/DECISIONS.md|why=rationale_for_R015

check|id=K001|scope=release|assertion=release_has_readiness_and_parity_evidence|when=before_release|on_fail=stop|status=active|refs=docs/maintainers/RELEASING.md
check|id=K002|scope=compatibility_changes|assertion=migration_guidance_exists_for_compatibility_impact|when=before_merge_or_release|on_fail=stop|status=active|refs=docs/maintainers/CHANGELOG.md
check|id=K003|scope=policy_sensitive_changes|assertion=required_human_approval_recorded|when=before_execution|on_fail=stop|status=active

example|id=E901|for=R001|kind=good|text=stop_release_when_readiness_evidence_missing|status=active
example|id=E902|for=R003|kind=good|text=require_documented_migration_path_for_breaking_change|status=active
example|id=E903|for=R007|kind=edge|text=prompt_for_human_approval_before_release_execution|status=active
example|id=E904|for=R010|kind=bad|text=reject_unapproved_secret_exfiltration_pattern|status=active
example|id=E905|for=R014|kind=bad|text=do_not_skip_release_or_policy_gates_to_go_faster|status=active