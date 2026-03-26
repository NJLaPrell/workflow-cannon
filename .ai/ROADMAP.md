meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=roadmap|scope=repo
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=tasks_engine_state|path=.workspace-kit/tasks/state.json
ref|name=tasks_view|path=docs/maintainers/TASKS.md
ref|name=feature_matrix|path=docs/maintainers/FEATURE-MATRIX.md
ref|name=changelog|path=docs/maintainers/CHANGELOG.md
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

scope|S001|canonical_home_for_workflow_cannon_package_and_operational_docs|st=active
scope|S002|legacy_source_repo_treated_as_external_consumer_not_implementation_source|st=active

state|current_phase=phase_5_completed_initial_slice|next_tasks=T249,T250,T251,T254,T257,T260,T261,T262,T263,imp-2cf5d881b81f9a,T252,T253,T255,T256,T258,T264,T265,T266|release_phase_1=v0.3.0|release_phase_2=v0.4.0|release_phase_2b=v0.4.1|release_phase_3=v0.5.0|release_phase_4=v0.6.0|release_phase_5=v0.7.0|st=active
state|completed_phase_0_slices=T178,T179,T180,T181,T182,T183,T196,T197,T198,T206,T207,T208,T209,T210,T211,T212,T213
state|completed_phase_1_slices=T199,T184,T185,T186,T217

cadence|each_phase_ends_with_github_release|phases_are_sequential_unless_replanned

phase|P0|name=foundation_hardening|release=v0.2.0|scope=T178-T183,T196-T198,T206-T213|status=complete|outcome=reliable_release_gates_consumer_parity_machine_readable_evidence
phase|P1|name=task_engine_core|release=v0.3.0|scope=T199,T184-T186,T217|status=complete|outcome=canonical_task_runtime_contract
phase|P2|name=configuration_and_policy_base|release=v0.4.0|scope=T218,T187,T200,T188,T201,T189|status=complete|outcome=deterministic_config_agent_explain_policy_traces_local_cutover_docs
phase|P2b|name=config_policy_hardening_and_ux|release=v0.4.1|scope=T219-T220,T228-T237|status=complete|outcome=validated_config_resolve_traces_cli_config_metadata_docs_evidence
phase|P3|name=enhancement_loop_mvp|release=v0.5.0|scope=T190-T192,T202,T203|status=complete|outcome=evidence_to_task_engine_improvements_approvals_lineage_trace_correlation
phase|P4|name=runtime_scale_and_ecosystem|release=v0.6.0|scope=T193-T195,T204-T205,T238-T242|status=complete|outcome=extension_ready_operationally_robust_platform_with_fail_closed_compatibility_and_release_channel_controls
phase|P5|name=transcript_intelligence_automation|release=v0.7.0|scope=T244-T248,T259|status=complete_initial_slice|outcome=manual_first_transcript_sync_and_one_shot_ingest_with_coherent_policy_config_and_operability_contracts

decision|D001|project_name=workflow_cannon|st=active
decision|D002|package_name=@workflow-cannon/workspace-kit|st=active
decision|D003|extraction_strategy=git_subtree_split_from_packages_workspace_kit|st=active
decision|D004|directive_model=one_profile_both_instruction_surfaces|st=active
decision|D005|upgrade_merge=safe_overwrite_kit_owned_paths_with_backup_and_diff_evidence|st=active

evidence|freeze_commit=65797d888629d017f3538bd793c5e7cd781edf7d
evidence|split_commit=5a1f7038255a2c83e0e51ace07ea0d95a327574c
evidence|first_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397
evidence|phase_1_v0_3_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23559535382
evidence|phase_2_v0_4_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23561237541
evidence|phase_4_v0_6_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23604173215
evidence|phase_5_v0_7_0_publish_run=TBD
evidence|npm_package=https://www.npmjs.com/package/@workflow-cannon/workspace-kit
