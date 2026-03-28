meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=roadmap|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=feature_matrix|target=docs/maintainers/FEATURE-MATRIX.md|type=file|status=active
ref|id=changelog|target=docs/maintainers/CHANGELOG.md|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

scope|slot1=S001|slot2=canonical_home_for_workflow_cannon_package_and_operational_docs|status=active
scope|slot1=S002|slot2=legacy_source_repo_treated_as_external_consumer_not_implementation_source|status=active

state|current_phase=phase_9_complete_in_repo|next_tasks=none|release_phase_1=v0.3.0|release_phase_2=v0.4.0|release_phase_2b=v0.4.1|release_phase_3=v0.5.0|release_phase_4=v0.6.0|release_phase_5=v0.7.0|release_phase_6=v0.8.0|release_phase_7=v0.9.0|release_phase_8=v0.10.0|release_phase_9=not_released_semver_yet|status=active
state|completed_phase_0_slices=T178,T179,T180,T181,T182,T183,T196,T197,T198,T206,T207,T208,T209,T210,T211,T212,T213
state|completed_phase_1_slices=T199,T184,T185,T186,T217

cadence|slot1=each_phase_ends_with_github_release|slot2=phases_are_sequential_unless_replanned

phase|slot1=P0|name=foundation_hardening|release=v0.2.0|scope=T178-T183,T196-T198,T206-T213|status=complete|outcome=reliable_release_gates_consumer_parity_machine_readable_evidence
phase|slot1=P1|name=task_engine_core|release=v0.3.0|scope=T199,T184-T186,T217|status=complete|outcome=canonical_task_runtime_contract
phase|slot1=P2|name=configuration_and_policy_base|release=v0.4.0|scope=T218,T187,T200,T188,T201,T189|status=complete|outcome=deterministic_config_agent_explain_policy_traces_local_cutover_docs
phase|slot1=P2b|name=config_policy_hardening_and_ux|release=v0.4.1|scope=T219-T220,T228-T237|status=complete|outcome=validated_config_resolve_traces_cli_config_metadata_docs_evidence
phase|slot1=P3|name=enhancement_loop_mvp|release=v0.5.0|scope=T190-T192,T202,T203|status=complete|outcome=evidence_to_task_engine_improvements_approvals_lineage_trace_correlation
phase|slot1=P4|name=runtime_scale_and_ecosystem|release=v0.6.0|scope=T193-T195,T204-T205,T238-T242|status=complete|outcome=extension_ready_operationally_robust_platform_with_fail_closed_compatibility_and_release_channel_controls
phase|slot1=P5|name=transcript_intelligence_automation|release=v0.7.0|scope=T244-T248,T259|status=complete_initial_slice|outcome=manual_first_transcript_sync_and_one_shot_ingest_with_coherent_policy_config_and_operability_contracts
phase|slot1=P6|name=automation_hardening_and_response_templates|release=v0.8.0|scope=T249-T258,T260-T266,T271-T274|status=complete_in_repo|outcome=high_cadence_resilient_transcript_automation_and_advisory_response_template_contracts
phase|slot1=P7|name=architectural_hardening|release=v0.9.0|scope=T275-T282|status=complete|outcome=canonical_surface_alignment_runtime_maintainability_and_drift_reduction
phase|slot1=P8|name=improvement_backlog_triage|release=v0.10.0|scope=imp-2cf5d881b81f9a,imp-3dc9374451b3c0,imp-b9d8408715de51,imp-201911c9c4461a,imp-ab362ef4e1f99e,imp-c14c4955833730,imp-fb31f5fc2694d3,imp-43397766ef243b,imp-7f9e65fad74b0b|status=complete|outcome=maintainer_onboarding_policy_clarity_and_doc_runbook_alignment_shipped
phase|slot1=P9|name=interactive_policy_ux_and_response_template_enforcement|release=not_released_semver_yet|scope=T283,T284|status=complete_in_repo|outcome=command_scoped_interactive_approval_and_strict_template_mode_shipped
decision|id=D006|phase_6_release_strategy=single_release_v0.8.0|status=active
decision|id=D007|approval_ux=configurable_first_use_prompt_with_deny_allow_allow_for_session_and_command_scoped_session_reuse|status=active
decision|id=D008|response_template_enforcement=configurable_with_advisory_default|status=active

decision|id=D001|project_name=workflow_cannon|status=active
decision|id=D002|package_name=@workflow-cannon/workspace-kit|status=active
decision|id=D003|extraction_strategy=git_subtree_split_from_packages_workspace_kit|status=active
decision|id=D004|directive_model=one_profile_both_instruction_surfaces|status=active
decision|id=D005|upgrade_merge=safe_overwrite_kit_owned_paths_with_backup_and_diff_evidence|status=active

evidence|freeze_commit=65797d888629d017f3538bd793c5e7cd781edf7d
evidence|split_commit=5a1f7038255a2c83e0e51ace07ea0d95a327574c
evidence|first_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397
evidence|phase_1_v0_3_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23559535382
evidence|phase_2_v0_4_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23561237541
evidence|phase_4_v0_6_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23604173215
evidence|phase_5_v0_7_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23610374625
evidence|phase_6_v0_8_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23617262478
evidence|phase_7_v0_9_0_publish_run=https://github.com/NJLaPrell/workflow-cannon/actions/runs/23622990943
evidence|npm_package=https://www.npmjs.com/package/@workflow-cannon/workspace-kit
