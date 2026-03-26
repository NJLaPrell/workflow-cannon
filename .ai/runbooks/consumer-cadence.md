meta|v=1|doc=runbook|truth=canonical|st=active

runbook|name=consumer_update_cadence|scope=release_channel_transitions|owner=maintainers
ref|name=maintainer_view|path=docs/maintainers/runbooks/consumer-cadence.md
ref|name=gate_matrix|path=docs/maintainers/release-gate-matrix.md
ref|name=releasing|path=docs/maintainers/RELEASING.md

state|name=candidate|dist_tag=next|intent=pre_release_validation
state|name=stable|dist_tag=latest|intent=recommended_production_channel
state|name=patch|dist_tag=latest|intent=fast_follow_fix_for_stable

transition|from=candidate|to=stable|requires=ci_pass,parity_pass,fixture_pass,no_open_p1,maintainer_signoff
transition|from=candidate|to=candidate|requires=fix_merged,new_candidate_publish,restart_validation
transition|from=stable|to=patch|requires=regression_confirmed,ci_pass,parity_pass,evidence_captured

rule|R001|must|block_transition_on_any_non_zero_validation_command|st=active
rule|R002|must|track_regression_blockers_in_task_engine_state|st=active
