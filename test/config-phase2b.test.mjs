import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../dist/cli.js";

const TEST_POLICY = JSON.stringify({
  confirmed: true,
  rationale: "config phase2b test"
});

async function withPolicy(fn) {
  const prev = process.env.WORKSPACE_KIT_POLICY_APPROVAL;
  process.env.WORKSPACE_KIT_POLICY_APPROVAL = TEST_POLICY;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_KIT_POLICY_APPROVAL;
    else process.env.WORKSPACE_KIT_POLICY_APPROVAL = prev;
  }
}

async function withUserHome(home, fn) {
  const prev = process.env.WORKSPACE_KIT_HOME;
  process.env.WORKSPACE_KIT_HOME = home;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_KIT_HOME;
    else process.env.WORKSPACE_KIT_HOME = prev;
  }
}

function captureIo() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(m) {
      lines.push(m);
    },
    writeError(m) {
      errors.push(m);
    }
  };
}

async function minimalWorkspace(root) {
  await mkdir(path.join(root, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(root, "workspace-kit.profile.json"),
    JSON.stringify(
      {
        project: { name: "cfg-fixture" },
        packageManager: "pnpm",
        commands: { test: "pnpm test", lint: "pnpm lint", typecheck: "pnpm check" },
        github: { defaultBranch: "main" }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(root, "schemas"), { recursive: true });
  await writeFile(path.join(root, "schemas", "workspace-kit-profile.schema.json"), "{}", "utf8");
  await writeFile(
    path.join(root, ".workspace-kit", "manifest.json"),
    JSON.stringify({ schemaVersion: 1 }),
    "utf8"
  );
  await writeFile(
    path.join(root, ".workspace-kit", "owned-paths.json"),
    JSON.stringify({ schemaVersion: 1, ownedPaths: [] }),
    "utf8"
  );
}

test("config validate succeeds with no config files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-"));
  await minimalWorkspace(root);
  const home = await mkdtemp(path.join(os.tmpdir(), "wk-home-"));
  const cap = captureIo();
  const code = await withUserHome(home, () =>
    runCli(["config", "validate", "--json"], { cwd: root, ...cap })
  );
  assert.equal(code, 0);
  const j = JSON.parse(cap.lines[0]);
  assert.equal(j.ok, true);
  assert.equal(j.code, "config-validated");
});

test("config set and get round-trip (project layer)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-set-"));
  await minimalWorkspace(root);
  const home = await mkdtemp(path.join(os.tmpdir(), "wk-h-"));

  const io = captureIo();
  const setCode = await withUserHome(home, () =>
    runCli(
      ["config", "set", "tasks.storeRelativePath", JSON.stringify(".workspace-kit/tasks/custom.json")],
      { cwd: root, ...io }
    )
  );
  assert.equal(setCode, 0);

  const cap2 = captureIo();
  const getCode = await withUserHome(home, () =>
    runCli(["config", "get", "tasks.storeRelativePath", "--json"], { cwd: root, ...cap2 })
  );
  assert.equal(getCode, 0);
  const g = JSON.parse(cap2.lines[0]);
  assert.equal(g.data.value, ".workspace-kit/tasks/custom.json");

  const modCfgPath = path.join(
    root,
    ".workspace-kit",
    "modules",
    "task-engine",
    "config.json"
  );
  await access(modCfgPath);
  const raw = JSON.parse(await readFile(modCfgPath, "utf8"));
  assert.equal(raw.tasks.storeRelativePath, ".workspace-kit/tasks/custom.json");

  const mutPath = path.join(root, ".workspace-kit", "config", "mutations.jsonl");
  const mut = await readFile(mutPath, "utf8");
  assert.match(mut, /"operation":"set"/);
});

test("config set rejects unknown key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-bad-"));
  await minimalWorkspace(root);
  const home = await mkdtemp(path.join(os.tmpdir(), "wk-h2-"));
  const cap = captureIo();
  const code = await withUserHome(home, () =>
    runCli(["config", "set", "nope.notakey", JSON.stringify("x")], { cwd: root, ...cap })
  );
  assert.equal(code, 1);
  assert.match(cap.errors.join(""), /config-unknown-key/);
});

test("project global config overrides module-scoped task-engine file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-layer-"));
  await minimalWorkspace(root);
  const home = await mkdtemp(path.join(os.tmpdir(), "wk-h-layer-"));
  await mkdir(path.join(root, ".workspace-kit", "modules", "task-engine"), { recursive: true });
  await writeFile(
    path.join(root, ".workspace-kit", "modules", "task-engine", "config.json"),
    JSON.stringify({ tasks: { strictValidation: false } }),
    "utf8"
  );
  await writeFile(
    path.join(root, ".workspace-kit", "config.json"),
    JSON.stringify({ tasks: { strictValidation: true } }),
    "utf8"
  );
  const cap = captureIo();
  const code = await withUserHome(home, () =>
    runCli(["config", "get", "tasks.strictValidation", "--json"], { cwd: root, ...cap })
  );
  assert.equal(code, 0);
  const g = JSON.parse(cap.lines[0]);
  assert.equal(g.data.value, true);
});

test("run resolve-config returns effective and layers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-res-"));
  await minimalWorkspace(root);
  const home = await mkdtemp(path.join(os.tmpdir(), "wk-hr-"));
  const cap = captureIo();
  const code = await withUserHome(home, () =>
    runCli(["run", "resolve-config", "{}"], { cwd: root, ...cap })
  );
  assert.equal(code, 0);
  const out = JSON.parse(cap.lines.join(""));
  assert.equal(out.ok, true);
  assert.equal(out.code, "config-resolved");
  assert.ok(out.data.effective);
  assert.ok(Array.isArray(out.data.layers));
  const ids = out.data.layers.map((l) => l.id);
  assert.ok(ids.includes("user"));
  assert.ok(ids.includes("project"));
});

test("policy.trace includes schemaVersion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-pol-"));
  await minimalWorkspace(root);
  const cap = captureIo();
  await withPolicy(async () => {
    await runCli(["init"], { cwd: root, ...cap });
  });
  const tracePath = path.join(root, ".workspace-kit", "policy", "traces.jsonl");
  const lines = (await readFile(tracePath, "utf8")).trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.schemaVersion, 1);
});

test("extraSensitiveModuleCommands gates explain-config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-xsen-"));
  await minimalWorkspace(root);
  await writeFile(
    path.join(root, ".workspace-kit", "config.json"),
    JSON.stringify({
      policy: { extraSensitiveModuleCommands: ["explain-config"] }
    }),
    "utf8"
  );
  const capDenied = captureIo();
  const denied = await runCli(
    ["run", "explain-config", JSON.stringify({ path: "tasks.storeRelativePath" })],
    { cwd: root, ...capDenied }
  );
  assert.equal(denied, 1, "extra-sensitive explain-config run should exit validation failure when policyApproval missing");
  const msg = JSON.parse(capDenied.lines.join(""));
  assert.equal(msg.code, "policy-denied");
  assert.equal(
    msg.operationId,
    "policy.dynamic-sensitive",
    "config-declared sensitive commands should trace as policy.dynamic-sensitive"
  );
  assert.ok(
    msg.remediationDoc?.includes("POLICY-APPROVAL"),
    "denial payload should link remediation doc for operators"
  );

  const capOk = captureIo();
  const ok = await runCli(
    [
      "run",
      "explain-config",
      JSON.stringify({
        path: "tasks.storeRelativePath",
        policyApproval: { confirmed: true, rationale: "test approved extra-sensitive explain-config" }
      })
    ],
    { cwd: root, ...capOk }
  );
  assert.equal(ok, 0);
  const out = JSON.parse(capOk.lines.join(""));
  assert.equal(out.ok, true);
});

test("config validate rejects kit.agentGuidance.tier out of range", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-ag-tier-"));
  await minimalWorkspace(root);
  await mkdir(path.join(root, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(root, ".workspace-kit", "config.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        kit: { agentGuidance: { profileSetId: "rpg_party_v1", tier: 9 } }
      },
      null,
      2
    ),
    "utf8"
  );
  const cap = captureIo();
  const code = await runCli(["config", "validate", "--json"], { cwd: root, ...cap });
  assert.ok(code === 1 || code === 3, `expected validation or registry resolve failure, got ${code}`);
  const errText = cap.errors.join("\n");
  assert.match(errText, /1 to 5|kit\.agentGuidance\.tier|config-constraint/);
});

test("config generate-docs writes CONFIG.md files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-docs-"));
  await minimalWorkspace(root);
  await mkdir(path.join(root, ".ai"), { recursive: true });
  await mkdir(path.join(root, "docs", "maintainers"), { recursive: true });
  const cap = captureIo();
  const code = await runCli(["config", "generate-docs"], { cwd: root, ...cap });
  assert.equal(code, 0);
  const ai = await readFile(path.join(root, ".ai", "CONFIG.md"), "utf8");
  assert.match(ai, /tasks\.storeRelativePath/);
  const hum = await readFile(path.join(root, "docs", "maintainers", "CONFIG.md"), "utf8");
  assert.match(hum, /tasks\.storeRelativePath/);
});
