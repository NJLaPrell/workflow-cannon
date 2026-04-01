# How to mark a `workspace-kit run` command as policy-sensitive

Use this when adding a **new** module command that can mutate workspace state, task-engine data, policy traces, or other governed surfaces.

## Shipped builtins

1. Add a row to **`src/contracts/builtin-run-command-manifest.json`** with:
   - **`policySensitivity`**: **`non-sensitive`** | **`sensitive`** | **`sensitive-with-dryrun`**
   - **`policyOperationId`**: required when sensitivity is not **`non-sensitive`** (must match a value in **`PolicyOperationId`** in **`src/core/policy.ts`**).
2. **`sensitive-with-dryrun`** is only for **`doc.document-project`** and **`doc.generate-document`** (documentation generation can waive sensitivity when **`options.dryRun`** is **`true`** — see **`isSensitiveModuleCommand`** in **`src/core/policy.ts`**).
3. Run **`pnpm run check`** — **`scripts/check-builtin-command-manifest.mjs`** fails if classification is missing or inconsistent.

## Dynamic sensitivity (extensions / config)

To mark a **non-builtin** command name sensitive without changing the manifest, add it to effective config **`policy.extraSensitiveModuleCommands`**. Runtime uses operation id **`policy.dynamic-sensitive`** and the same JSON **`policyApproval`** path as other Tier B commands.

## Policy operation ids

New sensitive builtins need a stable **`PolicyOperationId`** string in **`src/core/policy.ts`**, the manifest check script’s **`KNOWN_POLICY_OPERATION_IDS`**, and (when user-visible) **`docs/maintainers/AGENT-CLI-MAP.md`** Tier A/B examples.

## Related

- **`docs/maintainers/POLICY-APPROVAL.md`** — approval lanes
- **`docs/maintainers/AGENT-CLI-MAP.md`** — copy-paste patterns
