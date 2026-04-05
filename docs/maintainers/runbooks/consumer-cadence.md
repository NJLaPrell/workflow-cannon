<!-- GENERATED FROM .ai/runbooks/consumer-cadence.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

meta|doc=runbook|truth=canonical|schema=base.v2|status=active|profile=runbook

runbook|name=consumer_update_cadence|scope=release_channel_transitions|owner=maintainers
ref|id=maintainer_view|target=docs/maintainers/runbooks/consumer-cadence.md|type=file|status=active
ref|id=gate_matrix|target=docs/maintainers/release-gate-matrix.md|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active

state|name=candidate|dist_tag=next|intent=pre_release_validation
state|name=stable|dist_tag=latest|intent=recommended_production_channel
state|name=patch|dist_tag=latest|intent=fast_follow_fix_for_stable

transition|from=candidate|to=stable|requires=ci_pass,parity_pass,fixture_pass,no_open_p1,maintainer_signoff
transition|from=candidate|to=candidate|requires=fix_merged,new_candidate_publish,restart_validation
transition|from=stable|to=patch|requires=regression_confirmed,ci_pass,parity_pass,evidence_captured

rule|id=R001|level=must|scope=block_transition_on_any_non_zero_validation_command|status=active|why=rationale_for_R001
rule|id=R002|level=must|scope=track_regression_blockers_in_task_engine_state|status=active|why=rationale_for_R002
