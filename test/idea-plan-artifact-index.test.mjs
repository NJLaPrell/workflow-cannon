/**
 * IdeaPlan artifact writes keep plan-artifact dashboard index rows in sync.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { openPlanningStores } from "../dist/core/planning/index.js";
import { readPlanArtifactIndex } from "../dist/core/planning/plan-artifact-storage.js";
import {
  buildIdeaPlanArtifactIndex,
  readIdeaPlanArtifact,
  writeNextIdeaPlanArtifactVersion
} from "../dist/modules/ideas/idea-plan-artifact-storage.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-idea-plan-index-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

describe("idea-plan-artifact index sync", () => {
  it("buildIdeaPlanArtifactIndex prefers unified plan.title over fallback", () => {
    const index = buildIdeaPlanArtifactIndex({
      schemaVersion: 1,
      planId: "plan-1",
      version: 3,
      planRef: "plan-artifact:plan-1",
      status: "planning",
      ideaId: "I001",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      plan: {
        title: "Guided brainstorming",
        summary: "Seed the plan from ideation output.",
        wbsRowCount: 0
      }
    });
    assert.equal(index.title, "Guided brainstorming");
    assert.equal(index.currentVersion, 3);
    assert.equal(index.status, "draft");
  });

  it("writeNextIdeaPlanArtifactVersion upserts plan-artifact index when sqliteDb is provided", async () => {
    const workspace = await tmpWorkspace();
    const planning = await openPlanningStores(ctx(workspace));
    const db = planning.sqliteDual.getDatabase();
    const document = {
      schemaVersion: 1,
      planId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      version: 1,
      planRef: "plan-artifact:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      status: "planning",
      ideaId: "I099",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      plan: {
        title: "Index sync test plan",
        summary: "Dashboard should read this title after write.",
        planningType: "new-feature",
        wbsRowCount: 0
      }
    };

    const persisted = writeNextIdeaPlanArtifactVersion(workspace, document, { sqliteDb: db });
    const index = readPlanArtifactIndex(workspace, persisted.planId, SQLITE_CFG);
    assert.ok(index);
    assert.equal(index.title, "Index sync test plan");
    assert.equal(index.currentVersion, persisted.version);

    const reread = readIdeaPlanArtifact(workspace, persisted.planRef);
    assert.equal(reread?.plan?.title, "Index sync test plan");
  });
});
