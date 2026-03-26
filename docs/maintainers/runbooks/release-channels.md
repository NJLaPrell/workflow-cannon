# Release Channels

Operational mapping for `canary`, `stable`, and `lts` channels.

AI-canonical companion: `.ai/runbooks/release-channels.md`.

This file is the human companion to `docs/maintainers/data/compatibility-matrix.json`, which is the machine-readable source of truth.

| Channel | npm dist-tag | Git tag pattern | GitHub release label | Compatibility posture |
| --- | --- | --- | --- | --- |
| `canary` | `canary` | `v*` (pre-release allowed) | `pre-release` | Fast feedback, may include prerelease semver suffixes |
| `stable` | `latest` | `v*` (no prerelease) | `release` | Default production channel; no prerelease versions |
| `lts` | `lts` | `v*` (no prerelease) | `release-lts` | Backport/maintenance track with stricter change control |

## Promotion and rollback

- Promote `canary` -> `stable` only after CI + parity + phase4 gates pass and manual readiness gates are approved.
- Promote `stable` -> `lts` only for versions that will receive maintenance support.
- Rollback never mutates existing git tags; publish a corrective patch version and update channel labels/dist-tags forward.
