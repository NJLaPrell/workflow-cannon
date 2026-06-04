import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

import { prepareKitSqliteDatabase, taskEngineModule, teamExecutionModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assignmentMetadataFixture = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/agent-orchestration/assignment-metadata-task-worker.v1.json"), "utf8")
);

async function tmpDir(prefix = "team-exec-mod-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function sqliteCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };
}

function sqliteCtxWithActor(workspace, actor, adminIds = []) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    resolvedActor: actor,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      },
      orchestration: {
        adminIds
      }
    }
  };
}

async function seedExecutionTask(workspace, taskId, title, options = {}) {
  const tasksDir = path.join(workspace, ".workspace-kit", "tasks");
  await mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    prepareKitSqliteDatabase(db);
    const now = new Date().toISOString();
    const status = typeof options.status === "string" ? options.status : "ready";
    const type = typeof options.type === "string" ? options.type : "workspace-kit";
    const phase = typeof options.phase === "string" ? options.phase : null;
    const phaseKey = typeof options.phaseKey === "string" ? options.phaseKey : null;
    const approach = typeof options.approach === "string" ? options.approach : null;
    const summary = typeof options.summary === "string" ? options.summary : null;
    const acceptanceCriteria = Array.isArray(options.acceptanceCriteria) ? options.acceptanceCriteria : [];
    const technicalScope = Array.isArray(options.technicalScope) ? options.technicalScope : [];
    const metadata = options.metadata && typeof options.metadata === "object" ? options.metadata : null;
    const features = Array.isArray(options.features) ? options.features : [];
    db.prepare(
      `INSERT OR REPLACE INTO task_engine_tasks (
        id, status, type, title, created_at, updated_at, archived, archived_at,
        priority, phase, phase_key, ownership, approach,
        depends_on_json, unblocks_json, technical_scope_json, acceptance_criteria_json,
        summary, description, risk, queue_namespace, evidence_key, evidence_kind, metadata_json, features_json,
        routing_category, routing_confidence_tier, routing_blocked_reason_category, routing_tags_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      taskId,
      status,
      type,
      title,
      now,
      now,
      0,
      null,
      null,
      phase,
      phaseKey,
      null,
      approach,
      "[]",
      "[]",
      JSON.stringify(technicalScope),
      JSON.stringify(acceptanceCriteria),
      summary,
      null,
      null,
      null,
      null,
      null,
      metadata ? JSON.stringify(metadata) : null,
      JSON.stringify(features),
      null,
      null,
      null,
      null
    );
  } finally {
    db.close();
  }
}

test("agent-execution-packet returns bounded worker context without queue reads", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8613", "Add packet builder", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Build a bounded packet for worker startup.",
    approach: "Implement packet command and runtime wiring.",
    acceptanceCriteria: [
      "Packet includes explicit boundaries.",
      "Worker can start from the packet."
    ],
    technicalScope: ["src/modules/team-execution/**", "src/modules/task-engine/**"]
  });
  await seedExecutionTask(workspace, "T8614", "Unrelated queue work", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Should not appear in the packet."
  });

  const metadata = {
    schemaVersion: 1,
    agentDefinitionId: "task-worker",
    contextProfileId: "task_worker_context_v1",
    accessProfileId: "task_worker_strict_v1",
    handoffContractId: "implementation_handoff_v2",
    modelTier: "balanced",
    assignmentPromptSummary: "Implement the packet core for bounded worker starts.",
    ownedPaths: ["src/modules/team-execution/**"],
    forbiddenPaths: ["extensions/cursor-workflow-cannon/**"],
    requiresApprovalPaths: ["src/contracts/**"],
    resources: {
      ownedPaths: ["src/modules/task-engine/**"],
      readOnlyPaths: [".ai/**", "AGENT_ORCHESTRATION_HANDOFF.md"],
      forbiddenPaths: ["docs/maintainers/**"]
    }
  };

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8613",
        executionTaskId: "T8613",
        supervisorId: "sup-13",
        workerId: "wrk-13",
        metadata
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        assignmentId: "asg-8613",
        workerId: "wrk-13"
      }
    },
    sqliteCtxWithActor(workspace, "wrk-13")
  );

  assert.equal(packetResult.ok, true);
  assert.equal(packetResult.code, "agent-execution-packet");
  assert.equal(packetResult.data.packet.packetKind, "assignment");
  assert.equal(packetResult.data.packet.packetLockStatus, "assignment_locked");
  assert.equal(packetResult.data.packet.taskId, "T8613");
  assert.equal(packetResult.data.packet.phaseKey, "130");
  assert.equal(packetResult.data.packet.assignmentIntent, metadata.assignmentPromptSummary);
  assert.equal(packetResult.data.packet.title, "Add packet builder");
  assert.equal(packetResult.data.packet.summary, "Build a bounded packet for worker startup.");
  assert.deepEqual(packetResult.data.packet.acceptanceCriteria, [
    "Packet includes explicit boundaries.",
    "Worker can start from the packet."
  ]);
  assert.deepEqual(packetResult.data.packet.ownedPaths, [
    "src/modules/team-execution/**",
    "src/modules/task-engine/**"
  ]);
  assert.deepEqual(packetResult.data.packet.readOnlyPaths, [".ai/**", "AGENT_ORCHESTRATION_HANDOFF.md"]);
  assert.deepEqual(packetResult.data.packet.forbiddenPaths, [
    "extensions/cursor-workflow-cannon/**",
    "docs/maintainers/**"
  ]);
  assert.equal(packetResult.data.packet.baseBranch, "release/phase-130");
  assert.match(packetResult.data.packet.suggestedWorkerBranch, /^feature\/T8613-/);
  assert.ok(packetResult.data.packet.validationCommands.length > 0);
  assert.equal(packetResult.data.packet.modelTier, "balanced");
  assert.equal(packetResult.data.packet.modelTierRecommendation.label, "tier_3");
  assert.ok(
    packetResult.data.packet.modelTierEscalationTriggers.some((item) => item.includes("approval-gated paths"))
  );
  assert.equal(packetResult.data.packet.handoffContract.contractId, "implementation_handoff_v2");
  assert.equal(packetResult.data.packet.handoffContract.expectedAssignmentId, "asg-8613");
  assert.equal(packetResult.data.packet.handoffContract.expectedWorkerId, "wrk-13");
  assert.ok(packetResult.data.packet.refs.instructions.includes(".ai/playbooks/task-to-phase-branch.md"));
  assert.ok(
    packetResult.data.packet.refs.instructions.includes(
      "src/modules/team-execution/instructions/agent-execution-packet.md"
    )
  );
  assert.equal(packetResult.data.packet.packetDigest.startsWith("sha256:"), true);
  assert.equal(JSON.stringify(packetResult.data.packet).includes("Unrelated queue work"), false);
  assert.ok(packetResult.data.packet.stopConditions.some((item) => item.includes("owned paths")));
  assert.equal(packetResult.data.packetAudit.stale, false);
  assert.equal(packetResult.data.packetAudit.registryAvailable, true);
  assert.equal(packetResult.data.storedPacket.packetDigest, packetResult.data.packet.packetDigest);
});

test("agent-execution-packet returns task-first draft packet before assignment registration", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8616", "Draft packet task", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Generate assignment metadata before worker registration.",
    approach: "Use the task details to produce a bounded draft packet.",
    acceptanceCriteria: [
      "Draft includes register-assignment metadata.",
      "Draft does not create assignment authority."
    ],
    metadata: {
      ownedPaths: ["src/modules/team-execution/**", "test/team-execution-module.test.mjs"]
    },
    technicalScope: ["src/modules/team-execution/**"]
  });
  await seedExecutionTask(workspace, "T8617", "Unrelated draft task", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Should not appear in the draft packet."
  });

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T8616",
        phaseKey: "130"
      }
    },
    ctx
  );

  assert.equal(packetResult.ok, true);
  assert.equal(packetResult.code, "agent-execution-packet");
  assert.equal(packetResult.data.packet.packetKind, "draft");
  assert.equal(packetResult.data.packet.packetLockStatus, "draft_unlocked");
  assert.equal(packetResult.data.packet.assignmentId, null);
  assert.equal(packetResult.data.packet.assignmentStatus, "draft");
  assert.equal(packetResult.data.packet.workerId, null);
  assert.equal(packetResult.data.packet.taskId, "T8616");
  assert.equal(packetResult.data.packet.phaseKey, "130");
  assert.deepEqual(packetResult.data.packet.acceptanceCriteria, [
    "Draft includes register-assignment metadata.",
    "Draft does not create assignment authority."
  ]);
  assert.deepEqual(packetResult.data.packet.ownedPaths, [
    "src/modules/team-execution/**",
    "test/team-execution-module.test.mjs"
  ]);
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.schemaVersion, 1);
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.agentDefinitionId, "task-worker");
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.contextProfileId, "task_worker_context_v1");
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.accessProfileId, "task_worker_strict_v1");
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.handoffContractId, "implementation_handoff_v2");
  assert.equal(packetResult.data.packet.modelTier, "balanced");
  assert.equal(packetResult.data.packet.modelTierRecommendation.label, "tier_2");
  assert.equal(
    packetResult.data.packet.recommendedAssignmentMetadata.modelTierRecommendation.label,
    packetResult.data.packet.modelTierRecommendation.label
  );
  assert.deepEqual(packetResult.data.packet.modelTierEscalationTriggers, []);
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.lockScope.tasks[0], "T8616");
  assert.equal(packetResult.data.packet.registerAssignmentRef.command, "register-assignment");
  assert.equal(packetResult.data.packet.registerAssignmentRef.args.executionTaskId, "T8616");
  assert.equal(
    packetResult.data.packet.registerAssignmentRef.args.metadata,
    packetResult.data.packet.recommendedAssignmentMetadata
  );
  assert.match(packetResult.data.packet.registerAssignmentRef.commandLine, /"executionTaskId":"T8616"/);
  assert.ok(packetResult.data.packet.stopConditions.some((item) => item.includes("Do not implement from this draft")));
  assert.equal(packetResult.data.packet.packetDigest.startsWith("sha256:"), true);
  assert.equal(JSON.stringify(packetResult.data.packet).includes("Unrelated draft task"), false);
  assert.equal(packetResult.data.packetAudit.registryAvailable, false);
  assert.equal(packetResult.data.packetAudit.packetKind, "draft");
  assert.equal(packetResult.data.storedPacket, undefined);
});

test("agent-execution-packet rejects mixed draft and assignment args", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8618", "Mixed packet args", {
    phase: "Phase 130",
    phaseKey: "130"
  });

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T8618",
        assignmentId: "asg-8618"
      }
    },
    ctx
  );

  assert.equal(packetResult.ok, false);
  assert.equal(packetResult.code, "invalid-args");
});

test("agent-execution-packet draft tier recommendation escalates risky work deterministically", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8619", "Release policy schema migration", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Publish release orchestration policy changes with rollback handling.",
    acceptanceCriteria: ["Escalate ambiguous release and schema work."],
    metadata: {
      ownedPaths: [
        "src/modules/task-engine/**",
        "src/modules/team-execution/**",
        "schemas/agent-orchestration/**",
        ".ai/AGENT-CLI-MAP.md",
        "test/team-execution-module.test.mjs",
        "test/task-engine.test.mjs"
      ]
    }
  });

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T8619",
        phaseKey: "130"
      }
    },
    ctx
  );

  assert.equal(packetResult.ok, true);
  assert.equal(packetResult.data.packet.modelTier, "high_reasoning");
  assert.equal(packetResult.data.packet.modelTierRecommendation.label, "tier_3");
  assert.ok(packetResult.data.packet.modelTierRationale.includes("Escalated for draft packet"));
  assert.ok(packetResult.data.packet.modelTierEscalationTriggers.some((item) => item.includes("risk terms")));
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.modelTier, "high_reasoning");
  assert.equal(packetResult.data.packet.recommendedAssignmentMetadata.modelTierRecommendation.label, "tier_3");
});

test("agent-execution-packet draft tier recommendation keeps narrow mechanical work light", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8620", "Fix typo", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Correct a typo.",
    acceptanceCriteria: ["Typo corrected."],
    metadata: {
      ownedPaths: ["README.md"]
    }
  });

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        mode: "draft",
        taskId: "T8620",
        phaseKey: "130"
      }
    },
    ctx
  );

  assert.equal(packetResult.ok, true);
  assert.equal(packetResult.data.packet.modelTier, "cheap_fast");
  assert.equal(packetResult.data.packet.modelTierRecommendation.label, "tier_1");
  assert.deepEqual(packetResult.data.packet.modelTierEscalationTriggers, []);
});

test("agent-execution-packet keeps path boundaries explicit when assignment metadata is absent", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8615", "Fallback packet task", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Fallback summary",
    acceptanceCriteria: ["Return explicit empty boundary arrays."]
  });

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8615",
        executionTaskId: "T8615",
        supervisorId: "sup-15",
        workerId: "wrk-15"
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const packetResult = await teamExecutionModule.onCommand(
    {
      name: "agent-execution-packet",
      args: {
        assignmentId: "asg-8615"
      }
    },
    ctx
  );

  assert.equal(packetResult.ok, true);
  assert.deepEqual(packetResult.data.packet.ownedPaths, []);
  assert.deepEqual(packetResult.data.packet.readOnlyPaths, []);
  assert.deepEqual(packetResult.data.packet.forbiddenPaths, []);
  assert.deepEqual(packetResult.data.packet.requiresApprovalPaths, []);
  assert.equal(packetResult.data.packet.modelTierRecommendation.label, "tier_2");
  assert.ok(packetResult.data.packet.stopConditions.some((item) => item.includes("explicit owned paths")));
});

test("report-assignment-blocker blocks assignment and creates linked defect task", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8601", "Worker task");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8601",
        executionTaskId: "T8601",
        supervisorId: "sup-1",
        workerId: "wrk-1"
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8601",
        workerId: "wrk-1",
        handoff: {
          schemaVersion: 1,
          summary: "Attempted implementation but hit runtime blocker",
          evidenceRefs: ["artifacts/repro-8601.log"]
        }
      }
    },
    ctx
  );
  assert.equal(submitted.ok, true);

  const blocker = await teamExecutionModule.onCommand(
    {
      name: "report-assignment-blocker",
      args: {
        assignmentId: "asg-8601",
        workerId: "wrk-1",
        reason: "Planner crashes during synthesis",
        defectTitle: "Planner synthesis crash while executing assignment",
        severity: "high",
        outputRefs: ["artifacts/stacktrace-8601.txt"],
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    ctx
  );

  assert.equal(blocker.ok, true);
  assert.equal(blocker.code, "assignment-blocker-reported");
  assert.equal(blocker.data.assignment.status, "blocked");
  assert.equal(blocker.data.assignment.blockReason, "Planner crashes during synthesis");
  assert.equal(blocker.data.blockerReport.defectCreated, true);
  assert.deepEqual(blocker.data.blockerReport.outputRefs, [
    "artifacts/stacktrace-8601.txt",
    "artifacts/repro-8601.log"
  ]);

  const defectTaskId = blocker.data.defectTask?.id;
  assert.ok(defectTaskId);

  const fetched = await taskEngineModule.onCommand(
    { name: "get-task", args: { taskId: defectTaskId } },
    ctx
  );
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.task.type, "improvement");
  assert.equal(fetched.data.task.status, "proposed");
  assert.equal(fetched.data.task.priority, "P1");
  assert.equal(fetched.data.task.metadata.relatedTaskId, "T8601");
  assert.match(fetched.data.task.metadata.issue, /asg-8601/);
});

test("register-assignment persists packet digest and tier recommendation in the response", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8600", "Worker packet task", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Persist packet metadata and registry context.",
    approach: "Store the bounded packet body alongside the assignment row.",
    acceptanceCriteria: ["Packet metadata is persisted."]
  });

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8600",
        executionTaskId: "T8600",
        supervisorId: "sup-0",
        workerId: "wrk-0",
        metadata: assignmentMetadataFixture
      }
    },
    ctx
  );

  assert.equal(registered.ok, true);
  assert.equal(registered.data.assignment.metadata.packetDigest.startsWith("sha256:"), true);
  assert.equal(registered.data.assignment.metadata.packetId.startsWith("packet:asg-8600:"), true);
  assert.ok(registered.data.assignment.metadata.validationCommands.length > 0);
  assert.equal(
    registered.data.assignment.orchestrationMetadataSummary.packetDigest,
    registered.data.assignment.metadata.packetDigest
  );
  assert.equal(
    registered.data.assignment.orchestrationMetadataSummary.packetId,
    registered.data.assignment.metadata.packetId
  );
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.modelTierRecommendation.label, "tier_2");
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.validationCommandCount > 0, true);
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.packetContextStatus, "current");
  assert.equal(registered.data.assignment.orchestrationMetadataSummary.packetRegistryStatus, "stored");
  assert.equal(registered.data.assignment.packetAudit.stale, false);
  assert.equal(registered.data.assignment.packetAudit.registryAvailable, true);
  assert.equal(
    registered.data.assignment.orchestrationMetadataSummary.modelTierRationale,
    registered.data.assignment.metadata.modelTierRationale
  );
});

test("list-assignments flags stale packet context after task changes", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8604", "Worker packet drift", {
    phase: "Phase 130",
    phaseKey: "130",
    summary: "Original worker packet summary.",
    approach: "Initial packet body state.",
    acceptanceCriteria: ["Audit detects stale packet context."]
  });

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8604",
        executionTaskId: "T8604",
        supervisorId: "sup-4",
        workerId: "wrk-4",
        metadata: assignmentMetadataFixture
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const dbPath = path.join(workspace, ".workspace-kit", "tasks", "workspace-kit.db");
  const db = new Database(dbPath);
  try {
    db.prepare("UPDATE task_engine_tasks SET summary = ?, updated_at = ? WHERE id = ?").run(
      "Changed summary that should invalidate the stored packet context.",
      new Date().toISOString(),
      "T8604"
    );
  } finally {
    db.close();
  }

  const listed = await teamExecutionModule.onCommand(
    {
      name: "list-assignments",
      args: {
        executionTaskId: "T8604"
      }
    },
    ctx
  );

  assert.equal(listed.ok, true);
  assert.equal(listed.data.assignments.length, 1);
  assert.equal(listed.data.assignments[0].orchestrationMetadataSummary.packetContextStatus, "stale");
  assert.equal(listed.data.assignments[0].orchestrationMetadataSummary.packetRegistryStatus, "stored");
  assert.equal(listed.data.assignments[0].packetAudit.stale, true);
  assert.equal(
    listed.data.assignments[0].packetAudit.storedPacketDigest,
    registered.data.assignment.metadata.packetDigest
  );
  assert.notEqual(
    listed.data.assignments[0].packetAudit.currentPacketDigest,
    registered.data.assignment.metadata.packetDigest
  );
});

test("report-assignment-blocker supports blocker-only mode without defect creation", async () => {
  const workspace = await tmpDir();
  const ctx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8602", "Worker task 2");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8602",
        executionTaskId: "T8602",
        supervisorId: "sup-2",
        workerId: "wrk-2"
      }
    },
    ctx
  );
  assert.equal(registered.ok, true);

  const blocker = await teamExecutionModule.onCommand(
    {
      name: "report-assignment-blocker",
      args: {
        assignmentId: "asg-8602",
        workerId: "wrk-2",
        reason: "Awaiting upstream API schema decision",
        createDefect: false,
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    ctx
  );

  assert.equal(blocker.ok, true);
  assert.equal(blocker.code, "assignment-blocker-reported");
  assert.equal(blocker.data.assignment.status, "blocked");
  assert.equal(blocker.data.blockerReport.defectCreated, false);
  assert.equal(blocker.data.defectTask, undefined);
});

test("worker cannot run supervisor-only reconcile action", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8603", "Worker task 3");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8603",
        executionTaskId: "T8603",
        supervisorId: "sup-3",
        workerId: "wrk-3"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8603",
        workerId: "wrk-3",
        handoff: {
          schemaVersion: 1,
          summary: "Initial handoff"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-3")
  );
  assert.equal(submitted.ok, true);

  const denied = await teamExecutionModule.onCommand(
    {
      name: "reconcile-assignment",
      args: {
        assignmentId: "asg-8603",
        supervisorId: "wrk-3",
        checkpoint: {
          schemaVersion: 1,
          mergedSummary: "worker self-reconcile attempt"
        },
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-3")
  );

  assert.equal(denied.ok, false);
  assert.equal(denied.code, "assignment-authority-denied");
  assert.equal(denied.data.lifecycleError.reason, "assignment-role-mismatch");
  assert.equal(denied.data.lifecycleError.action, "reconcile-assignment");
});

test("handoff submit replay returns stable assignment-status-invalid code", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8604", "Worker task 4");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8604",
        executionTaskId: "T8604",
        supervisorId: "sup-4",
        workerId: "wrk-4"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const first = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8604",
        workerId: "wrk-4",
        handoff: {
          schemaVersion: 1,
          summary: "Completed"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-4")
  );
  assert.equal(first.ok, true);

  const replay = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8604",
        workerId: "wrk-4",
        handoff: {
          schemaVersion: 1,
          summary: "Replay"
        },
        expectedPlanningGeneration: first.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-4")
  );

  assert.equal(replay.ok, false);
  assert.equal(replay.code, "assignment-status-invalid");
  assert.equal(replay.data.lifecycleError.reason, "status-not-allowed");
  assert.deepEqual(replay.data.lifecycleError.allowedStatuses, ["assigned"]);
});

test("submit-assignment-handoff accepts handoff v2 payloads", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8606", "Worker task 6");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8606",
        executionTaskId: "T8606",
        supervisorId: "sup-6",
        workerId: "wrk-6"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8606",
        workerId: "wrk-6",
        handoff: {
          schemaVersion: 2,
          assignmentId: "asg-8606",
          agentId: "wrk-6",
          status: "completed",
          summary: "Worker completed the implementation",
          evidenceRefs: ["artifacts/evidence-8606.txt"]
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-6")
  );

  assert.equal(submitted.ok, true);
  assert.equal(submitted.code, "assignment-handoff-submitted");
  assert.equal(submitted.data.assignment.status, "submitted");
  assert.equal(submitted.data.assignment.handoff.schemaVersion, 2);
  assert.equal(submitted.data.assignment.handoff.assignmentId, "asg-8606");
  assert.equal(submitted.data.assignment.handoff.agentId, "wrk-6");
});

test("reconcile-assignment consumes handoff v2 context and supports decision hints", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  const cases = [
    { assignmentId: "asg-8610", workerId: "wrk-8610", status: "blocked", expectedDecision: "assign_blocker" },
    { assignmentId: "asg-8611", workerId: "wrk-8611", status: "partial", expectedDecision: "request_rework" },
    { assignmentId: "asg-8612", workerId: "wrk-8612", status: "needs_review", expectedDecision: "assign_review" }
  ];

  for (const c of cases) {
    const taskId = `T-${c.assignmentId}`;
    await seedExecutionTask(workspace, taskId, `Worker task ${c.assignmentId}`);

    const registered = await teamExecutionModule.onCommand(
      {
        name: "register-assignment",
        args: {
          assignmentId: c.assignmentId,
          executionTaskId: taskId,
          supervisorId: "sup-8",
          workerId: c.workerId
        }
      },
      setupCtx
    );
    assert.equal(registered.ok, true);

    const submitted = await teamExecutionModule.onCommand(
      {
        name: "submit-assignment-handoff",
        args: {
          assignmentId: c.assignmentId,
          workerId: c.workerId,
          handoff: {
            schemaVersion: 2,
            assignmentId: c.assignmentId,
            agentId: c.workerId,
            status: c.status,
            summary: `handoff-${c.status}`,
            evidenceRefs: [`artifacts/${c.assignmentId}.txt`],
            nextRecommendedAction: "supersede current assignment"
          },
          expectedPlanningGeneration: registered.data.planningGeneration
        }
      },
      sqliteCtxWithActor(workspace, c.workerId)
    );
    assert.equal(submitted.ok, true);

    const reconcileArgs = {
      assignmentId: c.assignmentId,
      supervisorId: "sup-8",
      expectedPlanningGeneration: submitted.data.planningGeneration
    };
    if (c.status !== "blocked") {
      reconcileArgs.checkpoint = {
        schemaVersion: 1,
        mergedSummary: `supervisor-summary-${c.status}`
      };
    }

    const reconciled = await teamExecutionModule.onCommand(
      {
        name: "reconcile-assignment",
        args: reconcileArgs
      },
      sqliteCtxWithActor(workspace, "sup-8")
    );

    assert.equal(reconciled.ok, true);
    assert.equal(reconciled.data.assignment.status, "reconciled");
    assert.equal(reconciled.data.reconciliation.handoffContext.handoffSchemaVersion, 2);
    assert.equal(reconciled.data.reconciliation.handoffContext.handoffStatus, c.status);
    assert.equal(reconciled.data.reconciliation.suggestedDecision, c.expectedDecision);
    assert.equal(reconciled.data.assignment.reconcileCheckpoint.handoffContext.suggestedDecision, c.expectedDecision);
    assert.ok(reconciled.data.assignment.reconcileCheckpoint.handoffContext.suggestedDecisions.includes("cancel_supersede"));

    if (c.status === "blocked") {
      assert.equal(reconciled.data.reconciliation.checkpointDerivedFromHandoff, true);
      assert.equal(reconciled.data.assignment.reconcileCheckpoint.mergedSummary, "handoff-blocked");
    }
  }
});

test("assignment-reconciliation-preflight classifies clean handoffs without raw diff expansion", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8616", "Worker task 8616", {
    phase: "Phase 130",
    phaseKey: "130",
    acceptanceCriteria: ["Verdict is clean", "Validation command ran"]
  });

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8616",
        executionTaskId: "T8616",
        supervisorId: "sup-16",
        workerId: "wrk-16",
        metadata: {
          schemaVersion: 1,
          agentDefinitionId: "task-worker",
          contextProfileId: "task_worker_context_v1",
          accessProfileId: "task_worker_strict_v1",
          handoffContractId: "implementation_handoff_v2",
          validationCommands: [{ command: "pnpm run build" }],
          ownedPaths: ["src/modules/team-execution/**"],
          forbiddenPaths: ["docs/maintainers/**"],
          requiresApprovalPaths: ["src/contracts/**"]
        }
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const requiredValidationRuns = registered.data.assignment.metadata.validationCommands.map((entry) => ({
    command: entry.command,
    status: "passed"
  }));

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8616",
        workerId: "wrk-16",
        handoff: {
          schemaVersion: 2,
          assignmentId: "asg-8616",
          agentId: "wrk-16",
          status: "completed",
          summary: "Implemented the requested bounded change",
          filesChanged: [{ path: "src/modules/team-execution/index.ts" }],
          commandsRun: requiredValidationRuns,
          acceptanceCriteria: [
            { criterion: "Verdict is clean", status: "passed" },
            { criterion: "Validation command ran", status: "passed" }
          ],
          evidenceRefs: ["artifacts/evidence-8616.txt"]
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-16")
  );
  assert.equal(submitted.ok, true);

  const result = await teamExecutionModule.onCommand(
    {
      name: "assignment-reconciliation-preflight",
      args: {
        assignmentId: "asg-8616",
        supervisorId: "sup-16"
      }
    },
    sqliteCtxWithActor(workspace, "sup-16")
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "assignment-reconciliation-preflight");
  assert.equal(result.data.verdict, "ready_to_reconcile");
  assert.deepEqual(result.data.supportedVerdicts, [
    "ready_to_reconcile",
    "needs_worker_followup",
    "needs_orchestrator_review",
    "needs_user_decision",
    "unsafe"
  ]);
  assert.deepEqual(result.data.compactEvidence.refs, ["artifacts/evidence-8616.txt"]);
  assert.equal(result.data.compactEvidence.fileChangeSummary.total, 1);
  assert.equal(result.data.reconciliation.checkpointDraft.mergedSummary, "Implemented the requested bounded change");
});

test("assignment-reconciliation-preflight represents all non-clean verdicts", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  const cases = [
    {
      assignmentId: "asg-8617",
      workerId: "wrk-8617",
      taskId: "T8617",
      verdict: "needs_worker_followup",
      handoff: {
        schemaVersion: 2,
        assignmentId: "asg-8617",
        agentId: "wrk-8617",
        status: "partial",
        summary: "Partial handoff",
        filesChanged: [{ path: "src/modules/team-execution/index.ts" }],
        commandsRun: [],
        acceptanceCriteria: [{ criterion: "Need evidence", status: "partial" }],
        evidenceRefs: []
      }
    },
    {
      assignmentId: "asg-8618",
      workerId: "wrk-8618",
      taskId: "T8618",
      verdict: "needs_orchestrator_review",
      handoff: {
        schemaVersion: 2,
        assignmentId: "asg-8618",
        agentId: "wrk-8618",
        status: "needs_review",
        summary: "Needs orchestrator review",
        filesChanged: [{ path: "src/modules/team-execution/index.ts" }],
        commandsRun: [{ command: "pnpm run build", status: "passed" }],
        acceptanceCriteria: [{ criterion: "Reviewed", status: "passed" }],
        evidenceRefs: ["artifacts/evidence-8618.txt"],
        risks: [{ risk: "Higher-order review still needed", severity: "medium" }]
      }
    },
    {
      assignmentId: "asg-8619",
      workerId: "wrk-8619",
      taskId: "T8619",
      verdict: "needs_user_decision",
      handoff: {
        schemaVersion: 2,
        assignmentId: "asg-8619",
        agentId: "wrk-8619",
        status: "blocked",
        summary: "Blocked on approval-only path",
        filesChanged: [{ path: "src/contracts/new-contract.ts" }],
        commandsRun: [{ command: "pnpm run build", status: "passed" }],
        acceptanceCriteria: [{ criterion: "Approval path acknowledged", status: "passed" }],
        evidenceRefs: ["artifacts/evidence-8619.txt"],
        blockers: [{ summary: "Needs maintainer decision", severity: "high" }]
      }
    },
    {
      assignmentId: "asg-8620",
      workerId: "wrk-8620",
      taskId: "T8620",
      verdict: "unsafe",
      handoff: {
        schemaVersion: 2,
        assignmentId: "asg-8620",
        agentId: "wrk-8620",
        status: "completed",
        summary: "Touched forbidden files",
        filesChanged: [{ path: "docs/maintainers/unsafe.md" }],
        commandsRun: [{ command: "pnpm run build", status: "passed" }],
        acceptanceCriteria: [{ criterion: "Unsafe path detected", status: "passed" }],
        evidenceRefs: ["artifacts/evidence-8620.txt"]
      }
    }
  ];

  for (const c of cases) {
    await seedExecutionTask(workspace, c.taskId, `Worker task ${c.assignmentId}`, {
      phase: "Phase 130",
      phaseKey: "130",
      acceptanceCriteria: [String(c.handoff.acceptanceCriteria[0].criterion)]
    });

    const registered = await teamExecutionModule.onCommand(
      {
        name: "register-assignment",
        args: {
          assignmentId: c.assignmentId,
          executionTaskId: c.taskId,
          supervisorId: "sup-17",
          workerId: c.workerId,
          metadata: {
            schemaVersion: 1,
            agentDefinitionId: "task-worker",
            contextProfileId: "task_worker_context_v1",
            accessProfileId: "task_worker_strict_v1",
            handoffContractId: "implementation_handoff_v2",
            validationCommands: [{ command: "pnpm run build" }],
            ownedPaths: ["src/modules/team-execution/**"],
            forbiddenPaths: ["docs/maintainers/**"],
            requiresApprovalPaths: ["src/contracts/**"]
          }
        }
      },
      setupCtx
    );
    assert.equal(registered.ok, true);

    const requiredValidationRuns = registered.data.assignment.metadata.validationCommands.map((entry) => ({
      command: entry.command,
      status: "passed"
    }));

    if (c.verdict !== "needs_worker_followup") {
      c.handoff.commandsRun = requiredValidationRuns;
    }

    const submitted = await teamExecutionModule.onCommand(
      {
        name: "submit-assignment-handoff",
        args: {
          assignmentId: c.assignmentId,
          workerId: c.workerId,
          handoff: c.handoff,
          expectedPlanningGeneration: registered.data.planningGeneration
        }
      },
      sqliteCtxWithActor(workspace, c.workerId)
    );
    assert.equal(submitted.ok, true);

    const result = await teamExecutionModule.onCommand(
      {
        name: "assignment-reconciliation-preflight",
        args: {
          assignmentId: c.assignmentId,
          supervisorId: "sup-17"
        }
      },
      sqliteCtxWithActor(workspace, "sup-17")
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.verdict, c.verdict);
  }
});

test("admin actor may execute supervisor lifecycle actions", async () => {
  const workspace = await tmpDir();
  const setupCtx = sqliteCtx(workspace);
  await seedExecutionTask(workspace, "T8605", "Worker task 5");

  const registered = await teamExecutionModule.onCommand(
    {
      name: "register-assignment",
      args: {
        assignmentId: "asg-8605",
        executionTaskId: "T8605",
        supervisorId: "sup-5",
        workerId: "wrk-5"
      }
    },
    setupCtx
  );
  assert.equal(registered.ok, true);

  const submitted = await teamExecutionModule.onCommand(
    {
      name: "submit-assignment-handoff",
      args: {
        assignmentId: "asg-8605",
        workerId: "wrk-5",
        handoff: {
          schemaVersion: 1,
          summary: "Done"
        },
        expectedPlanningGeneration: registered.data.planningGeneration
      }
    },
    sqliteCtxWithActor(workspace, "wrk-5")
  );
  assert.equal(submitted.ok, true);

  const adminCtx = sqliteCtxWithActor(workspace, "admin-1", ["admin-1"]);

  const reconciled = await teamExecutionModule.onCommand(
    {
      name: "reconcile-assignment",
      args: {
        assignmentId: "asg-8605",
        supervisorId: "admin-1",
        checkpoint: {
          schemaVersion: 1,
          mergedSummary: "admin reconciled"
        },
        expectedPlanningGeneration: submitted.data.planningGeneration
      }
    },
    adminCtx
  );
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.data.assignment.status, "reconciled");
});
