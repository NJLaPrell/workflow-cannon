/**
 * Validates the agent-facing task read contract schema (T991).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/agent-task-read-contract.v1.json");
const schemaId = "https://workflow-cannon.dev/schemas/agent-task-read-contract.v1.json";

function loadSchema() {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(loadSchema());
  return ajv;
}

function compileDef(ajv, defName) {
  return ajv.compile({ $ref: `${schemaId}#/$defs/${defName}` });
}

function sampleTask(overrides = {}) {
  return {
    contractVersion: 1,
    id: "T991",
    title: "Define agent-facing task DB contract",
    status: "ready",
    type: "workspace-kit",
    priority: "P1",
    archived: false,
    createdAt: "2026-04-28T17:47:10.818Z",
    updatedAt: "2026-04-28T17:47:50.629Z",
    phase: {
      phaseKey: "75",
      phase: "Phase 75",
      phaseAligned: true
    },
    routing: {
      ownership: "task-engine",
      queueNamespace: "default",
      features: [],
      source: "chat-schema-agent-db-upgrade-2026-04-28",
      hasModuleMetadata: true
    },
    dependencies: {
      dependsOn: [],
      unblocks: ["T992", "T995"],
      edges: []
    },
    queue: {
      blockedByDependencies: false,
      unmetDependencies: [],
      blockedReason: null
    },
    evidence: {
      delivery: null,
      latestTransition: {
        kind: "transition",
        taskId: "T991",
        id: "T991-2026-04-28T18:05:11.938Z-8d644059",
        timestamp: "2026-04-28T18:05:11.938Z",
        summary: "ready -> in_progress",
        detailCommand: "pnpm exec wk run get-task-history '{\"taskId\":\"T991\"}'"
      },
      latestMutation: null
    },
    ...overrides
  };
}

describe("agent-task-read-contract schema (v1)", () => {
  const ajv = makeAjv();

  it("compiles the top-level contract document", () => {
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, "schema should be registered");
    assert.equal(
      validate({
        schemaVersion: 1,
        models: {
          taskListItem: sampleTask(),
          taskDetail: {
            ...sampleTask(),
            summary: "Stable task read contract",
            description: "Agents consume projections instead of blobs.",
            approach: "Define the contract before storage changes.",
            risk: "High leverage",
            technicalScope: ["inventory read commands"],
            acceptanceCriteria: ["stable empty states"],
            recentEvidence: []
          },
          nextActions: {
            contractVersion: 1,
            readyQueue: [sampleTask()],
            suggestedNext: sampleTask(),
            stateSummary: {
              research: 0,
              proposed: 0,
              ready: 1,
              in_progress: 0,
              blocked: 0,
              completed: 0,
              cancelled: 0,
              total: 1
            },
            blockingAnalysis: []
          },
          readEnvelope: {
            ok: true,
            code: "tasks-listed",
            data: {},
            planningGeneration: 1822,
            planningGenerationPolicy: "require"
          }
        }
      }),
      true,
      ajv.errorsText(validate.errors)
    );
  });

  it("accepts empty/first-run task read shapes with explicit arrays and nulls", () => {
    const validate = compileDef(ajv, "agentTaskNextActions");
    assert.equal(
      validate({
        contractVersion: 1,
        readyQueue: [],
        suggestedNext: null,
        stateSummary: {
          research: 0,
          proposed: 0,
          ready: 0,
          in_progress: 0,
          blocked: 0,
          completed: 0,
          cancelled: 0,
          total: 0
        },
        blockingAnalysis: []
      }),
      true,
      ajv.errorsText(validate.errors)
    );
  });

  it("rejects raw metadata fields on stable task list rows", () => {
    const validate = compileDef(ajv, "agentTaskListItem");
    const row = sampleTask({ metadata: { surprise: "blob spelunking" } });
    assert.equal(validate(row), false);
  });
});
