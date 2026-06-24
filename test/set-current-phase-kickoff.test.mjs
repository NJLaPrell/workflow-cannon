import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { taskEngineModule } from "../dist/index.js";

async function tmpDir(prefix = "set-phase-kickoff-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function sqliteTaskEngineCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra =
    rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
  const { tasks: _drop, ...restTop } = partialEffective;
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      ...restTop,
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        ...taskExtra
      }
    }
  };
}

describe("set-current-phase kickoff gate", () => {
  it("dry run includes kickoffReadiness and presentation kickoffSummary", async () => {
    const workspace = await tmpDir();
    const ctx = sqliteTaskEngineCtx(workspace);

    const result = await taskEngineModule.onCommand(
      { name: "set-current-phase", args: { currentKitPhase: "72", nextKitPhase: "73", dryRun: true } },
      ctx
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "set-current-phase-dry-run");
    assert.equal(result.data.kickoffReadiness?.schemaVersion, 1);
    assert.equal(result.data.kickoffReadiness?.phaseKey, "72");
    assert.equal(typeof result.data.kickoffReadiness?.passed, "boolean");
    assert.ok(Array.isArray(result.data.kickoffReadiness?.findings));
    assert.equal(result.data.presentation.phaseRollover.kind, "phase_rollover_v1");
    assert.equal(typeof result.data.presentation.phaseRollover.kickoffSummary?.passed, "boolean");
    assert.equal(typeof result.data.presentation.phaseRollover.kickoffSummary?.findingCount, "number");
    assert.ok(Array.isArray(result.data.presentation.phaseRollover.kickoffSummary?.topFindings));
  });

  it("enforce blocks live rollover without mutating kit_workspace_status", async () => {
    const workspace = await tmpDir();
    const ctx = sqliteTaskEngineCtx(workspace, {
      tasks: {
        phaseKickoff: { enforcementMode: "enforce", staleTaskDays: 14, checkScopePaths: false }
      }
    });

    const blocked = await taskEngineModule.onCommand(
      {
        name: "set-current-phase",
        args: {
          currentKitPhase: "999",
          nextKitPhase: "1000",
          expectedWorkspaceRevision: 0,
          clientMutationId: "kickoff-enforce-block-test"
        }
      },
      ctx
    );

    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "phase-kickoff-blocked");
    assert.equal(blocked.data.kickoffReadiness?.passed, false);
    assert.ok(
      (blocked.data.kickoffReadiness?.findings ?? []).some((f) => f.severity === "block"),
      "expected at least one block-severity finding"
    );
    assert.equal(typeof blocked.data.presentation.phaseRollover.kickoffSummary?.passed, "boolean");

    const status = await taskEngineModule.onCommand({ name: "get-workspace-status", args: {} }, ctx);
    assert.equal(status.ok, true);
    assert.equal(status.data.workspaceStatus?.workspaceRevision ?? 0, 0);
    assert.equal(status.data.workspaceStatus?.currentKitPhase, null);
  });

  it("off mode proceeds on live write despite kickoff findings", async () => {
    const workspace = await tmpDir();
    const ctx = sqliteTaskEngineCtx(workspace, {
      tasks: {
        phaseKickoff: { enforcementMode: "off", checkScopePaths: false }
      }
    });

    const result = await taskEngineModule.onCommand(
      {
        name: "set-current-phase",
        args: {
          currentKitPhase: "999",
          nextKitPhase: "1000",
          expectedWorkspaceRevision: 0,
          clientMutationId: "kickoff-off-proceed-test"
        }
      },
      ctx
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "set-current-phase-updated");
    assert.equal(result.data.kickoffReadiness?.schemaVersion, 1);
    assert.equal(result.data.workspaceStatusAfter.currentKitPhase, "999");
    assert.equal(result.data.afterRevision, 1);
  });
});
