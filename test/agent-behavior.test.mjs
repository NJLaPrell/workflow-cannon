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
