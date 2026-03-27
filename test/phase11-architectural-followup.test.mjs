import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../dist/cli.js";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase11-"));
}

async function seededWorkspace() {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".cursor", "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "one.jsonl"),
    '{"role":"user","text":"phase11 fixture"}\n',
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );
  return workspacePath;
}

function cap() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine: (m) => lines.push(m),
    writeError: (m) => errors.push(m)
  };
}

test("Phase11: malformed policyApproval is denied with stable policy fields", async () => {
  const workspacePath = await seededWorkspace();
  const io = cap();
  const code = await runCli(
    ["run", "ingest-transcripts", JSON.stringify({ policyApproval: { confirmed: true } })],
    { cwd: workspacePath, ...io }
  );
  assert.equal(code, 1);
  const out = JSON.parse(io.lines.join(""));
  assert.equal(out.ok, false);
  assert.equal(out.code, "policy-denied");
  assert.equal(out.operationId, "improvement.ingest-transcripts");
  assert.ok(typeof out.remediationDoc === "string" && out.remediationDoc.includes("POLICY-APPROVAL"));
  assert.match(String(out.message), /invalid policyApproval/i);
});

test("Phase11: session grant is not reused across different session IDs", async () => {
  const workspacePath = await seededWorkspace();
  const prev = process.env.WORKSPACE_KIT_SESSION_ID;
  try {
    process.env.WORKSPACE_KIT_SESSION_ID = "phase11-a";
    const ioGrant = cap();
    const grantCode = await runCli(
      [
        "run",
        "ingest-transcripts",
        JSON.stringify({ policyApproval: { confirmed: true, rationale: "phase11 session", scope: "session" } })
      ],
      { cwd: workspacePath, ...ioGrant }
    );
    assert.equal(grantCode, 0, ioGrant.errors.join("\n"));

    process.env.WORKSPACE_KIT_SESSION_ID = "phase11-b";
    const ioDenied = cap();
    const deniedCode = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...ioDenied });
    assert.equal(deniedCode, 1);
    const denied = JSON.parse(ioDenied.lines.join(""));
    assert.equal(denied.code, "policy-denied");
    assert.equal(denied.operationId, "improvement.ingest-transcripts");
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_SESSION_ID;
    } else {
      process.env.WORKSPACE_KIT_SESSION_ID = prev;
    }
  }
});

test("Phase11: sensitive run denies in non-interactive mode without approval", async () => {
  const workspacePath = await seededWorkspace();
  const prev = process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
  process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = "off";
  try {
    const io = cap();
    const code = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...io });
    assert.equal(code, 1);
    const out = JSON.parse(io.lines.join(""));
    assert.equal(out.code, "policy-denied");
    assert.equal(out.operationId, "improvement.ingest-transcripts");
    assert.ok(typeof out.remediationDoc === "string" && out.remediationDoc.includes("POLICY-APPROVAL"));
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
    } else {
      process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = prev;
    }
  }
});
