meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=release_process|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=roadmap|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=tasks_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=tasks_view|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=changelog|target=docs/maintainers/CHANGELOG.md|type=file|status=active
ref|id=security|target=docs/maintainers/SECURITY.md|type=file|status=active
ref|id=gate_matrix|target=docs/maintainers/release-gate-matrix.md|type=file|status=active
ref|id=parity_flow|target=docs/maintainers/runbooks/parity-validation-flow.md|type=file|status=active
ref|id=parity_schema|target=schemas/parity-evidence.schema.json|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

intent|slot1=I001|slot2=ship_predictable_behavior_from_packaged_artifacts|status=active
intent|slot1=I002|slot2=preserve_downstream_consumer_compatibility_or_communicate_breakage|status=active
intent|slot1=I003|slot2=produce_auditable_evidence_for_changes_validation_and_rationale|status=active
intent|slot1=I004|slot2=feed_observed_friction_into_improvement_and_workflow_hardening|status=active
intent|slot1=I005|slot2=operator_slash_and_chat_are_intent_only_json_policyapproval_and_present_for_human_approval_remain_required|status=active|refs=.ai/POLICY-APPROVAL.md

principle|slot1=RP001|slot2=package_first_truth_validate_packaged_artifacts_not_local_state|status=active
principle|slot1=RP002|slot2=safety_before_speed_block_publish_on_unresolved_risk|status=active
principle|slot1=RP003|slot2=evidence_over_assumption_record_proof_for_each_gate|status=active
principle|slot1=RP004|slot2=human_governed_changes_explicit_review_for_risky_migrations_or_policy|status=active|refs=.ai/PRINCIPLES.md
principle|slot1=RP005|slot2=continuous_improvement_convert_release_pain_into_follow_up_work|status=active

gate|slot1=G001|slot2=scope_tracked_in_task_engine_with_roadmap_context|when=before_publish|on_fail=stop|refs=.workspace-kit/tasks/state.json
gate|slot1=G002|slot2=behavior_changes_documented_in_changelog|when=before_publish|on_fail=stop|refs=docs/maintainers/CHANGELOG.md
gate|slot1=G003|slot2=build_typecheck_and_tests_pass|when=before_publish|on_fail=stop|cmd=pnpm run build && pnpm run check && pnpm run test
gate|slot1=G004|slot2=consumer_impacting_flows_validated_against_packaged_artifacts|when=before_publish|on_fail=stop|cmd=pnpm run parity
gate|slot1=G005|slot2=migration_risk_reviewed_for_config_template_schema_state_changes|when=before_publish|on_fail=stop
gate|slot1=G006|slot2=security_sensitive_changes_explicitly_reviewed|when=before_publish|on_fail=stop|refs=docs/maintainers/SECURITY.md

workflow|id=W200|name=release_procedure|when=phase_release|do=define_scope_and_classify_risk>prepare_changelog_and_version>run_validation_build_check_test_pack_parity_maintainer_gates>present_for_human_approval>publish_via_automation>verify_consumer_installability|done=package_published+evidence_recorded|forbid=publish_when_gate_fails|halt_if=human_approval_missing|approval=required|risk=critical|status=active

evidence|slot1=E001|slot2=release_version_and_tag|required=true
evidence|slot1=E002|slot2=ci_publish_workflow_run_links|required=true
evidence|slot1=E003|slot2=validation_command_results_or_artifact_references|required=true
evidence|slot1=E004|slot2=npm_package_reference|required=true
evidence|slot1=E005|slot2=migration_notes_if_any|required=conditional
evidence|slot1=E006|slot2=known_risks_caveats_and_follow_up_tasks|required=true
evidence|slot1=E007|slot2=workspace_kit_run_release_evidence_manifest_json|required=true

workflow|id=W201|name=post_release|when=after_publish|do=monitor_for_regressions>triage_and_patch_if_needed>capture_friction_themes>route_to_task_engine_roadmap_or_enhancement_queue|done=follow_up_tracked|approval=none|risk=low|status=active
