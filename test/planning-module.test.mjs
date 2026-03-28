import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule } from "../dist/modules/planning/index.js";
import { TaskStore } from "../dist/modules/task-engine/store.js";
import { WishlistStore } from "../dist/modules/task-engine/wishlist-store.js";

async function tmpDir(prefix = "planning-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("planningModule list-planning-types returns typed workflow descriptors", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "list-planning-types", args: {} },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-types-listed");
  assert.equal(result.data.responseSchemaVersion, 1);
  assert.ok(Array.isArray(result.data.planningTypes));
  assert.ok(result.data.planningTypes.some((x) => x.type === "new-feature"));
});

test("planningModule build-plan validates planningType and returns scaffold", async () => {
  const workspace = await tmpDir();
  const invalid = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "unknown" } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-planning-type");

  const valid = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "task-breakdown" } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.code, "planning-questions");
  assert.equal(valid.data.responseSchemaVersion, 1);
  assert.equal(valid.data.planningType, "task-breakdown");
  assert.ok(Array.isArray(valid.data.unresolvedCritical));
  assert.ok(valid.data.unresolvedCritical.length > 0);
  assert.equal(typeof valid.data.cliGuidance?.completionPct, "number");
  assert.equal(typeof valid.data.cliGuidance?.suggestedNextCommand, "string");
});

test("planningModule build-plan validates outputMode", async () => {
  const workspace = await tmpDir();
  const invalid = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "new-feature", outputMode: "invalid" } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-planning-output-mode");
});

test("planningModule build-plan hard-blocks finalize when critical unknowns remain", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "build-plan", args: { planningType: "new-feature", finalize: true, answers: {} } },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "planning-critical-unknowns");
});

test("planningModule build-plan returns ready when critical answers are present", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        answers: {
          featureGoal: "Deliver a planning dashboard",
          placement: "CLI command",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        },
        finalize: true,
        createWishlist: false
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-wishlist-ready");
  assert.equal(result.data.cliGuidance.completionPct, 100);
});

test("planningModule build-plan supports response output mode with deterministic branch", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        outputMode: "response",
        answers: {
          featureGoal: "Deliver a planning dashboard",
          placement: "CLI command",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        },
        finalize: true
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-response-ready");
  assert.equal(result.data.outputMode, "response");
});

test("planningModule build-plan supports tasks output mode branch", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        outputMode: "tasks",
        answers: {
          featureGoal: "Deliver a planning dashboard",
          placement: "CLI command",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        },
        finalize: true
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-task-output-preview");
  assert.equal(result.data.outputMode, "tasks");
  assert.equal(result.data.persistTasks, false);
  assert.ok(Array.isArray(result.data.taskOutputs));
  assert.equal(result.data.taskOutputs.length, 1);
  assert.equal(typeof result.data.provenance.planRef, "string");
});

test("planningModule build-plan can persist tasks in tasks output mode", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        outputMode: "tasks",
        persistTasks: true,
        taskPhase: "Phase 18 - Module platform and state consolidation",
        answers: {
          featureGoal: "Deliver task output mode",
          placement: "CLI command",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators",
          successSignals: "Task output persists"
        },
        finalize: true
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-task-output-created");
  const outputTaskId = result.data.taskOutputs[0].id;
  const taskStore = TaskStore.forJsonFile(workspace);
  await taskStore.load();
  const created = taskStore.getTask(outputTaskId);
  assert.ok(created);
  assert.equal(created?.metadata?.planRef !== undefined, true);
});

test("planningModule build-plan emits deterministic scoring hints when context is available", async () => {
  const workspace = await tmpDir();
  const args = {
    planningType: "task-ordering",
    outputMode: "response",
    finalize: true,
    answers: {
      goal: "Optimize ordering",
      dependencyIntent: "T1 before T2",
      riskPriority: "high integration risk",
      complexity: "high"
    }
  };
  const first = await planningModule.onCommand(
    { name: "build-plan", args },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  const second = await planningModule.onCommand(
    { name: "build-plan", args },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.data.scoringHints, second.data.scoringHints);
  assert.ok(["balanced", "dependency-first", "risk-first"].includes(first.data.scoringHints.ordering.recommendedStrategy));
});

test("planningModule build-plan can allow warnings when hard block disabled", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: { planningType: "new-feature", finalize: true, answers: {} }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        planning: {
          hardBlockCriticalUnknowns: false
        }
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-ready-with-warnings");
});

test("planningModule build-plan blocks finalize when adaptive policy is block", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        outputMode: "response",
        finalize: true,
        answers: {
          featureGoal: "Guide operators through planning interviews",
          placement: "CLI",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        planning: {
          adaptiveFinalizePolicy: "block"
        }
      }
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "planning-adaptive-unknowns");
  assert.ok(Array.isArray(result.data.unresolvedAdaptive));
});

test("planningModule build-plan warns on unresolved adaptive follow-ups in warn mode", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        outputMode: "response",
        finalize: true,
        answers: {
          featureGoal: "Guide operators through planning interviews",
          placement: "CLI",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators"
        }
      }
    },
    {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        planning: {
          adaptiveFinalizePolicy: "warn"
        }
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-response-ready");
  assert.ok(Array.isArray(result.data.adaptiveWarnings));
  assert.ok(result.data.adaptiveWarnings.length > 0);
});

test("planningModule explain-planning-rules returns effective defaults and questions", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "explain-planning-rules", args: { planningType: "new-feature" } },
    {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        planning: {
          defaultQuestionDepth: "guided"
        }
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-rules-explained");
  assert.equal(result.data.responseSchemaVersion, 1);
  assert.equal(result.data.defaultQuestionDepth, "guided");
  assert.equal(result.data.adaptiveFinalizePolicy, "off");
  assert.ok(Array.isArray(result.data.baseQuestions));
});

test("planningModule build-plan finalize can persist wishlist artifact", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    {
      name: "build-plan",
      args: {
        planningType: "new-feature",
        finalize: true,
        answers: {
          featureGoal: "Guide operators through planning interviews",
          placement: "CLI",
          technology: "TypeScript",
          targetAudience: "AI Agent Operators",
          constraints: "Single-release scope",
          successSignals: "Wishlist artifact generated",
          problemStatement: "Planning quality is inconsistent",
          expectedOutcome: "Consistent high-quality planning artifact",
          impact: "Higher confidence delivery"
        }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-artifact-created");
  assert.equal(result.data.wishlistId, "W1");

  const wishlistStore = WishlistStore.forJsonFile(workspace);
  await wishlistStore.load();
  const created = wishlistStore.getItem("W1");
  assert.ok(created);
  assert.equal(created?.title.includes("plan artifact"), true);
});
