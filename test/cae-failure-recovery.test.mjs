/**
 * CAE failure / recovery matrix coverage (**`T879`**) + **`cae-satisfy-ack`** policy ordering.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { runCli } from "../dist/cli.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { persistCaeTraceSnapshot } from "../dist/core/cae/cae-kit-sqlite.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function tmpEmpty() {
  return mkdtemp(path.join(os.tmpdir(), "wk-cae-fail-"));
}

async function tmpWithRegistry() {
  const ws = await tmpEmpty();
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "workspace-kit.db");
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  persistCaeTraceSnapshot(db, "trace-ack-test", { schemaVersion: 1, events: [] }, { schemaVersion: 1, families: {} });
  db.close();
  return ws;
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

async function seededJsonWorkspace() {
  const workspacePath = await tmpEmpty();
  await mkdir(path.join(workspacePath, ".workspace-kit", "tasks"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".workspace-kit", "tasks", "state.json"),
    JSON.stringify({ schemaVersion: 1, tasks: [], transitionLog: [], lastUpdated: new Date().toISOString() }),
    "utf8"
  );
  return workspacePath;
}

test("T879: loadCaeRegistry returns cae-registry-read-error when registry files missing", async () => {
  const ws = await tmpEmpty();
  const r = loadCaeRegistry(ws);
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-registry-read-error");
});

test("T879: loadCaeRegistry returns cae-registry-invalid-json for malformed activations file", async () => {
  const ws = await tmpEmpty();
  const reg = path.join(ws, ".ai", "cae", "registry");
  await mkdir(reg, { recursive: true });
  await writeFile(path.join(reg, "artifacts.v1.json"), '{"schemaVersion":1,"artifacts":[]}', "utf8");
  await writeFile(path.join(reg, "activations.v1.json"), "NOT JSON {{{", "utf8");
  const r = loadCaeRegistry(ws);
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-registry-invalid-json");
});

test("T879: cae-get-trace returns cae-trace-not-found when no session or sqlite row", async () => {
  const ws = await tmpWithRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-get-trace",
      args: { schemaVersion: 1, traceId: "does-not-exist-xyz" }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: {
        kit: { cae: { persistence: true } },
        tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-trace-not-found");
});

test("T879: cae-satisfy-ack returns cae-ack-token-mismatch when token wrong", async () => {
  const ws = await tmpWithRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-satisfy-ack",
      args: {
        schemaVersion: 1,
        traceId: "trace-ack-test",
        ackToken: "wrong-token",
        activationId: "cae.activation.policy.phase70-playbook",
        actor: "test@example",
        policyApproval: { confirmed: true, rationale: "test" }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: {
        kit: { cae: { persistence: true } },
        tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-ack-token-mismatch");
});

test("T879: cae-satisfy-ack ok when registry + token + persisted trace align", async () => {
  const ws = await tmpWithRegistry();
  const r = await contextActivationModule.onCommand(
    {
      name: "cae-satisfy-ack",
      args: {
        schemaVersion: 1,
        traceId: "trace-ack-test",
        ackToken: "phase70-policy-surface",
        activationId: "cae.activation.policy.phase70-playbook",
        actor: "test@example",
        policyApproval: { confirmed: true, rationale: "test" }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: {
        kit: { cae: { persistence: true } },
        tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
      }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(r.code, "cae-satisfy-ack-ok");
});

test("T879: Tier A policy runs before handler — cae-satisfy-ack without policyApproval is policy-denied", async () => {
  const workspacePath = await seededJsonWorkspace();
  const prev = process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
  process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = "off";
  try {
    const io = cap();
    const code = await runCli(
      [
        "run",
        "cae-satisfy-ack",
        JSON.stringify({
          schemaVersion: 1,
          traceId: "t",
          ackToken: "x",
          activationId: "cae.activation.policy.phase70-playbook",
          actor: "a@b"
        })
      ],
      { cwd: workspacePath, ...io }
    );
    assert.equal(code, 1);
    const out = JSON.parse(io.lines.join(""));
    assert.equal(out.code, "policy-denied");
    assert.equal(out.operationId, "context-activation.cae-satisfy-ack");
  } finally {
    if (prev === undefined) {
      delete process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL;
    } else {
      process.env.WORKSPACE_KIT_INTERACTIVE_APPROVAL = prev;
    }
  }
});
