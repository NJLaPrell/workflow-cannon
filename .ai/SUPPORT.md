meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=support_policy|scope=repo
ref|id=security|target=docs/maintainers/SECURITY.md|type=file|status=active
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

channel|slot1=C001|type=usage_questions|target=github_issues|include=reproduction_details|status=active
channel|slot1=C002|type=feature_requests|target=github_issues|include=context_and_proposed_direction|status=active
channel|slot1=C003|type=security_reports|target=github_security_advisories|refs=docs/maintainers/SECURITY.md|status=active

report|include=version_or_commit,os_and_runtime,commands_run,expected_vs_actual,logs_or_traces

sla|initial_triage=5_business_days|priority_basis=severity_reproducibility_impact
