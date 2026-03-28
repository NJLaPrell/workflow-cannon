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
  documentationModule,
  improvementModule,
  planningModule,
  resolveWorkspaceConfigWithLayers,
  taskEngineModule,
  workspaceConfigModule
} from "../dist/index.js";
import { buildCursorProjectsAgentTranscriptsPath } from "../dist/modules/improvement/transcript-sync-runtime.js";
import { runCli } from "../dist/cli.js";

async function tmpWs() {
  return mkdtemp(path.join(os.tmpdir(), "wk-phase6a-"));
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

test("Phase6a: policy session grant allows second ingest without repeated policyApproval", async () => {
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

  const firstArgs = JSON.stringify({
    policyApproval: { confirmed: true, rationale: "session test", scope: "session" }
  });
  const cap1 = { lines: [], errors: [], writeLine: (m) => cap1.lines.push(m), writeError: (m) => cap1.errors.push(m) };
  const code1 = await runCli(["run", "ingest-transcripts", firstArgs], { cwd: workspacePath, ...cap1 });
  assert.equal(code1, 0, cap1.errors.join("\n"));

  const cap2 = { lines: [], errors: [], writeLine: (m) => cap2.lines.push(m), writeError: (m) => cap2.errors.push(m) };
  const code2 = await runCli(["run", "ingest-transcripts", "{}"], { cwd: workspacePath, ...cap2 });
  assert.equal(code2, 0, cap2.errors.join("\n"));
  const out2 = JSON.parse(cap2.lines.join(""));
  assert.equal(out2.ok, true);

  const grant = JSON.parse(
    await readFile(path.join(workspacePath, ".workspace-kit", "policy", "session-grants.json"), "utf8")
  );
  assert.equal(grant.grants["improvement.ingest-transcripts"]?.rationale, "session test");
});

test("Phase6a: transcript-automation-status returns stable JSON", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );

  const registry = new ModuleRegistry([
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = buildContext(workspacePath, registry, resolved.effective);

  const st = await router.execute("transcript-automation-status", {}, ctx);
  assert.equal(st.ok, true);
  assert.equal(st.data.schemaVersion, 1);
  assert.ok(Array.isArray(st.data.retryQueue.entries));
  assert.ok(st.data.policySession.sessionId);
});

test("Phase6a: sync returns runId and respects maxBytesPerFile budget", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, ".cursor", "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "small.jsonl"),
    '{"role":"user","text":"broken"}\n',
    "utf8"
  );
  await writeFile(
    path.join(workspacePath, ".cursor", "agent-transcripts", "huge.jsonl"),
    "x".repeat(5000),
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
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({
    workspacePath,
    registry,
    invocationConfig: {
      improvement: {
        transcripts: { maxBytesPerFile: 100 }
      }
    }
  });
  const ctx = buildContext(workspacePath, registry, resolved.effective);

  const sync = await router.execute("sync-transcripts", {}, ctx);
  assert.equal(sync.ok, true);
  assert.ok(typeof sync.data.runId === "string" && sync.data.runId.length > 0);
  assert.ok(sync.data.skippedLargeFile >= 1);
});

test("Phase6a: generate-recommendations returns dedupe metrics and runId", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, "agent-transcripts"), { recursive: true });
  await writeFile(
    path.join(workspacePath, "agent-transcripts", "x.jsonl"),
    '{"role":"user","text":"broken error"}\n',
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
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = buildContext(workspacePath, registry, resolved.effective);

  const g1 = await router.execute("generate-recommendations", { transcriptsRoot: "agent-transcripts" }, ctx);
  assert.ok(g1.data.runId);
  assert.ok(g1.data.dedupe);

  const g2 = await router.execute("generate-recommendations", { transcriptsRoot: "agent-transcripts" }, ctx);
  assert.ok(g2.data.dedupe);
  // No new transcript lines after ingest cursor; duplicate skip path is covered when candidates exist.
  assert.equal(g2.data.candidates, 0);
});

test("Phase6a: sync discovers Cursor global ~/.cursor/projects/<slug>/agent-transcripts", async () => {
  const prevHome = process.env.HOME;
  const prevWkHome = process.env.WORKSPACE_KIT_HOME;
  const fakeHome = await mkdtemp(path.join(os.tmpdir(), "wk-fake-home-"));
  process.env.HOME = fakeHome;
  process.env.WORKSPACE_KIT_HOME = fakeHome;
  try {
    const workspacePath = await tmpWs();
    const cursorDir = buildCursorProjectsAgentTranscriptsPath(workspacePath);
    assert.ok(cursorDir.startsWith(fakeHome));
    await mkdir(cursorDir, { recursive: true });
    await writeFile(path.join(cursorDir, "global.jsonl"), '{"role":"user","text":"from cursor global"}\n', "utf8");

    await mkdir(path.join(workspacePath, ".workspace-kit"), { recursive: true });
    await writeFile(
      path.join(workspacePath, ".workspace-kit", "config.json"),
      JSON.stringify({
        improvement: {
          transcripts: {
            discoveryPaths: [".___wk_test_no_local_transcript_dir___"]
          }
        }
      }),
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
      documentationModule,
      taskEngineModule,
      approvalsModule,
      planningModule,
      improvementModule
    ]);
    const router = new ModuleCommandRouter(registry);
    const safeEnv = { ...process.env };
    for (const k of Object.keys(safeEnv)) {
      if (k.startsWith("WORKSPACE_KIT_")) delete safeEnv[k];
    }
    safeEnv.HOME = fakeHome;
    safeEnv.WORKSPACE_KIT_HOME = fakeHome;
    const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry, env: safeEnv });
    const ctx = buildContext(workspacePath, registry, resolved.effective);

    const sync = await router.execute("sync-transcripts", {}, ctx);
    assert.equal(sync.ok, true);
    assert.equal(sync.data.discoveredFrom, "cursor-global-project-agent-transcripts");
    assert.ok(sync.data.copied >= 1);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevWkHome === undefined) delete process.env.WORKSPACE_KIT_HOME;
    else process.env.WORKSPACE_KIT_HOME = prevWkHome;
  }
});

test("Phase6a: malformed policy trace lines are skipped", async () => {
  const workspacePath = await tmpWs();
  await mkdir(path.join(workspacePath, "agent-transcripts"), { recursive: true });
  await mkdir(path.join(workspacePath, ".workspace-kit", "policy"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "policy", "traces.jsonl"),
    "not-json\n",
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
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const resolved = await resolveWorkspaceConfigWithLayers({ workspacePath, registry });
  const ctx = buildContext(workspacePath, registry, resolved.effective);

  const gen = await router.execute("generate-recommendations", { transcriptsRoot: "agent-transcripts" }, ctx);
  assert.equal(gen.ok, true);
});
