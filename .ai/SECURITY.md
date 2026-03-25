meta|v=1|doc=rules|truth=canonical|st=active

project|name=workflow-cannon|type=security_policy|scope=repo
ref|name=principles|path=.ai/PRINCIPLES.md
ref|name=releasing|path=docs/maintainers/RELEASING.md
ref|name=support|path=docs/maintainers/SUPPORT.md
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

rule|S001|must|vulnerability_reporter|report_privately_via_github_security_advisories|risk=critical|ap=none|ov=stop|st=active
rule|S002|must_not|vulnerability_reporter|open_public_issue_containing_exploit_details|risk=critical|ap=none|ov=stop|st=active

report|include=description,affected_version_or_commit,reproduction_steps,impact_assessment,suggested_remediation

sla|acknowledgement=3_business_days|triage=after_acknowledgement|disclosure=coordinated_with_reporter

scope|S010|credential_and_secret_handling|risk=critical|st=active
scope|S011|policy_and_approval_bypass_risks|risk=critical|st=active|refs=.ai/PRINCIPLES.md
scope|S012|unsafe_workspace_mutation_or_injection_vectors|risk=high|st=active
scope|S013|data_retention_redaction_and_privacy_controls|risk=high|st=active
