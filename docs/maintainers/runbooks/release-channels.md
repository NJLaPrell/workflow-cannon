<!-- GENERATED FROM .ai/runbooks/release-channels.md — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

meta|doc=runbook|truth=canonical|schema=base.v2|status=active|profile=runbook

runbook|name=release_channels|scope=channel_mapping_and_promotion|owner=maintainers
ref|id=maintainer_view|target=docs/maintainers/runbooks/release-channels.md|type=file|status=active
ref|id=compat_matrix|target=docs/maintainers/data/compatibility-matrix.json|type=file|status=active

channel|name=canary|dist_tag=canary|git_tag=v*|github_label=pre-release|prerelease_allowed=true
channel|name=stable|dist_tag=latest|git_tag=v*|github_label=release|prerelease_allowed=false
channel|name=lts|dist_tag=lts|git_tag=v*|github_label=release-lts|prerelease_allowed=false

promotion|from=canary|to=stable|requires=ci_pass,parity_pass,phase_gates_pass,manual_readiness_approval
promotion|from=stable|to=lts|requires=maintenance_support_commitment
rollback|strategy=forward_fix_only|note=never_mutate_existing_git_tags
