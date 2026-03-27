# Policy approval for mutating operations

The kit uses **fail-closed** policy: sensitive commands require explicit approval so automation cannot silently change your workspace or task engine.

Use this page when you see **`policy-denied`**, **`missing WORKSPACE_KIT_POLICY_APPROVAL`**, or JSON output mentioning **`policyApproval`**.

## Two approval surfaces (do not mix them up)

| Surface | When it applies | How to approve |
| --- | --- | --- |
| **`policyApproval` in JSON** | `workspace-kit run <command> …` when the command is **policy-sensitive** (e.g. `generate-recommendations`, `ingest-transcripts`, `run-transition`, `review-item`, doc generation without `dryRun`) | Pass a JSON object as the third CLI argument with `"policyApproval":{"confirmed":true,"rationale":"…"}`. Optionally `"scope":"session"` to reuse approval for the same operation and `WORKSPACE_KIT_SESSION_ID` (see session grants). |
| **`WORKSPACE_KIT_POLICY_APPROVAL` env** | **`workspace-kit init`**, **`workspace-kit upgrade`**, **`workspace-kit config`** mutating subcommands (`set`, `unset`, `edit`, …) | Export env var to JSON: `{"confirmed":true,"rationale":"…"}`. |

**`workspace-kit run` does not read `WORKSPACE_KIT_POLICY_APPROVAL`** for the run path itself. For package scripts that wrap `run` (e.g. `transcript:ingest`), the script must pass approval into the process environment only if the **inner** CLI entrypoint you invoke uses `init`/`config`/`upgrade`—not for pure `run` commands.

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

## Evidence and troubleshooting

- Traces append to **`.workspace-kit/policy/traces.jsonl`** (versioned records).
- Session grants: **`.workspace-kit/policy/session-grants.json`** (when using `scope":"session"`).
- If denied: read the JSON line from stderr/stdout; use **`operationId`** to confirm which gated operation failed.

See also **`docs/maintainers/runbooks/transcript-ingestion-operations.md`** for transcript-specific operations.
