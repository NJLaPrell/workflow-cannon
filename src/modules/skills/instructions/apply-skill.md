# apply-skill

Preview (default; not policy-sensitive):

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill","options":{"dryRun":true}}'
```

Full materialization (requires JSON `policyApproval` in the third CLI argument per `POLICY-APPROVAL.md`):

```bash
workspace-kit run apply-skill '{"skillId":"sample-wc-skill","options":{"dryRun":false,"recordAudit":true},"policyApproval":{"confirmed":true,"rationale":"record apply audit"}}'
```

`options.dryRun` defaults to **true**. When `dryRun` is **false**, the command is policy-sensitive. Optional `recordAudit: true` appends a line to `.workspace-kit/evidence/skill-apply-audit.jsonl` (only when `dryRun` is false).
