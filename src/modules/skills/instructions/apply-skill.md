<!--
agentCapsule|v=1|command=apply-skill|module=skills|schema_only=pnpm exec wk run apply-skill --schema-only '{}'
-->

# apply-skill

Preview (default; not policy-sensitive):

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill","options":{"dryRun":true}}'
```

Full materialization (requires JSON `policyApproval` in the third CLI argument per `POLICY-APPROVAL.md`):

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill","options":{"dryRun":false,"recordAudit":true},"policyApproval":{"confirmed":true,"rationale":"record apply audit"}}'
```

`options.dryRun` defaults to **true**. When `dryRun` is **false**, the command is policy-sensitive. Optional `recordAudit: true` inserts a row into **`kit_skill_apply_audit`** in unified kit SQLite (only when `dryRun` is false). Legacy **`skill-apply-audit.jsonl`** is import-only.
