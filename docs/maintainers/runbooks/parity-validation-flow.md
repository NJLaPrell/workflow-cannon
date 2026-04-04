<!-- GENERATED FROM .ai/runbooks/parity-validation-flow.md — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

meta|doc=runbook|truth=canonical|schema=base.v2|status=active|profile=runbook

runbook|name=parity_validation_flow|scope=release_readiness|owner=maintainers
ref|id=maintainer_view|target=docs/maintainers/runbooks/parity-validation-flow.md|type=file|status=active
ref|id=release_gates|target=docs/maintainers/release-gate-matrix.md|type=file|status=active
ref|id=releasing|target=docs/maintainers/RELEASING.md|type=file|status=active
ref|id=parity_schema|target=schemas/parity-evidence.schema.json|type=file|status=active

intent|slot1=validate_packaged_artifact_behavior_matches_expected_runtime_contract_before_release
rule|id=R001|level=must|scope=run_parity_commands_in_fixed_order_and_stop_on_first_non_zero_exit|status=active|why=rationale_for_R001
rule|id=R002|level=must|scope=write_parity_evidence_artifact_for_pass_and_fail_outcomes|status=active|why=rationale_for_R002
rule|id=R003|level=must|scope=treat_parity_failures_as_release_blocking_until_resolved|status=active|why=rationale_for_R003

chain|step=1|command=pnpm run build|expect_exit=0
chain|step=2|command=pnpm run check|expect_exit=0
chain|step=3|command=pnpm run test|expect_exit=0
chain|step=4|command=pnpm run pack:dry-run|expect_exit=0
chain|step=5|command=node scripts/check-release-metadata.mjs|expect_exit=0
chain|step=6|command=npm install <tarball> (test/fixtures/parity)|expect_exit=0
chain|step=7|command=npm run smoke (test/fixtures/parity)|expect_exit=0

artifact|target=artifacts/parity-evidence.json|schema=schemas/parity-evidence.schema.json
