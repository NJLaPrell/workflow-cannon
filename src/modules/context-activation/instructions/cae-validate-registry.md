<!--
agentCapsule|v=1|command=cae-validate-registry|module=context-activation|schema_only=pnpm exec wk run cae-validate-registry --schema-only '{}'
-->

# cae-validate-registry

**Alias** of **`cae-registry-validate`** — same JSON args, same behavior and response codes.

Use this name when aligning with **CAE_PLAN** Epic 4 D4 vocabulary; prefer **`cae-registry-validate`** in CI scripts that already reference it.

```
workspace-kit run cae-validate-registry '{"schemaVersion":1}'
```

See **`cae-registry-validate.md`** for full contract.
