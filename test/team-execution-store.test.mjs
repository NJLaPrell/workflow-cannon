import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { prepareKitSqliteDatabase, KIT_SQLITE_USER_VERSION } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  assertTeamExecutionKitSchema,
  buildAssignmentPacketRegistryId,
  buildAssignmentPacketDigest,
  buildAssignmentPacketModelTierRecommendation,
  getAssignmentPacketRegistryRowByDigest,
  getAssignmentPacketRegistryRowById,
  insertAssignment,
  getAssignment,
  listAssignments,
  normalizeAssignmentPacketMetadata,
  normalizeAssignmentValidationCommands,
  blockAssignmentFromWorker,
  submitHandoff,
  reconcileAssignment,
  summarizeHandoffForReconcile,
  upsertAssignmentPacketRegistryRow,
  validateAssignmentMetadataWhenPresent,
  validateHandoffContract,
  validateHandoffContractV1
} from "../dist/modules/team-execution/assignment-store.js";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assignmentMetadataFixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "fixtures/agent-orchestration/assignment-metadata-task-worker.v1.json"),
    "utf8"
  )
);
const handoffV2Fixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/agent-orchestration/handoff-v2/handoff-completed.v2.json"), "utf8")
);

test("kit sqlite migrates to v7 and team assignment DDL round-trips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-team-ex-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const uv = db.pragma("user_version", { simple: true });
    assert.equal(uv, KIT_SQLITE_USER_VERSION);
    assert.equal(assertTeamExecutionKitSchema(dbPath).ok, true);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES ('T-test-1', 'ready', 'workspace-kit', 'fixture', ?, ?, 0, '[]')`
    ).run(now, now);

    insertAssignment(db, {
      id: "asg-1",
      executionTaskId: "T-test-1",
      supervisorId: "sup",
      workerId: "wrk",
      metadata: { note: "x" },
      now
    });
    const row = getAssignment(db, "asg-1");
    assert.ok(row);
    assert.equal(row.status, "assigned");
    assert.equal(row.executionTaskId, "T-test-1");
    assert.ok(row.orchestrationMetadataSummary);
    assert.equal(row.orchestrationMetadataSummary.schemaVersion, 0);

    const bad = validateHandoffContractV1({ schemaVersion: 1 });
    assert.equal(bad.ok, false);

    const hv = validateHandoffContractV1({ schemaVersion: 1, summary: "done" });
    assert.equal(hv.ok, true);
    assert.ok(submitHandoff(db, { assignmentId: "asg-1", workerId: "wrk", handoffJson: hv.json, now }));
    assert.equal(getAssignment(db, "asg-1").status, "submitted");
    assert.equal(getAssignment(db, "asg-1").orchestrationMetadataSummary.schemaVersion, 0);

    assert.ok(
      reconcileAssignment(db, {
        assignmentId: "asg-1",
        supervisorId: "sup",
        checkpointJson: JSON.stringify({ schemaVersion: 1, mergedSummary: "ok" }),
        now
      })
    );
    assert.equal(getAssignment(db, "asg-1").status, "reconciled");

    const listed = listAssignments(db, { executionTaskId: "T-test-1" });
    assert.equal(listed.length, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy assignment metadata without schemaVersion passes validation", () => {
  const result = validateAssignmentMetadataWhenPresent({ note: "legacy row" });
  assert.equal(result.ok, true);
});

test("assignment metadata v1 fixture passes validation", () => {
  const result = validateAssignmentMetadataWhenPresent(assignmentMetadataFixture);
  assert.equal(result.ok, true);
});

test("packet metadata normalization computes recommendation and stable digest", () => {
  const first = normalizeAssignmentPacketMetadata({
    assignmentId: "asg-packet-1",
    executionTaskId: "T9001",
    supervisorId: "sup-packet",
    workerId: "wrk-packet",
    metadata: assignmentMetadataFixture
  });
  const second = normalizeAssignmentPacketMetadata({
    assignmentId: "asg-packet-1",
    executionTaskId: "T9001",
    supervisorId: "sup-packet",
    workerId: "wrk-packet",
    metadata: { ...assignmentMetadataFixture }
  });

  assert.equal(first?.modelTierRecommendation?.label, "tier_2");
  assert.equal(first?.modelTierRationale, first?.modelTierRecommendation?.rationale);
  assert.match(first?.packetDigest ?? "", /^[a-f0-9]{64}$/);
  assert.equal(first?.packetDigest, second?.packetDigest);

  const changedTask = buildAssignmentPacketDigest({
    assignmentId: "asg-packet-1",
    executionTaskId: "T9002",
    supervisorId: "sup-packet",
    workerId: "wrk-packet",
    metadata: assignmentMetadataFixture
  });
  assert.notEqual(first?.packetDigest, changedTask);

  const changedPrompt = buildAssignmentPacketDigest({
    assignmentId: "asg-packet-1",
    executionTaskId: "T9001",
    supervisorId: "sup-packet",
    workerId: "wrk-packet",
    metadata: {
      ...assignmentMetadataFixture,
      assignmentPromptSummary: "Different worker packet summary"
    }
  });
  assert.notEqual(first?.packetDigest, changedPrompt);
});

test("assignment metadata v1 rejects unknown fields clearly", () => {
  const result = validateAssignmentMetadataWhenPresent({
    ...assignmentMetadataFixture,
    extraScope: ["src/**"]
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unknown-orchestration-field");
  assert.ok(result.issues.some((i) => i.path.includes("extraScope") || i.message.includes("extraScope")));
});

test("assignment metadata v1 rejects missing required profile fields", () => {
  const result = validateAssignmentMetadataWhenPresent({
    schemaVersion: 1,
    agentDefinitionId: "task-worker"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing-required-orchestration-field");
});

test("structured metadata v1 round-trips on assignment insert", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-team-ex-meta-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES ('T-test-meta', 'ready', 'workspace-kit', 'fixture', ?, ?, 0, '[]')`
    ).run(now, now);

    insertAssignment(db, {
      id: "asg-meta-v1",
      executionTaskId: "T-test-meta",
      supervisorId: "sup",
      workerId: "wrk",
      metadata: {
        ...assignmentMetadataFixture,
        packetId: "packet:asg-meta-v1:sha256:fixture",
        validationCommands: [
          { command: "pnpm run build", rationale: "compile" },
          { command: "pnpm run check", rationale: "gate" }
        ]
      },
      now
    });
    const row = getAssignment(db, "asg-meta-v1");
    assert.ok(row?.metadata);
    assert.equal(row.metadata.schemaVersion, 1);
    assert.equal(row.metadata.agentDefinitionId, "task-worker");
    assert.equal(row.metadata.contextProfileId, "task_worker_context_v1");
    assert.ok(row.orchestrationMetadataSummary);
    assert.equal(row.orchestrationMetadataSummary.schemaVersion, 1);
    assert.equal(row.orchestrationMetadataSummary.agentDefinitionId, "task-worker");
    assert.equal(row.orchestrationMetadataSummary.agentSessionId, "session-abc123");
    assert.equal(row.orchestrationMetadataSummary.modelTierRecommendation.label, "tier_2");
    assert.equal(row.orchestrationMetadataSummary.modelTierRationale, row.metadata.modelTierRationale);
    assert.equal(row.orchestrationMetadataSummary.packetId, "packet:asg-meta-v1:sha256:fixture");
    assert.equal(row.orchestrationMetadataSummary.packetDigest, row.metadata.packetDigest);
    assert.equal(row.orchestrationMetadataSummary.validationCommandCount, 2);
    assert.equal(row.orchestrationMetadataSummary.contextProfileId, "task_worker_context_v1");
    assert.equal(row.orchestrationMetadataSummary.accessProfileId, "task_worker_strict_v1");
    assert.equal(row.orchestrationMetadataSummary.handoffContractId, "implementation_handoff_v2");
    assert.ok(row.orchestrationMetadataSummary.pathCounts.ownedPaths > 0);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("recommendation helper escalates high reasoning work to packet tier_3", () => {
  const recommendation = buildAssignmentPacketModelTierRecommendation({
    ...assignmentMetadataFixture,
    modelTier: "high_reasoning"
  });
  assert.equal(recommendation?.label, "tier_3");
  assert.equal(
    recommendation?.rationale,
    assignmentMetadataFixture.modelTierRationale
  );
});

test("assignment packet registry round-trips by packet id and digest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-team-ex-packet-registry-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES ('T-test-registry', 'ready', 'workspace-kit', 'fixture', ?, ?, 0, '[]')`
    ).run(now, now);

    insertAssignment(db, {
      id: "asg-registry",
      executionTaskId: "T-test-registry",
      supervisorId: "sup",
      workerId: "wrk",
      metadata: {
        ...assignmentMetadataFixture,
        packetId: "packet:asg-registry:sha256:abc",
        packetDigest: "sha256:abc",
        validationCommands: [{ command: "pnpm run build", rationale: "compile" }]
      },
      now
    });

    const packetId = buildAssignmentPacketRegistryId({
      assignmentId: "asg-registry",
      packetDigest: "sha256:abc"
    });
    upsertAssignmentPacketRegistryRow(db, {
      packetId,
      packetDigest: "sha256:abc",
      assignmentId: "asg-registry",
      executionTaskId: "T-test-registry",
      body: {
        schemaVersion: 1,
        assignmentId: "asg-registry",
        packetDigest: "sha256:abc"
      },
      now
    });

    const byId = getAssignmentPacketRegistryRowById(db, packetId);
    const byDigest = getAssignmentPacketRegistryRowByDigest(db, "sha256:abc");
    assert.equal(byId?.packetDigest, "sha256:abc");
    assert.equal(byDigest?.packetId, packetId);
    assert.equal(byDigest?.body.assignmentId, "asg-registry");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validation command normalization keeps only well-formed entries", () => {
  const normalized = normalizeAssignmentValidationCommands([
    { command: "pnpm run build", rationale: "compile" },
    { command: "", rationale: "skip" },
    { nope: true },
    { command: "pnpm run check", exitCode: 0 }
  ]);
  assert.deepEqual(normalized, [
    { command: "pnpm run build", rationale: "compile" },
    { command: "pnpm run check", exitCode: 0 }
  ]);
});

test("worker blocker transition sets blocked status and reason", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-team-ex-worker-block-"));
  const dbPath = path.join(dir, "wk.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO task_engine_tasks (id, status, type, title, created_at, updated_at, archived, depends_on_json)
       VALUES ('T-test-worker-block', 'ready', 'workspace-kit', 'fixture', ?, ?, 0, '[]')`
    ).run(now, now);

    insertAssignment(db, {
      id: "asg-worker-block",
      executionTaskId: "T-test-worker-block",
      supervisorId: "sup",
      workerId: "wrk",
      metadata: null,
      now
    });

    const changed = blockAssignmentFromWorker(db, {
      assignmentId: "asg-worker-block",
      workerId: "wrk",
      reason: "blocked on missing API contract",
      now
    });
    assert.equal(changed, true);

    const row = getAssignment(db, "asg-worker-block");
    assert.equal(row?.status, "blocked");
    assert.equal(row?.blockReason, "blocked on missing API contract");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handoff contract validator accepts v2 and enforces assignment/worker coherence", () => {
  const ok = validateHandoffContract(handoffV2Fixture, {
    assignmentId: handoffV2Fixture.assignmentId,
    workerId: handoffV2Fixture.agentId
  });
  assert.equal(ok.ok, true);

  const assignmentMismatch = validateHandoffContract(handoffV2Fixture, {
    assignmentId: "asg-other",
    workerId: handoffV2Fixture.agentId
  });
  assert.equal(assignmentMismatch.ok, false);
  assert.equal(assignmentMismatch.message, "handoff.assignmentId must match assignmentId");

  const workerMismatch = validateHandoffContract(handoffV2Fixture, {
    assignmentId: handoffV2Fixture.assignmentId,
    workerId: "worker-other"
  });
  assert.equal(workerMismatch.ok, false);
  assert.equal(workerMismatch.message, "handoff.agentId must match workerId");
});

test("handoff contract validator remains backward compatible for v1 payload", () => {
  const v1 = validateHandoffContract(
    {
      schemaVersion: 1,
      summary: "done",
      evidenceRefs: ["artifacts/log.txt"]
    },
    {
      assignmentId: "asg-v1",
      workerId: "wrk-v1"
    }
  );
  assert.equal(v1.ok, true);
});

test("reconcile handoff summary supports v2 status decision hints", () => {
  const cases = [
    { status: "blocked", expected: "assign_blocker" },
    { status: "partial", expected: "request_rework" },
    { status: "needs_review", expected: "assign_review" }
  ];

  for (const c of cases) {
    const context = summarizeHandoffForReconcile({
      ...handoffV2Fixture,
      status: c.status,
      summary: `summary-${c.status}`,
      nextRecommendedAction: "supersede this assignment"
    });
    assert.ok(context);
    assert.equal(context.handoffSchemaVersion, 2);
    assert.equal(context.handoffStatus, c.status);
    assert.equal(context.suggestedDecision, c.expected);
    assert.ok(context.suggestedDecisions.includes("cancel_supersede"));
  }
});

test("reconcile handoff summary remains compatible with v1 handoff", () => {
  const context = summarizeHandoffForReconcile({
    schemaVersion: 1,
    summary: "legacy handoff",
    evidenceRefs: ["artifacts/log.txt"]
  });

  assert.ok(context);
  assert.equal(context.handoffSchemaVersion, 1);
  assert.equal(context.handoffSummary, "legacy handoff");
  assert.equal(context.suggestedDecision, "reconcile");
  assert.deepEqual(context.evidenceRefs, ["artifacts/log.txt"]);
});
