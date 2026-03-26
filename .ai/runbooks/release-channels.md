meta|v=1|doc=runbook|truth=canonical|st=active

runbook|name=release_channels|scope=channel_mapping_and_promotion|owner=maintainers
ref|name=maintainer_view|path=docs/maintainers/runbooks/release-channels.md
ref|name=compat_matrix|path=docs/maintainers/data/compatibility-matrix.json

channel|name=canary|dist_tag=canary|git_tag=v*|github_label=pre-release|prerelease_allowed=true
channel|name=stable|dist_tag=latest|git_tag=v*|github_label=release|prerelease_allowed=false
channel|name=lts|dist_tag=lts|git_tag=v*|github_label=release-lts|prerelease_allowed=false

promotion|from=canary|to=stable|requires=ci_pass,parity_pass,phase_gates_pass,manual_readiness_approval
promotion|from=stable|to=lts|requires=maintenance_support_commitment
rollback|strategy=forward_fix_only|note=never_mutate_existing_git_tags
