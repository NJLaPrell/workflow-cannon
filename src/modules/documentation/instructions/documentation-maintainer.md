<!--
agentCapsule|v=1|command=documentation-maintainer|module=documentation|schema_only=pnpm exec wk run documentation-maintainer --schema-only '{}'
-->


meta|v=1|doc=generator|truth=canonical|st=active

goal|produce=canonical_project_docs|opt=max_obedience_per_token|minimize=ambiguity,drift,token_waste
io|in=repo_files,code_config,existing_docs,core_schema|out=manifest,rules,map,workflows,commands,decisions,glossary,observed,planned,checks
authority|order=canonical_ai_docs>code_and_config_reality>generated_human_docs>narrative_docs

use|schema=src/modules/documentation/schemas/documentation-schema.md
create|files=.ai/00-manifest.md,.ai/01-rules.md,.ai/02-map.md,.ai/03-workflows.md,.ai/04-commands.md,.ai/05-decisions.md,.ai/06-glossary.md,.ai/07-observed.md,.ai/08-planned.md,.ai/09-checks.md
min_set|files=manifest,rules,map,workflows

author|one_record_per_line=true|meta_first_once=true|stable_order=true|omit_empty_optional=true|one_fact_per_record=true|exceptions_inline=true
author|explicit=level,scope,directive,trigger,done,approval,stop_prompt_behavior
author|forbid=vague_directives,undefined_shorthand,hidden_exceptions,softened_requirements,duplicate_meaning,manual_reordering_without_reason

classify|rule=intended_policy_for_future_action
classify|observed=current_reality_or_drift_not_policy
classify|planned=target_state_not_yet_true
classify|decision=compact_choice_plus_consequence
classify|check=validation_assertion
classify|term=project_specific_term_only

infer|allowed=project_identity,stack,repo_scope,path_roles,module_roles,commands,high_confidence_workflows,observed_facts
infer|forbid=unstated_policy,hidden_exceptions,preferred_style_without_evidence,intent_from_accidental_code_smells
infer|policy_from=explicit_docs,repeated_patterns_with_high_confidence,user_stated_preferences,active_decisions
infer|when_unclear=write_observed_or_draft_not_rule

rule|write=rule|RID|lvl|scope|directive|optional_fields
rule|good=add_migration,preserve_backward_compatibility,contain_business_logic,commit_secrets,manual_edit,add_or_update_tests
rule|bad=best_practices,clean_code,good_design,keep_it_simple,do_the_right_thing
rule|levels=must,must_not,should,may
rule|scope=concrete_and_stable
rule|exception=inline_unless
rule|interaction=ov=auto,warn,prompt,stop_when_needed
rule|new_id_if=meaning_changes
rule|keep_id_if=meaning_same_and_fields_refined

map|write=path_and_module_records_only
map|path_fields=role,has,xhas,deps,xdeps,check,st,refs
map|module_fields=role,owns,deps,xdeps,entry,tests,st,refs
map|require=ownership_boundaries_for_major_paths
map|forbid=generic_roles,misc_buckets

wf|write=wf|WID|name|when|do|done|optional_fields
wf|require=trigger_and_done_when_tasklike
wf|use=forbid,ask_if,halt_if,ap,risk_when_relevant
wf|common_first=true|risky_early=true|clarify_last=true
wf|stop_if=destructive_unapproved,policy_conflict_unresolved,unsafe_missing_info
wf|ask_if=multiple_valid_interpretations,required_choice_missing

cmd|write=canonical_commands_only
cmd|include=install,dev,test,lint,build_when_present
cmd|forbid=speculative_commands

decision|write=only_active_high_value_choices
decision|require=topic,choice
decision|prefer=why,then
decision|forbid=long_narrative

term|write=only_if_reduces_ambiguity
term|forbid=common_engineering_terms,indirection_debt

observed|write=for_drift_violations_legacy_patterns_notable_current_facts
planned|write=for_target_state_not_yet_implemented
check|write=for_required_validation_gates_and_done_assertions

order|manifest=meta,project,stack,prio,truth,ref
order|rules=global,risky,scoped,workflow,style
order|map=roots,major,special,legacy
order|workflows=common,risky,edge,clarify

validate|struct=allowed_record_types,required_fields,valid_enums,valid_ids,meta_first_once
validate|semantic=no_duplicate_active_ids,no_conflicting_active_rules_without_exception,no_vague_directives,no_observed_as_rule,no_planned_as_rule,no_unknown_paths_without_reason
validate|interaction=critical_secret_risk_stop,destructive_unapproved_stop_or_required,ambiguity_prompt_or_observed

stop|if=critical_secret_risk,destructive_change_without_approval,unresolved_policy_conflict,unsafe_missing_info
prompt|if=multiple_valid_interpretations,required_approval_missing,repo_intent_unclear_but_safe_to_ask
warn|if=should_violation,low_risk_uncertainty,minor_doc_drift
auto|if=low_risk_clear_routine_work

output|deterministic=true|preserve_existing_order_when_semantics_same=true|preserve_ids=true
output|never=soften_must_to_should,drop_unless,merge_distinct_rules_into_fuzzy_prose,invent_rationale
