import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../dist/cli.js";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase9-"));
}

async function ingestFixtureRoot() {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".cursor", "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "one.jsonl"),
    '{"role":"user","text":"phase9 interactive"}\n',
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

test("Phase9: interactive Allow-once approves ingest-transcripts without JSON policyApproval", async () => {
  const workspacePath = await ingestFixtureRoot();
  const prev = process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
  process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = "on";
  try {
    const cap = {
      lines: [],
      errors: [],
      writeLine: (m) => cap.lines.push(m),
      writeError: (m) => cap.errors.push(m),
      readStdinLine: async () => "o"
    };
    const code = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...cap });
    assert.equal(code, 0, cap.errors.join("\n"));
    const out = JSON.parse(cap.lines.join(""));
    assert.equal(out.ok, true);
    assert.equal(out.code, "transcripts-ingested");
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
    } else {
      process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = prev;
    }
  }
});

test("Phase9: interactive Deny returns policy-denied", async () => {
  const workspacePath = await ingestFixtureRoot();
  const prev = process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
  process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = "on";
  try {
    const cap = {
      lines: [],
      errors: [],
      writeLine: (m) => cap.lines.push(m),
      writeError: (m) => cap.errors.push(m),
      readStdinLine: async () => "d"
    };
    const code = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...cap });
    assert.equal(code, 1);
    const out = JSON.parse(cap.lines.join(""));
    assert.equal(out.code, "policy-denied");
    assert.ok(String(out.message).includes("interactive"), out.message);
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
    } else {
      process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = prev;
    }
  }
});
