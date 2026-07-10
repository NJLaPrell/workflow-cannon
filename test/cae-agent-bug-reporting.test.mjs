/**
 * T100859 — CAE guidance / do activations for agent bug filing.
 * Advisory only: spawn wc-bug-reporter / file-bug-report; never ready/release powers.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { evaluateActivationBundle } from "../dist/core/cae/cae-evaluate.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { contextActivationModule } from "../dist/index.js";
import {
  AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND,
  AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES,
  AGENT_BUG_FILING_ARTIFACT_ID,
  AGENT_BUG_FILING_NEXT_STEP,
  parsePreviewAgentSignals
} from "../dist/modules/context-activation/agent-bug-filing-guidance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function workspaceWithJsonRegistry() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-agent-bug-"));
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  db.close();
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  return ws;
}

function caeConfig(overrides = {}) {
  return {
    kit: {
      cae: {
        enabled: true,
        persistence: false,
        registryStore: "json",
        adminMutations: false,
        ...overrides
      }
    },
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" }
  };
}

function baseEvalCtx(agentSignals) {
  return {
    schemaVersion: 1,
    task: { taskId: "T100859", status: "in_progress", phaseKey: "148" },
    command: {
      name: "list-tasks",
      moduleId: "task-engine",
      argvSummary: "{}"
    },
    workspace: {
      currentKitPhase: "148",
      nextKitPhase: "149",
      workspaceRootFingerprint: "sha256:cae-agent-bug-reporting"
    },
    governance: {
      policyApprovalRequired: false,
      approvalTierHint: "none",
      policySurface: "run-json"
    },
    queue: { readyQueueDepth: 0, suggestedNextTaskId: null },
    mapSignals: null,
    ...(agentSignals ? { agentSignals } : {})
  };
}

test("parsePreviewAgentSignals clamps and drops empty payloads", () => {
  assert.equal(parsePreviewAgentSignals(null), null);
  assert.equal(parsePreviewAgentSignals({}), null);
  assert.deepEqual(parsePreviewAgentSignals({ recentToolFailures: 2.9, lastFailureKind: " wc-cli-failure " }), {
    recentToolFailures: 2,
    lastFailureKind: "wc-cli-failure"
  });
});

test("registry seed includes advisory do activations for agent bug filing", async () => {
  const activations = JSON.parse(
    await readFile(path.join(root, ".ai", "cae", "registry", "activations.v1.json"), "utf8")
  );
  const artifacts = JSON.parse(
    await readFile(path.join(root, ".ai", "cae", "registry", "artifacts.v1.json"), "utf8")
  );

  const art = artifacts.artifacts.find((a) => a.artifactId === AGENT_BUG_FILING_ARTIFACT_ID);
  assert.ok(art, "artifact seed missing");
  assert.equal(art.ref.path, ".ai/cae/agent-bug-filing-nudge.md");

  for (const id of [AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES, AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND]) {
    const act = activations.activations.find((a) => a.activationId === id);
    assert.ok(act, `activation ${id} missing`);
    assert.equal(act.family, "do");
    assert.equal(act.lifecycleState, "active");
    assert.equal(act.flags?.advisoryOnly, true);
    assert.deepEqual(
      act.artifactRefs.map((r) => r.artifactId),
      [AGENT_BUG_FILING_ARTIFACT_ID]
    );
  }
});

test("evaluator surfaces file-bug-report artifact on tool-failure and friction-kind signals", () => {
  const regRes = loadCaeRegistry(root);
  assert.equal(regRes.ok, true);

  const failCtx = baseEvalCtx({ recentToolFailures: 1, lastErrorCode: "invalid-run-args" });
  const { bundle: failBundle } = evaluateActivationBundle(failCtx, regRes.value, { evalMode: "live" });
  const failDo = failBundle.families.do ?? [];
  assert.ok(
    failDo.some((row) => row.activationId === AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES),
    "tool-failure do activation should match"
  );
  assert.ok(
    failDo.some((row) => (row.artifactIds ?? []).includes(AGENT_BUG_FILING_ARTIFACT_ID)),
    "tool-failure should attach bug-filing nudge artifact"
  );

  const frictionCtx = baseEvalCtx({ lastFailureKind: "agent-facing-friction" });
  const { bundle: frictionBundle } = evaluateActivationBundle(frictionCtx, regRes.value, {
    evalMode: "live"
  });
  const frictionDo = frictionBundle.families.do ?? [];
  assert.ok(
    frictionDo.some((row) => row.activationId === AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND),
    "friction-kind do activation should match"
  );

  const cleanCtx = baseEvalCtx();
  const { bundle: cleanBundle } = evaluateActivationBundle(cleanCtx, regRes.value, { evalMode: "live" });
  const cleanDoIds = (cleanBundle.families.do ?? []).map((row) => row.activationId);
  assert.ok(!cleanDoIds.includes(AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES));
  assert.ok(!cleanDoIds.includes(AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND));
});

test("cae-guidance-preview surfaces filing nudge with spawn/file-bug-report next-step", async () => {
  const ws = await workspaceWithJsonRegistry();
  const result = await contextActivationModule.onCommand(
    {
      name: "cae-guidance-preview",
      args: {
        schemaVersion: 1,
        commandName: "list-tasks",
        currentKitPhase: "148",
        evalMode: "shadow",
        agentSignals: {
          recentToolFailures: 2,
          lastErrorCode: "invalid-run-args",
          lastFailureKind: "wc-cli-failure"
        }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      effectiveConfig: caeConfig()
    }
  );

  assert.equal(result.ok, true, result.message);
  assert.equal(result.code, "cae-guidance-preview-ok");
  assert.ok(result.data.evaluationContext?.agentSignals?.recentToolFailures >= 1);

  const doCards = result.data.guidanceCards?.do ?? [];
  const filing = doCards.find((c) => c.activationId === AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES);
  assert.ok(filing, "expected do-family filing nudge card");
  assert.match(String(filing.title), /spawn/i);
  assert.match(String(filing.title), /wc-bug-reporter/i);
  assert.match(String(filing.title), /file-bug-report/);
  assert.equal(filing.title, AGENT_BUG_FILING_NEXT_STEP);
  assert.ok((filing.artifactIds ?? []).includes(AGENT_BUG_FILING_ARTIFACT_ID));
  assert.equal(filing.attention, "advisory");
  assert.doesNotMatch(String(filing.title), /\bready\b.*(?:promote|grant|status)/i);
  assert.doesNotMatch(String(filing.title), /release closeout|cut a release/i);

  const nudgeMd = await readFile(path.join(root, ".ai", "cae", "agent-bug-filing-nudge.md"), "utf8");
  assert.match(nudgeMd, /file-bug-report/);
  assert.match(nudgeMd, /wc-bug-reporter/);
  assert.match(nudgeMd, /host-agnostic|Spawn/i);
  assert.match(nudgeMd, /never ready|proposed only|do \*\*not\*\*.*ready/i);
});

test("disabled bug-filing activation does not surface and does not grant ready powers", () => {
  const regRes = loadCaeRegistry(root);
  assert.equal(regRes.ok, true);
  const loaded = regRes.value;

  // Clone activation rows with filing activations disabled (fallback / kill-switch).
  const disabledActs = loaded.activations.map((row) => {
    if (
      row.activationId === AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES ||
      row.activationId === AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND
    ) {
      return { ...row, lifecycleState: "disabled" };
    }
    return row;
  });
  const disabledReg = {
    ...loaded,
    activations: disabledActs,
    activationById: new Map(disabledActs.map((a) => [String(a.activationId), a]))
  };

  const ctx = baseEvalCtx({ recentToolFailures: 3, lastFailureKind: "policy-friction" });
  const { bundle } = evaluateActivationBundle(ctx, disabledReg, { evalMode: "live" });
  const doIds = (bundle.families.do ?? []).map((row) => row.activationId);
  assert.ok(!doIds.includes(AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES));
  assert.ok(!doIds.includes(AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND));

  // Empty advisory fallback must not invent policy/ready authority.
  const policyIds = (bundle.families.policy ?? []).map((row) => row.activationId);
  assert.ok(!policyIds.some((id) => String(id).includes("agent-bug-filing")));
});

test("kit.cae.enabled false preview still does not invent ready-task powers via filing path", async () => {
  const ws = await workspaceWithJsonRegistry();
  const result = await contextActivationModule.onCommand(
    {
      name: "cae-guidance-preview",
      args: {
        schemaVersion: 1,
        commandName: "list-tasks",
        currentKitPhase: "148",
        evalMode: "shadow",
        agentSignals: { recentToolFailures: 1 }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: ws,
      // Preview still evaluates registry; enabled=false is runtime preflight kill-switch.
      // Assert advisory cards never claim ready/release authority.
      effectiveConfig: caeConfig({ enabled: false })
    }
  );
  assert.equal(result.ok, true, result.message);
  const serialized = JSON.stringify(result.data.guidanceCards ?? {});
  assert.doesNotMatch(serialized, /grant ready|promote to ready|release powers/i);
  const filing = (result.data.guidanceCards?.do ?? []).find(
    (c) => c.activationId === AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES
  );
  if (filing) {
    assert.equal(filing.attention, "advisory");
    assert.match(String(filing.title), /file-bug-report/);
  }
});
