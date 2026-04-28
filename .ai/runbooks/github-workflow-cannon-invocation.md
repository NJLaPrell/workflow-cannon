# Runbook: GitHub-native Workflow Cannon invocation

**Audience:** maintainers wiring **GitHub Actions** or **webhooks** to the Phase 55 reference runner.  
**ADR:** **`docs/maintainers/adrs/ADR-github-native-invocation.md`**.  
**Policy:** **`.ai/POLICY-APPROVAL.md`** — GitHub comments are **not** approval; mutating routes need JSON **`policyApproval`** inside **`WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON`**.

## What ships in-repo

| Artifact | Purpose |
| --- | --- |
| **`kit.githubInvocation.*`** config keys | Repo allowlist, event→route map, debounce, command allowlists |
| **`src/core/github-invocation.ts`** | HMAC verification, slash parsing, routing helpers (exported from package `dist`) |
| **`tools/github-invocation/run-github-delivery.mjs`** | Reference runner (requires **`pnpm run build`** so **`dist/cli.js`** exists, or run from a published install with matching layout) |
| **`docs/examples/github/workflow-cannon-invocation.sample.yml`** | Opt-in sample workflow (copy into **`.github/workflows/`**; disabled by default) |

## Config fragment (no secrets)

Store **only** non-secret data in **`.workspace-kit/config.json`**. Webhook secrets and tokens stay in **GitHub Actions secrets** or your secret manager.

```json
{
  "kit": {
    "githubInvocation": {
      "enabled": true,
      "allowedRepositories": ["YOUR_ORG/YOUR_REPO"],
      "eventPlaybookMap": {
        "issue_comment": "plan",
        "pull_request_review": "review"
      },
      "commentDebounceSeconds": 30,
      "rateLimitEventsPerHour": 0,
      "planOnlyRunCommands": ["get-next-actions", "list-tasks", "get-task"],
      "sensitiveRunCommands": ["run-transition"]
    }
  }
}
```

Use **`pnpm exec wk config set …`** with **`WORKSPACE_KIT_POLICY_APPROVAL`** for mutating keys (see **`POLICY-APPROVAL.md`**).

Regenerate **`docs/maintainers/CONFIG.md`** / **`.ai/CONFIG.md`** after registry changes: **`pnpm exec wk config generate-docs`**.

## Slash commands (comment body)

First matching non-empty line wins (see ADR):

- **`/cannon-plan`** → plan route (read-only allowlist)
- **`/cannon-implement`**, **`/cannon-review`**, **`/cannon-fix-review`** → mutating route (**policy + args JSON** required)

## Two execution contexts

### A) GitHub Actions (`GITHUB_ACTIONS=true`)

- **Signature verification is skipped** — trust is “GitHub executed this workflow in your repo.”
- Set **`GITHUB_EVENT_PATH`** (default in `issue_comment` workflows) so the runner loads the payload.
- Plan route: optional **`WORKSPACE_KIT_GITHUB_PLAN_COMMAND`** (default **`get-next-actions`**) and **`WORKSPACE_KIT_GITHUB_PLAN_ARGS_JSON`** (default **`{}`**).

### B) Generic webhook relay

- Provide **raw body bytes** exactly as received (`--raw-body` or **`GITHUB_WEBHOOK_PAYLOAD_RAW_PATH`**).
- Set **`GITHUB_WEBHOOK_SECRET`** and pass **`GITHUB_WEBHOOK_SIGNATURE`** = `X-Hub-Signature-256` value.
- Optional **`GITHUB_DELIVERY_ID`** for audit correlation.

## Mutating routes (implement / review / fix-review)

The runner **does not** construct Tier A JSON from untrusted comments. The **workflow** must set:

1. **`WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL`** — JSON string with **`confirmed`** + **`rationale`** (same shape as env approval; consumed only to merge **`policyApproval`** when missing from args).
2. **`WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON`** — full third-argument object for **`workspace-kit run`**, e.g.  
   `'{"taskId":"T649","action":"start","policyApproval":{"confirmed":true,"rationale":"bot lane per runbook"}}'`

Optional **`WORKSPACE_KIT_GITHUB_RUN_COMMAND`** (default **`run-transition`**). Command must appear in **`kit.githubInvocation.sensitiveRunCommands`**.

## Audit output

The runner prints **one JSON line** per invocation (`schemaVersion`, `githubDeliveryId`, `decision`, `taskIdsReferenced`, …). Capture it in workflow logs; **never** log tokens or raw **`policyApproval`** from env.

## Local dry-run

From repo root after **`pnpm run build`**:

```bash
node tools/github-invocation/run-github-delivery.mjs \
  --cwd . \
  --payload test/fixtures/github-invocation/issue-comment-plan.json \
  --dry-run
```

Webhook mode needs **`GITHUB_ACTIONS=true`** for this fixture (no raw body), or supply raw bytes + signature.

## Failure modes

| Symptom | Check |
| --- | --- |
| **`disabled`** | **`kit.githubInvocation.enabled`** false |
| **`repo-denied`** | **`allowedRepositories`** includes exact **`owner/repo`** |
| **`signature-invalid`** | Secret, raw body, and `sha256=` signature align with GitHub docs |
| **`policy-denied`** | Mutating route without env JSON for policy + args |
| **`debounced`** | **`commentDebounceSeconds`**; multi-replica needs external coordination |

## Related

- **`docs/maintainers/AGENT-CLI-MAP.md`** — Tier A **`run-transition`** copy-paste
- **`docs/maintainers/RELEASING.md`** — evidence when automation touches releases
