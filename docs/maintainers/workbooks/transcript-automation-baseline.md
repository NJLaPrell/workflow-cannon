<!-- GENERATED FROM .ai/workbooks/transcript-automation-baseline.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

meta|doc=workbook|truth=canonical|schema=base.v2|status=active|profile=workbook

workbook|name=transcript_automation_baseline|phase=5|status=baseline_locked
ref|id=maintainer_view|target=docs/maintainers/workbooks/transcript-automation-baseline.md|type=file|status=active
ref|id=roadmap|target=docs/maintainers/ROADMAP.md|type=file|status=active
ref|id=task_engine_state|target=.workspace-kit/tasks/workspace-kit.db|type=file|status=active
ref|id=task_engine_state_json_optout|target=.workspace-kit/tasks/state.json|type=file|status=active
ref|id=improvement_config|target=src/modules/improvement/config.md|type=file|status=active
ref|id=improvement_triage_playbook|target=docs/maintainers/playbooks/improvement-triage-top-three.md|type=file|status=active
ref|id=improvement_discovery_playbook|target=docs/maintainers/playbooks/improvement-task-discovery.md|type=file|status=active

scope|primary_tasks=T244,T245,T246,T247,T248,T259
scope|follow_on_tasks=T249-T258,T260-T266

command|name=sync-transcripts|purpose=copy_source_jsonl_into_local_archive|sensitivity=non_sensitive
command|name=ingest-transcripts|purpose=sync_then_conditionally_generate_recommendations|sensitivity=policy_sensitive
command|name=generate-recommendations|purpose=create_improvement_tasks_from_evidence|sensitivity=policy_sensitive

config|key=improvement.transcripts.sourcePath|default=.cursor/agent-transcripts
config|key=improvement.transcripts.archivePath|default=agent-transcripts
config|key=improvement.cadence.minIntervalMinutes|default=15
config|key=improvement.cadence.skipIfNoNewTranscripts|default=true

cadence|rule=skip_when_no_new_transcripts_and_skipIfNoNewTranscripts_true
cadence|rule=skip_when_elapsed_minutes_below_minIntervalMinutes
cadence|rule=generate_when_first_run_or_interval_satisfied_or_forceGenerate_true
cadence|decision_skipped_no_new_transcripts=skipped-no-new-transcripts
cadence|decision_skipped_min_interval=skipped-min-interval
cadence|decision_run_first_ingest=run-first-ingest
cadence|decision_run_invalid_last_ingest_at=run-invalid-last-ingest-at
cadence|decision_run_min_interval_satisfied=run-min-interval-satisfied
improvement_lifecycle|proposed_ready=run_transition_accept
improvement_lifecycle|ready_proposed_demote=run_transition_demote

guardrail|slot1=G001|slot2=must|slot3=keep_transcript_archives_local_only_by_default|status=active
guardrail|slot1=G002|slot2=must|slot3=keep_source_transcripts_read_only_during_sync|status=active
guardrail|slot1=G003|slot2=must|slot3=require_same_change_updates_for_command_config_or_cadence_semantic_changes|status=active
