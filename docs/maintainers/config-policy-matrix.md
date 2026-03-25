# Config–policy decision matrix

Maps layered config fields to policy evaluation for `@workflow-cannon/workspace-kit` `v0.4.0`.  
Canonical precedence: see `docs/maintainers/phase2-config-policy-workbook.md`.

## Config layers vs policy

| Layer | Mutable by user | Consulted by policy | Notes |
| --- | --- | --- | --- |
| Kit defaults | No | No | Compiled fallbacks only. |
| Module `config.md` / defaults | Package release | No | Shipped with the kit; not workspace-edited. |
| `.workspace-kit/config.json` | Yes (maintainer) | **Yes** (indirect) | Changes write roots or doc behavior → affects what sensitive commands touch. |
| `WORKSPACE_KIT_*` | Yes (CI/local) | Same as project | Overrides project file. |
| `workspace-kit run` JSON `config` | Yes (invocation) | Same | Highest precedence; agents must still pass `policyApproval` for sensitive ops. |

## Sensitive operations vs config

| Operation ID | Config domains read (typical) | Policy gate |
| --- | --- | --- |
| `cli.init` | N/A (CLI) | `WORKSPACE_KIT_POLICY_APPROVAL` env JSON |
| `cli.upgrade` | N/A (CLI) | `WORKSPACE_KIT_POLICY_APPROVAL` env JSON |
| `doc.document-project` | `documentation` | `policyApproval` in JSON args unless `options.dryRun === true` |
| `doc.generate-document` | `documentation` | Same |
| `tasks.import-tasks` | `tasks` (e.g. `storeRelativePath`) | `policyApproval` in JSON args |
| `tasks.generate-tasks-md` | `tasks` | `policyApproval` in JSON args |
| `tasks.run-transition` | `tasks` | `policyApproval` in JSON args |

## Test-derived cases (T188)

- Sensitive command **without** `policyApproval` → `policy-denied`, trace `allowed: false`.
- Sensitive command **with** valid `policyApproval` → dispatches module; trace `allowed: true`, `commandOk` mirrors result.
- `generate-document` / `document-project` with `dryRun: true` → not sensitive; no approval.
- `explain-config` → not sensitive; no approval.

## Revision

| Date | Note |
| --- | --- |
| 2026-03-25 | Initial matrix for Phase 2 / `v0.4.0`. |
