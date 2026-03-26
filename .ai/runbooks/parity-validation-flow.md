meta|v=1|doc=runbook|truth=canonical|st=active

runbook|name=parity_validation_flow|scope=release_readiness|owner=maintainers
ref|name=maintainer_view|path=docs/maintainers/runbooks/parity-validation-flow.md
ref|name=release_gates|path=docs/maintainers/release-gate-matrix.md
ref|name=releasing|path=docs/maintainers/RELEASING.md
ref|name=parity_schema|path=schemas/parity-evidence.schema.json

intent|validate_packaged_artifact_behavior_matches_expected_runtime_contract_before_release
rule|R001|must|run_parity_commands_in_fixed_order_and_stop_on_first_non_zero_exit|st=active
rule|R002|must|write_parity_evidence_artifact_for_pass_and_fail_outcomes|st=active
rule|R003|must|treat_parity_failures_as_release_blocking_until_resolved|st=active

chain|step=1|command=pnpm run build|expect_exit=0
chain|step=2|command=pnpm run check|expect_exit=0
chain|step=3|command=pnpm run test|expect_exit=0
chain|step=4|command=pnpm run pack:dry-run|expect_exit=0
chain|step=5|command=node scripts/check-release-metadata.mjs|expect_exit=0
chain|step=6|command=npm install <tarball> (test/fixtures/parity)|expect_exit=0
chain|step=7|command=npm run smoke (test/fixtures/parity)|expect_exit=0

artifact|path=artifacts/parity-evidence.json|schema=schemas/parity-evidence.schema.json
