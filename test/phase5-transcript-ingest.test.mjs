import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  approvalsModule,
  improvementModule,
  planningModule,
  resolveWorkspaceConfigWithLayers,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";
import { runCli } from "../dist/cli.js";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase5-"));
}

function buildContext(workspacePath, registry, effectiveConfig) {
  return {
    runtimeVersion: "0.1",
    workspacePath,
    effectiveConfig,
    resolvedActor: "tester@example.com",
    moduleRegistry: registry
  };
}

test("Phase5: sync-transcripts copies new files and is idempotent", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".cursor", "agent-transcripts", "nested"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "nested", "one.jsonl"),
    '{"role":"user","text":"broken again"}\n',
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    taskEngineModule,
    planningModule,
    improvementModule,
    approvalsModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = buildContext(workspacePath, registry, resolved.effective);

  const first = await router.execute("sync-transcripts", {}, ctx);
  assert.equal(first.ok, true, first.message);
  assert.equal(first.data.copied, 1);
  assert.equal(first.data.skippedExisting, 0);

  const second = await router.execute("sync-transcripts", {}, ctx);
  assert.equal(second.ok, true, second.message);
  assert.equal(second.data.copied, 0);
  assert.equal(second.data.skippedExisting, 1);
});

test("Phase5: ingest-transcripts returns cadence skip without policy approval from CLI", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".cursor", "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "one.jsonl"),
    '{"role":"user","text":"error still fails"}\n',
    "utf8"
  );
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  const denied = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...cap });
  assert.equal(denied, 1);
  const deniedPayload = JSON.parse(cap.lines.join(""));
  assert.equal(deniedPayload.code, "policy-denied");
  assert.equal(
    deniedPayload.operationId,
    "improvement.ingest-transcripts",
    "denial JSON should name the gated operation for actionable remediation"
  );
  assert.ok(
    typeof deniedPayload.remediationDoc === "string" && deniedPayload.remediationDoc.includes("POLICY-APPROVAL"),
    "denial should point maintainers at POLICY-APPROVAL.md"
  );

  const approvedArgs = JSON.stringify({
    policyApproval: { confirmed: true, rationale: "phase5 test" }
  });
  const cap2 = { lines: [], errors: [], writeLine: (m) => cap2.lines.push(m), writeError: (m) => cap2.errors.push(m) };
  const code = await runCli(["run", "ingest-transcripts", approvedArgs], {
    cwd: workspacePath,
    ...cap2
  });
  assert.equal(code, 0, cap2.errors.join("\n"));
  const out = JSON.parse(cap2.lines.join(""));
  assert.equal(out.ok, true);
  assert.equal(out.code, "transcripts-ingested");
  assert.ok(out.data.cadence.decision.length > 0);
});

test("Phase5: improvement config validates and resolves", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        improvement: {
          transcripts: {
            sourcePath: ".cursor/agent-transcripts",
            archivePath: "agent-transcripts"
          },
          cadence: {
            minIntervalMinutes: 5,
            skipIfNoNewTranscripts: true
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const cap = { lines: [], errors: [], writeLine: (m) => cap.lines.push(m), writeError: (m) => cap.errors.push(m) };
  const code = await runCli(["config", "validate"], { cwd: workspacePath, ...cap });
  assert.equal(code, 0, cap.errors.join("\n"));

  const cap2 = {
    lines: [],
    errors: [],
    writeLine: (m) => cap2.lines.push(m),
    writeError: (m) => cap2.errors.push(m)
  };
  const code2 = await runCli(["config", "get", "improvement.cadence.minIntervalMinutes", "--json"], {
    cwd: workspacePath,
    ...cap2
  });
  assert.equal(code2, 0, cap2.errors.join("\n"));
  const out = JSON.parse(cap2.lines.join(""));
  assert.equal(out.data.value, 5);

  const doc = await readFile(path.join(workspacePath, ".workspace-kit", "config.json"), "utf8");
  assert.match(doc, /"improvement"/);
});

