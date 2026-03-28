meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=security_policy|scope=repo
ref|id=principles|target=.ai/PRINCIPLES.md|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active
ref|id=support|target=docs/maintainers/SUPPORT.md|type=file|status=active
truth|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

rule|id=S001|level=must|scope=vulnerability_reporter|directive=report_privately_via_github_security_advisories|risk=critical|approval=none|override=stop|status=active|why=rationale_for_S001
rule|id=S002|level=must_not|scope=vulnerability_reporter|directive=open_public_issue_containing_exploit_details|risk=critical|approval=none|override=stop|status=active|why=rationale_for_S002

report|include=description,affected_version_or_commit,reproduction_steps,impact_assessment,suggested_remediation

sla|acknowledgement=3_business_days|triage=after_acknowledgement|disclosure=coordinated_with_reporter

scope|slot1=S010|slot2=credential_and_secret_handling|risk=critical|status=active
scope|slot1=S011|slot2=policy_and_approval_bypass_risks|risk=critical|status=active|refs=.ai/PRINCIPLES.md
scope|slot1=S012|slot2=unsafe_workspace_mutation_or_injection_vectors|risk=high|status=active
scope|slot1=S013|slot2=data_retention_redaction_and_privacy_controls|risk=high|status=active
