meta|v=1|doc=workbook|truth=canonical|st=active

workbook|name=phase2_config_policy_baseline|phase=2|release=v0.4.0
ref|name=maintainer_view|path=docs/maintainers/workbooks/phase2-config-policy-workbook.md
ref|name=config_matrix|path=docs/maintainers/config-policy-matrix.md
ref|name=task_engine_state|path=.workspace-kit/tasks/state.json

scope|tasks=T218,T187,T200,T188,T201,T189
decision|D201|config_precedence=kit_defaults>module_defaults>project_config>env>invocation
decision|D202|sensitive_ops_require_policy_approval=true
decision|D203|actor_resolution=arg>env>git_email_or_name>unknown
decision|D204|task_state_persistence=file_backed_json_under_.workspace-kit

rule|R001|must|new_write_commands_default_to_sensitive_unless_explicitly_exempted|st=active
rule|R002|must|record_policy_decision_traces_with_deterministic_fields|st=active
