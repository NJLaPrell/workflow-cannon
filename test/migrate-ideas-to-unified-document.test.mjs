/**
 * T100792 — migrate legacy Ideas and PlanArtifacts to unified IdeaPlan documents.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths, writePlanArtifactVersion } from "../dist/core/planning/plan-artifact-storage.js";
import { isIdeaPlanDocument, readIdeaPlanArtifact } from "../dist/modules/planning/idea-plan/idea-plan-artifact-storage.js";
import { createIdea } from "../dist/modules/planning/idea-row/idea-store.js";
import {
  buildIdeaOnlyUnifiedDocument,
  mapLifecycleToUnifiedStatus,
  migrateIdeasToUnifiedDocument,
  resolveUnifiedStatusForMigration
} from "../dist/modules/planning/idea-row/migrate-ideas-to-unified-document.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshDraftArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  doc.provenance = {
    ...doc.provenance,
    sourceIdeaId: "I001",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z"
  };
  return doc;
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-migrate-ideas-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "migrate-ideas-to-unified-document.test.mjs" };
}

async function openDb(workspace) {
  const planning = await planningModule.onCommand({ name: "list-planning-types", args: {} }, ctx(workspace));
  assert.equal(planning.ok, true);
  const { openPlanningStores } = await import("../dist/core/planning/index.js");
  const stores = await openPlanningStores(ctx(workspace));
  return stores.sqliteDual.getDatabase();
}

describe("migrate-ideas-to-unified-document", () => {
  it("maps lifecycle states to unified IdeaPlan statuses", () => {
    assert.equal(mapLifecycleToUnifiedStatus("open"), "idea");
    assert.equal(mapLifecycleToUnifiedStatus("planning"), "planning");
    assert.equal(mapLifecycleToUnifiedStatus("approval_ready"), "reviewed");
    assert.equal(mapLifecycleToUnifiedStatus("accepted"), "accepted");
    assert.equal(mapLifecycleToUnifiedStatus("finalized"), "delivered");
  });

  it("dry-run previews idea-only promotion without writes", async () => {
    const workspace = await tmpWorkspace();
    const db = await openDb(workspace);
    // Simulate a legacy idea row persisted before create-idea auto-linked a unified
    // document (bypasses the planning module command, which now auto-creates one).
    const idea = createIdea(db, { title: "Migrate me" }, new Date().toISOString());

    const preview = migrateIdeasToUnifiedDocument({ workspacePath: workspace, db, dryRun: true });
    assert.equal(preview.dataLossReported, false);
    assert.equal(preview.outcomes.length, 1);
    assert.equal(preview.outcomes[0].action, "created");
    assert.equal(preview.outcomes[0].ideaId, idea.id);
    assert.equal(readIdeaPlanArtifact(workspace, preview.outcomes[0].planRef), null);
  });

  it("create-idea already links a unified document, so migration reports already-unified", async () => {
    const workspace = await tmpWorkspace();
    const created = await planningModule.onCommand(
      {
        name: "create-idea",
        args: { title: "Fresh idea", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(created.ok, true);
    const ideaId = created.data.idea.id;
    assert.ok(created.data.idea.linkedPlanArtifact);
    const db = await openDb(workspace);

    const preview = migrateIdeasToUnifiedDocument({ workspacePath: workspace, db, dryRun: true });
    assert.equal(preview.dataLossReported, false);
    assert.equal(preview.outcomes.length, 1);
    assert.equal(preview.outcomes[0].action, "already-unified");
    assert.equal(preview.outcomes[0].ideaId, ideaId);
    assert.equal(preview.outcomes[0].planRef, created.data.idea.linkedPlanArtifact);
  });

  it("applies migration for idea-only rows and links linkedPlanArtifact", async () => {
    const workspace = await tmpWorkspace();
    const created = await planningModule.onCommand(
      {
        name: "create-idea",
        args: { title: "Promote me", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(created.ok, true);
    const ideaId = created.data.idea.id;
    const db = await openDb(workspace);

    const applied = migrateIdeasToUnifiedDocument({ workspacePath: workspace, db, dryRun: false });
    assert.equal(applied.dataLossReported, false);
    assert.ok(applied.snapshotPath?.startsWith(".workspace-kit/migration-backups/"));

    const got = await planningModule.onCommand({ name: "get-idea", args: { ideaId } }, ctx(workspace));
    assert.equal(got.ok, true);
    assert.ok(got.data.idea.linkedPlanArtifact);
    assert.ok(isIdeaPlanDocument(got.data.ideaPlan));
    assert.equal(got.data.ideaPlan.status, "idea");
    assert.equal(got.data.ideaPlan.ideaId, ideaId);
  });

  it("merges legacy PlanArtifact v1 into unified document", async () => {
    const workspace = await tmpWorkspace();
    const created = await planningModule.onCommand(
      {
        name: "create-idea",
        args: { title: "Legacy plan", status: "planning", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(created.ok, true);
    const ideaId = created.data.idea.id;
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance.sourceIdeaId = ideaId;
    writePlanArtifactVersion(workspace, artifact, { effectiveConfig: SQLITE_CFG });

    const db = await openDb(workspace);
    await planningModule.onCommand(
      {
        name: "update-idea",
        args: {
          ideaId,
          linkedPlanArtifact: artifact.planRef,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    const applied = migrateIdeasToUnifiedDocument({ workspacePath: workspace, db, dryRun: false });
    assert.equal(applied.dataLossReported, false);
    const outcome = applied.outcomes.find((row) => row.ideaId === ideaId);
    assert.equal(outcome?.action, "merged");
    assert.equal(outcome?.status, "planning");

    const stored = readIdeaPlanArtifact(workspace, artifact.planRef);
    assert.ok(stored);
    assert.equal(stored.status, "planning");
    assert.ok(Array.isArray(stored.wbs));
    assert.ok(stored.plan?.title);
  });

  it("command dry-run then apply via module handler", async () => {
    const workspace = await tmpWorkspace();
    await planningModule.onCommand(
      {
        name: "create-idea",
        args: { title: "CLI path", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );

    const dry = await planningModule.onCommand(
      { name: "migrate-ideas-to-unified-document", args: { dryRun: true } },
      ctx(workspace)
    );
    assert.equal(dry.ok, true);
    assert.equal(dry.code, "ideas-unified-migration-dry-run");

    const live = await planningModule.onCommand(
      {
        name: "migrate-ideas-to-unified-document",
        args: { dryRun: false, policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(live.ok, true);
    assert.equal(live.code, "ideas-unified-migration-applied");
  });

  it("resolveUnifiedStatusForMigration honors accepted plan artifacts", () => {
    const idea = {
      id: "I001",
      title: "x",
      status: "planned",
      sortOrder: 0,
      previousPlanArtifacts: [],
      createdAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z"
    };
    const artifact = {
      status: "accepted",
      provenance: { updatedAt: "2026-07-02T09:00:00.000Z" }
    };
    const status = resolveUnifiedStatusForMigration(idea, artifact, null, "accepted");
    assert.equal(status, "accepted");
  });

  it("buildIdeaOnlyUnifiedDocument matches idea-state fixture envelope", () => {
    const idea = {
      id: "I005",
      title: "Brainstorm",
      note: "note",
      status: "open",
      sortOrder: 0,
      previousPlanArtifacts: [],
      createdAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z"
    };
    const doc = buildIdeaOnlyUnifiedDocument(idea, repoRoot, "2026-07-02T09:00:00.000Z", "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60");
    assert.equal(doc.planId, "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60");
    assert.equal(doc.status, "idea");
    assert.equal(doc.ideaId, "I005");
    assert.equal(doc.agentDirective?.state, "idea");
  });
});
