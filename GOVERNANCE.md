meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=governance_policy|scope=repo
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs
ref|name=principles|path=PRINCIPLES.md
ref|name=roadmap|path=ROADMAP.md
ref|name=tasks|path=TASKS.md
ref|name=decisions|path=DECISIONS.md
ref|name=releasing|path=RELEASING.md

rule|R101|must|governance_scope|apply_governance_to_roadmap_direction_feature_acceptance_architecture_and_release_policy|risk=high|ap=none|ov=warn|st=active|refs=ROADMAP.md,PRINCIPLES.md,RELEASING.md
rule|R102|must|day_to_day_decisions|document_decision_rationale_when_maintainer_discretion_is_used|risk=medium|ap=none|ov=warn|st=active|refs=TASKS.md,DECISIONS.md
rule|R103|must|significant_architecture_or_policy_changes|record_decision_and_complete_review_before_acceptance|risk=high|ap=required|ov=stop|st=active|refs=DECISIONS.md
rule|R104|must|breaking_changes|include_explicit_migration_and_compatibility_notes_before_acceptance|risk=critical|ap=required|ov=stop|st=active|refs=CHANGELOG.md,RELEASING.md
rule|R105|must|change_control|track_strategic_intent_in_roadmap_and_principles|risk=medium|ap=none|ov=warn|st=active|refs=ROADMAP.md,PRINCIPLES.md
rule|R106|must|change_control|track_execution_state_in_tasks|risk=medium|ap=none|ov=warn|st=active|refs=TASKS.md
rule|R107|must|change_control|record_major_technical_choices_in_decisions_or_adrs|risk=medium|ap=none|ov=warn|st=active|refs=DECISIONS.md,docs/adr/README.md
rule|R108|must|conflict_resolution|prefer_evidence_from_tests_incidents_and_user_impact_when_maintainers_disagree|risk=high|ap=none|ov=warn|st=active
rule|R109|must|conflict_resolution|prefer_the_safer_reversible_option_when_evidence_is_inconclusive|risk=high|ap=none|ov=warn|st=active
rule|R110|should|conflict_resolution|use_time_boxed_experiments_with_exit_criteria_for_unresolved_tradeoffs|risk=medium|ap=prompt|ov=prompt|st=active

check|K101|scope=significant_changes|assert=decision_record_exists_and_review_completed|when=before_merge|on_fail=stop|st=active|refs=DECISIONS.md
check|K102|scope=breaking_changes|assert=migration_and_compatibility_notes_present|when=before_acceptance|on_fail=stop|st=active|refs=CHANGELOG.md,RELEASING.md
check|K103|scope=project_alignment|assert=roadmap_principles_tasks_and_decisions_are_consistent|when=periodic_governance_review|on_fail=warn|st=active|refs=ROADMAP.md,PRINCIPLES.md,TASKS.md,DECISIONS.md
