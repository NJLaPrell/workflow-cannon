#!/usr/bin/env node
/**
 * pre-merge-gates: detect GitHub PR head rewritten after the latest approving review.
 * Emits code `pr-history-rewritten` when force-push/amend invalidated prior approval SHA.
 *
 * Env:
 *   WORKSPACE_KIT_PR_NUMBER — optional explicit PR (else gh infers from current branch)
 *   WORKSPACE_KIT_SKIP_PR_HISTORY_CHECK — set to 1 to skip (local-only / no gh)
 */
import { execFileSync } from "node:child_process";

function skip(msg) {
  console.log(`check-pr-history-rewritten: skip — ${msg}`);
  process.exit(0);
}

if (process.env.WORKSPACE_KIT_SKIP_PR_HISTORY_CHECK === "1") {
  skip("WORKSPACE_KIT_SKIP_PR_HISTORY_CHECK=1");
}

function ghJson(args) {
  try {
    const out = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(out.trim() || "null");
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? "";
    if (/not found|no pull requests|Could not resolve/i.test(stderr)) {
      return null;
    }
    throw err;
  }
}

const prNumber = process.env.WORKSPACE_KIT_PR_NUMBER?.trim();
const pr =
  prNumber != null && prNumber !== ""
    ? ghJson(["pr", "view", prNumber, "--json", "number,headRefOid,reviews,state"])
    : ghJson(["pr", "view", "--json", "number,headRefOid,reviews,state"]);

if (!pr) {
  skip("no open PR for current branch (set WORKSPACE_KIT_PR_NUMBER to enforce)");
}

if (pr.state !== "OPEN") {
  skip(`PR #${pr.number} is ${pr.state}`);
}

const headOid = pr.headRefOid;
const approvals = (pr.reviews ?? []).filter(
  (r) => r?.state === "APPROVED" && typeof r?.commit?.oid === "string" && r.commit.oid.length > 0
);

if (approvals.length === 0) {
  skip(`PR #${pr.number} has no approving review with commit OID — nothing to compare`);
}

const latestApproval = approvals.reduce((a, b) => {
  const at = Date.parse(a.submittedAt ?? 0);
  const bt = Date.parse(b.submittedAt ?? 0);
  return bt >= at ? b : a;
});

const approvedOid = latestApproval.commit.oid;
if (approvedOid === headOid) {
  console.log(
    `check-pr-history-rewritten: ok — PR #${pr.number} head matches latest approval commit (${headOid.slice(0, 7)})`
  );
  process.exit(0);
}

console.error(
  JSON.stringify(
    {
      ok: false,
      code: "pr-history-rewritten",
      message: `PR #${pr.number} head was force-pushed or rewritten after the latest approval.`,
      data: {
        prNumber: pr.number,
        headRefOid: headOid,
        lastApprovedCommitOid: approvedOid,
        remediation:
          "Prefer follow-up commits on the PR branch instead of amend+force-push after review; re-request review if history was rewritten intentionally."
      }
    },
    null,
    2
  )
);
process.exit(1);
