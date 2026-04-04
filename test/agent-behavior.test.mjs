import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  agentBehaviorModule,
  workspaceConfigModule,
  BUILTIN_PROFILES,
  validateBehaviorProfile
} from "../dist/index.js";
import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_QUESTION_IDS_FINGERPRINT
} from "../dist/modules/agent-behavior/interview.js";

test("interview question fingerprint matches INTERVIEW_QUESTIONS order", () => {
  assert.equal(
    INTERVIEW_QUESTION_IDS_FINGERPRINT,
    INTERVIEW_QUESTIONS.map((q) => q.id).join(",")
  );
});

test("builtin behavior profiles validate", () => {
  for (const p of Object.values(BUILTIN_PROFILES)) {
    const r = validateBehaviorProfile(p, { allowBuiltinId: true });
    assert.equal(r.ok, true, p.id);
  }
});

test("resolve-behavior-profile and create custom (json workspace)", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-beh-"));
  try {
    const registry = new ModuleRegistry([workspaceConfigModule, agentBehaviorModule]);
    const router = new ModuleCommandRouter(registry);
    const ctx = {
      runtimeVersion: "0.23.0",
      workspacePath: dir,
      effectiveConfig: {
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        }
      }
    };

    const res = await router.execute("resolve-behavior-profile", {}, ctx);
    assert.equal(res.ok, true);
    assert.equal(res.data?.effective?.id, "builtin:balanced");
    assert.ok(Array.isArray(res.data?.provenance));
    assert.equal(res.data?.agentGuidance?.schemaVersion, 1);
    assert.equal(res.data?.agentGuidance?.tier, 2);
    assert.ok(res.data?.agentGuidance?.advisoryModulation);

    const c = await router.execute(
      "create-behavior-profile",
      { id: "custom:test", label: "Test", summary: "Test profile for unit test" },
      ctx
    );
    assert.equal(c.ok, true, c.message);
    assert.equal(c.data?.profile?.id, "custom:test");

    const active = await router.execute(
      "set-active-behavior-profile",
      { profileId: "custom:test" },
      ctx
    );
    assert.equal(active.ok, true);

    const r2 = await router.execute("resolve-behavior-profile", {}, ctx);
    assert.equal(r2.data?.effective?.id, "custom:test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("interview-behavior-profile completes and finalize draft", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-beh-int-"));
  try {
    const registry = new ModuleRegistry([workspaceConfigModule, agentBehaviorModule]);
    const router = new ModuleCommandRouter(registry);
    const ctx = {
      runtimeVersion: "0.23.0",
      workspacePath: dir,
      effectiveConfig: {
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        }
      }
    };

    let s = await router.execute("interview-behavior-profile", { action: "start" }, ctx);
    assert.equal(s.ok, true);
    const answers = ["balanced", "medium", "normal", "linear", "ask", "normal"];
    for (const value of answers) {
      s = await router.execute("interview-behavior-profile", { action: "answer", value }, ctx);
      assert.equal(s.ok, true, s.message);
    }
    assert.equal(s.data?.complete, true);
    const fin = await router.execute(
      "interview-behavior-profile",
      {
        action: "finalize",
        customId: "custom:int-test",
        label: "Interview test",
        apply: false
      },
      ctx
    );
    assert.equal(fin.ok, true);
    assert.equal(fin.data?.profile?.id, "custom:int-test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("interview-behavior-profile status and start guard + default finalize id", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-beh-int2-"));
  try {
    const registry = new ModuleRegistry([workspaceConfigModule, agentBehaviorModule]);
    const router = new ModuleCommandRouter(registry);
    const ctx = {
      runtimeVersion: "0.23.0",
      workspacePath: dir,
      effectiveConfig: {
        tasks: {
          persistenceBackend: "sqlite",
          sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
        }
      }
    };

    const st0 = await router.execute("interview-behavior-profile", { action: "status" }, ctx);
    assert.equal(st0.ok, true);
    assert.equal(st0.data?.active, false);

    const s1 = await router.execute("interview-behavior-profile", { action: "start" }, ctx);
    assert.equal(s1.ok, true);
    const dup = await router.execute("interview-behavior-profile", { action: "start" }, ctx);
    assert.equal(dup.ok, false);
    assert.equal(dup.code, "behavior-interview-session-exists");

    const st1 = await router.execute("interview-behavior-profile", { action: "status" }, ctx);
    assert.equal(st1.data?.active, true);
    assert.equal(st1.data?.stepIndex, 0);

    const answers = ["balanced", "medium", "normal", "linear", "ask", "normal"];
    for (const value of answers) {
      const a = await router.execute("interview-behavior-profile", { action: "answer", value }, ctx);
      assert.equal(a.ok, true, a.message);
    }
    const stComplete = await router.execute("interview-behavior-profile", { action: "status" }, ctx);
    assert.equal(stComplete.data?.complete, true);

    const fin = await router.execute(
      "interview-behavior-profile",
      { action: "finalize", apply: false },
      ctx
    );
    assert.equal(fin.ok, true);
    assert.equal(fin.data?.profile?.id, "custom:chat-behavior-interview");

    const fin2 = await router.execute(
      "create-behavior-profile",
      {
        id: "custom:chat-behavior-interview",
        label: "Blocker",
        summary: "occupies default slot"
      },
      ctx
    );
    assert.equal(fin2.ok, true);

    await router.execute("interview-behavior-profile", { action: "discard" }, ctx);
    await router.execute("interview-behavior-profile", { action: "start", forceRestart: true }, ctx);
    for (const value of answers) {
      await router.execute("interview-behavior-profile", { action: "answer", value }, ctx);
    }
    const fin3 = await router.execute(
      "interview-behavior-profile",
      { action: "finalize", apply: false },
      ctx
    );
    assert.equal(fin3.ok, true);
    assert.equal(fin3.data?.profile?.id, "custom:chat-behavior-interview-2");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
