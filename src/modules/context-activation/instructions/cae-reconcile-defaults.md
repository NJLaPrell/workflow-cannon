<!--
agentCapsule|v=1|command=cae-reconcile-defaults|module=context-activation|schema_only=pnpm exec wk run cae-reconcile-defaults --schema-only '{}'
-->

# cae-reconcile-defaults

Read-only comparison of the **package** CAE registry (seed JSON) against the **active** SQLite registry: default-namespace artifacts, digests, hidden defaults in the package, and workspace clone candidates that diverge from paired `cae.*` defaults.

Tier **C** — no **`policyApproval`**.

## Usage

```
workspace-kit run cae-reconcile-defaults '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |

## Returns

`ok: true`, **`code`**: `cae-reconcile-defaults-ok`, **`data`** with **`schemaVersion`**: **1**, digests, **`newDefaultsInPackage`**, **`missingDefaultsOnActive`**, **`changedDefaults`**, **`hiddenDefaultsInPackage`**, **`workspaceCloneCandidates`**, and **`recommendedActions`**.
