meta|doc=workbook|truth=canonical|schema=base.v2|status=active|profile=workbook

workbook|name=task_engine_schema_workbook|phase=1|release=v0.3.0
ref|id=maintainer_view|target=docs/maintainers/workbooks/task-engine-workbook.md|type=file|status=active
ref|id=task_state|target=.workspace-kit/tasks/state.json|type=file|status=active

state_model|statuses=proposed,ready,in_progress,blocked,completed,cancelled
transition_rule|slot1=must|slot2=enforce_allowed_transition_map_and_dependency_guards
persistence|store=.workspace-kit/tasks/state.json|schema_version=1
evidence|must_emit_transition_records=true
queue|next_actions=priority_sorted_ready_queue_with_blocking_analysis

rule|id=R001|level=must|scope=keep_transition_behavior_deterministic_and_test_covered|status=active|why=rationale_for_R001
rule|id=R002|level=must|scope=treat_task_engine_state_as_single_execution_source_of_truth|status=active|why=rationale_for_R002
phase13|scope=crud_dependency_history_summary_bridge_commands
phase13|archival=soft_delete_with_default_queue_exclusion
phase13|evidence=mutation_log_merged_with_transition_log_for_history_queries
phase13|immutable_update_fields=id,createdAt,status
