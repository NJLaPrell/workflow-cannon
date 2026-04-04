# ADR: GitHub-native invocation (webhooks, Actions, slash routing)

## Status

Accepted — Phase 55 (`T649`–`T653`), release **`v0.55.0`**.

Provenance: wishlist **`T566`**.

## Context

Maintainers want to **trigger `workspace-kit` from GitHub** (issue comments, PR review threads, labeled workflows) without abandoning **policy lanes**, **`run-transition` evidence**, or the SQLite task store. Remote automation introduces **new trust boundaries**: anyone who can open an issue or comment may try to drive the kit; webhook endpoints must prove **authenticity** and **intent** before spawning CLI processes.

## Decision

1. **Transport options (documented trade space)**  
   - **GitHub Actions** (recommended first integration): repository/organization secrets, OIDC where applicable, no inbound HTTP listener in the consumer repo for the happy path. The reference runner is invoked as a **step** with payload + secret injected by Actions.  
   - **GitHub App webhooks** (optional): HMAC-signed deliveries (`X-Hub-Signature-256`), installation tokens with least privilege, explicit repo allowlists in kit config.  
   - **Repository webhooks** (legacy pattern): same HMAC contract; treat as equivalent to App deliveries for signature verification in the reference runner.

2. **Slash-command inventory (maintainer contract)**  
   Remote comments MAY use these prefixes (first matching line of the comment body):  
   - **`/cannon-plan`** — read-only / plan posture: only commands in **`kit.githubInvocation.planOnlyRunCommands`** (default includes **`get-next-actions`**, **`list-tasks`**, **`get-task`**).  
   - **`/cannon-implement`**, **`/cannon-review`**, **`/cannon-fix-review`** — **mutating / sensitive** posture: runner MUST NOT invoke Tier A / policy-gated **`workspace-kit run`** subcommands unless **`WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL`** is set to valid JSON **`policyApproval`** (see **`POLICY-APPROVAL.md`**). If absent, the runner emits **`policy-denied`** audit JSON and exits without invoking those commands.

3. **Event → route mapping**  
   **`kit.githubInvocation.eventPlaybookMap`** maps a string event key (e.g. **`issue_comment`**, **`pull_request_review`**) to a **route kind**: **`plan`**, **`implement`**, **`review`**, **`fix-review`**, or **`none`**. When the body contains an explicit slash command, the slash command **wins** over the map. **`none`** means “accept webhook but take no automated action” (log only).

4. **Threat model (summary)**  
   - **Spoofed payloads** — Mitigate with **HMAC-SHA256** over the raw body (`sha256=` prefix per GitHub). Use **timing-safe** comparison.  
   - **Replay** — Webhooks can be replayed; document **idempotency** expectations (debounce by issue/PR + **`commentDebounceSeconds`** in config; multi-replica deployments need an external store — out of scope for the MVP runner).  
   - **Repo confusion** — Enforce **`kit.githubInvocation.allowedRepositories`** (`owner/repo` full names) before any CLI spawn.  
   - **Token exfiltration** — Never log **`GITHUB_TOKEN`**, webhook secrets, or **`policyApproval`** payloads; stderr/stdout from the runner should be structured JSON lines only.  
   - **Privilege escalation** — The runner does **not** bypass **`workspace-kit`** policy registry; mutating paths require explicit **`policyApproval`** JSON in the environment as documented.

5. **Non-goals (Phase 55)**  
   - No first-party hosted webhook receiver in this repo.  
   - No guarantee of multi-instance debounce consistency.  
   - No automatic **`run-transition`** from untrusted comment text without human-approved policy JSON.

6. **Audit and correlation**  
   Each processed delivery emits one JSON object including **`githubDeliveryId`** (from `X-GitHub-Delivery` or payload), **`routeKind`**, **`decision`** (`invoked` | `policy-denied` | `repo-denied` | `signature-invalid` | `disabled` | `debounced` | `none-route`), **`taskIdsReferenced`** (regex **`T[0-9]{3,}`** from comment body for linkage). See **`docs/maintainers/runbooks/github-workflow-cannon-invocation.md`**.

## Consequences

- Config surface: **`kit.githubInvocation.*`** (registry + generated **`CONFIG.md`**).  
- Library helpers: **`src/core/github-invocation.ts`** (signature verification, routing, audit shape).  
- Reference runner: **`tools/github-invocation/run-github-delivery.mjs`** (invoked after `pnpm run build` or from a published install).  
- Maintainer setup: sample workflow under **`docs/examples/github/`** (opt-in copy; not enabled by default).

## References

- **`docs/maintainers/POLICY-APPROVAL.md`** — JSON `policyApproval` for **`workspace-kit run`**.  
- **`docs/maintainers/RELEASING.md`** — release evidence when shipping automation.  
- **`docs/maintainers/ROADMAP.md`** — Phase 55 scope.  
- GitHub webhook signatures: [https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
