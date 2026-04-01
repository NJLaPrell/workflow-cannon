# Policy approval for mutating operations

The kit uses **fail-closed** policy: sensitive commands require explicit approval so automation cannot silently change your workspace or task engine.

Use this page when you see **`policy-denied`**, **`missing WORKSPACE_KIT_POLICY_APPROVAL`**, or JSON output mentioning **`policyApproval`**.

**Tiered copy-paste for agents:** `docs/maintainers/AGENT-CLI-MAP.md` lists every Tier A/B `workspace-kit run` command with example JSON and `operationId` values.

## Canonical: what counts as approval for `workspace-kit run`

For **sensitive** `workspace-kit run` commands, the CLI accepts **`policyApproval` in the third JSON argument**, a **valid session grant** for the same `operationId` + `WORKSPACE_KIT_SESSION_ID`, or **interactive approval** when stdio is a TTY and `WORKSPACE_KIT_INTERACTIVE_APPROVAL` enables the prompt.

**Not sufficient:** chat messages, ticket comments, or setting **`WORKSPACE_KIT_POLICY_APPROVAL`** alone — that env var is for **`init` / `upgrade` / `config`**, not the `run` path. See the table below and **`docs/maintainers/AGENT-CLI-MAP.md`**.

## Two approval surfaces (do not mix them up)

| Surface | When it applies | How to approve |
| --- | --- | --- |
| **`policyApproval` in JSON** | `workspace-kit run <command> …` when the command is **policy-sensitive** (e.g. `generate-recommendations`, `ingest-transcripts`, `run-transition`, `review-item`, doc generation without `dryRun`) | Pass a JSON object as the third CLI argument with `"policyApproval":{"confirmed":true,"rationale":"…"}`. Optionally `"scope":"session"` to reuse approval for the same operation and `WORKSPACE_KIT_SESSION_ID` (see session grants). |
| **`WORKSPACE_KIT_POLICY_APPROVAL` env** | **`workspace-kit init`**, **`workspace-kit upgrade`**, **`workspace-kit config`** mutating subcommands (`set`, `unset`, `edit`, …) | Export env var to JSON: `{"confirmed":true,"rationale":"…"}`. |
| **`WORKSPACE_KIT_INTERACTIVE_APPROVAL` env** | **`workspace-kit run`** sensitive commands only, when stdin+stdout are TTY (or tests inject `readStdinLine`) | Set to `on`, `1`, `true`, or `yes`. Prompts **d / o / s** (Deny / Allow once / Allow for session). Does **not** apply in CI when stdio is not a TTY unless you use the programmatic test hook. |

**Local `.env`:** On startup, `workspace-kit` loads the first `.env` found walking up from the current working directory into `process.env` (via `dotenv`, **`override: false`** — shell-exported variables win). Use the same JSON value for `WORKSPACE_KIT_POLICY_APPROVAL` as in the table above. Committed template: **`.env.example`** (actual **`.env`** is gitignored).

**`workspace-kit run` does not read `WORKSPACE_KIT_POLICY_APPROVAL`** for the run path itself. Repo helpers **`scripts/run-transcript-cli.mjs`** (`pnpm run transcript:ingest`) and **`scripts/pre-release-transcript-hook.mjs`** parse that env var and pass **`policyApproval`** inside the **third JSON argument** to `ingest-transcripts` so headless flows match maintainer intent. Other package scripts that wrap `run` must do the same—or invoke `init`/`config`/`upgrade`, which do read the env var.

Machine-readable denial responses from `run` include **`operationId`** (e.g. `improvement.generate-recommendations`) and **`remediationDoc`** pointing here.

## Copy-paste examples

**One-shot sensitive `run` (session-local):**

```bash
workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"weekly improvement pass"}}'
```

**Session reuse (avoid repeating rationale for the same operation):**

```bash
export WORKSPACE_KIT_SESSION_ID=my-agent-session
workspace-kit run ingest-transcripts '{"policyApproval":{"confirmed":true,"rationale":"allowed for this session","scope":"session"}}'
# later, same session id:
workspace-kit run ingest-transcripts '{}'
```

**Config mutation (env approval):**

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"set cadence in CI"}'
workspace-kit config set improvement.cadence.minIntervalMinutes 20 --json
```

## Agents and IDE subprocesses (non-TTY)

Agents (Cursor, CI, headless scripts) usually **do not** have a TTY, so **`WORKSPACE_KIT_INTERACTIVE_APPROVAL` does not prompt** unless you inject stdin via the test hook. Treat **`policyApproval` JSON on `workspace-kit run`** as the default path.

**Chat is not approval** — see [Canonical: what counts as approval for `workspace-kit run`](#canonical-what-counts-as-approval-for-workspace-kit-run) above.

**Multi-turn session (avoid repeating rationale):**

```bash
export WORKSPACE_KIT_SESSION_ID=my-agent-session
workspace-kit run ingest-transcripts '{"policyApproval":{"confirmed":true,"rationale":"batch session","scope":"session"}}'
workspace-kit run ingest-transcripts '{}'
# same session id + existing grant for that operationId
```

**Security / ergonomics:**

- Session grant files live under **`.workspace-kit/policy/session-grants.json`** (see “Evidence” below). They are meant for **one machine / one workspace checkout**—not shared copies of the repo across untrusted boundaries.
- In shared CI, prefer **one-shot** `policyApproval` per job (or inject secrets via your CI’s approved mechanism), not long-lived session files committed to git.

**Discovery:** `workspace-kit run` with no subcommand lists commands; **`docs/maintainers/AGENT-CLI-MAP.md`** summarizes task transitions vs other sensitive commands.

## Evidence and troubleshooting

- Traces append to **`.workspace-kit/policy/traces.jsonl`** (versioned records).
- Session grants: **`.workspace-kit/policy/session-grants.json`** (when using `scope":"session"`).
- If denied: read the JSON line from stderr/stdout; use **`operationId`** to confirm which gated operation failed.

See also **`docs/maintainers/runbooks/transcript-ingestion-operations.md`** for transcript-specific operations.
