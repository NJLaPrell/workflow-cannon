# Workspace Kit Phase 6 consumer boundary

This maintainer note defines how consumer projects validate Workflow Cannon as an external package.

## Consumer contract

- Consumers should validate Workflow Cannon through packaged artifacts (published version or tagged tarball).
- Consumer checks must run `workspace-kit upgrade`, `workspace-kit init`, `workspace-kit check`, and `workspace-kit doctor` from a fixture workspace.
- Validation should avoid monorepo-relative unpublished source wiring as the primary gate.

## Canonical command shape

For any consumer repository, run a reproducible parity command that:

1. Produces or downloads a package tarball.
2. Installs the package in an isolated fixture.
3. Runs the command chain (`upgrade`, `init`, `check`, `doctor`).
4. Emits machine-readable evidence.

## CI and readiness policy

- Consumer CI should execute parity checks against packaged artifacts.
- Release/readiness gates should treat parity-check regressions as blocking.

## Operational note

Phase 6 completion requires extraction readiness and validated consumer boundaries, followed by successful cutover and publish verification.
