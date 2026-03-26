meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=governance_policy|scope=repo
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=roadmap|path=docs/maintainers/ROADMAP.md
ref|name=tasks_engine_state|path=.workspace-kit/tasks/state.json
ref|name=tasks_view|path=docs/maintainers/TASKS.md
ref|name=decisions|path=docs/maintainers/DECISIONS.md
ref|name=releasing|path=docs/maintainers/RELEASING.md

rule|R101|must|governance_scope|apply_governance_to_roadmap_direction_feature_acceptance_architecture_and_release_policy|risk=high|ap=none|ov=warn|st=active|refs=docs/maintainers/ROADMAP.md,.ai/PRINCIPLES.md,docs/maintainers/RELEASING.md
rule|R102|must|day_to_day_decisions|document_decision_rationale_when_maintainer_discretion_is_used|risk=medium|ap=none|ov=warn|st=active|refs=.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md,docs/maintainers/DECISIONS.md
rule|R103|must|significant_architecture_or_policy_changes|record_decision_and_complete_review_before_acceptance|risk=high|ap=required|ov=stop|st=active|refs=docs/maintainers/DECISIONS.md
rule|R104|must|breaking_changes|include_explicit_migration_and_compatibility_notes_before_acceptance|risk=critical|ap=required|ov=stop|st=active|refs=docs/maintainers/CHANGELOG.md,docs/maintainers/RELEASING.md
rule|R105|must|change_control|track_strategic_intent_in_roadmap_and_principles|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/ROADMAP.md,.ai/PRINCIPLES.md
rule|R106|must|change_control|track_execution_state_in_task_engine|risk=medium|ap=none|ov=warn|st=active|refs=.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md
rule|R107|must|change_control|record_major_technical_choices_in_decisions_or_adrs|risk=medium|ap=none|ov=warn|st=active|refs=docs/maintainers/DECISIONS.md,docs/adr/README.md
rule|R108|must|conflict_resolution|prefer_evidence_from_tests_incidents_and_user_impact_when_maintainers_disagree|risk=high|ap=none|ov=warn|st=active
rule|R109|must|conflict_resolution|prefer_the_safer_reversible_option_when_evidence_is_inconclusive|risk=high|ap=none|ov=warn|st=active
rule|R110|should|conflict_resolution|use_time_boxed_experiments_with_exit_criteria_for_unresolved_tradeoffs|risk=medium|ap=prompt|ov=prompt|st=active

check|K101|scope=significant_changes|assert=decision_record_exists_and_review_completed|when=before_merge|on_fail=stop|st=active|refs=docs/maintainers/DECISIONS.md
check|K102|scope=breaking_changes|assert=migration_and_compatibility_notes_present|when=before_acceptance|on_fail=stop|st=active|refs=docs/maintainers/CHANGELOG.md,docs/maintainers/RELEASING.md
check|K103|scope=project_alignment|assert=roadmap_principles_task_engine_and_decisions_are_consistent|when=periodic_governance_review|on_fail=warn|st=active|refs=docs/maintainers/ROADMAP.md,.ai/PRINCIPLES.md,.workspace-kit/tasks/state.json,docs/maintainers/TASKS.md,docs/maintainers/DECISIONS.md
