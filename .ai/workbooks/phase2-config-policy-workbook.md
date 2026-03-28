meta|doc=workbook|truth=canonical|schema=base.v2|status=active|profile=workbook

workbook|name=phase2_config_policy_baseline|phase=2|release=v0.4.0
ref|id=maintainer_view|target=docs/maintainers/workbooks/phase2-config-policy-workbook.md|type=file|status=active
ref|id=config_matrix|target=docs/maintainers/config-policy-matrix.md|type=file|status=active
ref|id=task_engine_state|target=.workspace-kit/tasks/state.json|type=file|status=active

scope|tasks=T218,T187,T200,T188,T201,T189
decision|id=D201|config_precedence=kit_defaults>module_defaults>project_config>env>invocation
decision|id=D202|sensitive_ops_require_policy_approval=true
decision|id=D203|actor_resolution=arg>env>git_email_or_name>unknown
decision|id=D204|task_state_persistence=file_backed_json_under_.workspace-kit

rule|id=R001|level=must|scope=new_write_commands_default_to_sensitive_unless_explicitly_exempted|status=active|why=rationale_for_R001
rule|id=R002|level=must|scope=record_policy_decision_traces_with_deterministic_fields|status=active|why=rationale_for_R002
