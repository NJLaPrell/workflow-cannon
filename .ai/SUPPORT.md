meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=support_policy|scope=repo
ref|name=security|path=docs/maintainers/SECURITY.md
ref|name=principles|path=.ai/PRINCIPLES.md
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

channel|C001|type=usage_questions|path=github_issues|include=reproduction_details|st=active
channel|C002|type=feature_requests|path=github_issues|include=context_and_proposed_direction|st=active
channel|C003|type=security_reports|path=github_security_advisories|refs=docs/maintainers/SECURITY.md|st=active

report|include=version_or_commit,os_and_runtime,commands_run,expected_vs_actual,logs_or_traces

sla|initial_triage=5_business_days|priority_basis=severity_reproducibility_impact
