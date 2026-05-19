/**
 * Validates agent phase focus dashboard contract schema (T100333).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/agent-phase-focus-dashboard-contract.v1.json");
const schemaId = "https://workflow-cannon.dev/schemas/agent-phase-focus-dashboard-contract.v1.json";

function loadSchema() {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(loadSchema());
  return ajv;
}

function samplePhaseFocus() {
  return {
    schemaVersion: 1,
    phaseKey: "100",
    generatedAt: "2026-05-18T12:00:00.000Z",
    canonicalPhase: {
      canonicalPhaseKey: "100",
      phaseSource: "workspace-status",
      currentKitPhase: "100",
      nextKitPhase: "101",
      configMatchesWorkspaceStatus: true
    },
    queue: { ready: 2, proposed: 1, blocked: 0, inProgress: 0, research: 0 },
    delivery: {
      closeoutPassed: false,
      remainingCount: 3,
      progressPercent: 40,
      releaseReadyPercent: 25
    },
    readyTop: [
      { id: "T10001", title: "One", status: "ready", priority: "P1" },
      { id: "T10002", title: "Two", status: "ready", priority: "P2" }
    ],
    blockedTop: [],
    phaseJournal: {
      available: true,
      activeNoteCount: 2,
      criticalCount: 0,
      silenceWarning: false
    },
    evidenceGaps: {
      violationCount: 1,
      top: [
        {
          taskId: "T10003",
          code: "delivery-evidence-missing",
          message: "Missing mergeSha",
          missingFields: ["mergeSha"]
        }
      ]
    }
  };
}

describe("agent-phase-focus-dashboard-contract schema (v1)", () => {
  const ajv = makeAjv();

  it("compiles and validates a sample phase focus dashboard", () => {
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, "schema should be registered");
    assert.equal(validate(samplePhaseFocus()), true, ajv.errorsText(validate.errors));
  });

  it("rejects too many readyTop rows", () => {
    const validate = ajv.getSchema(schemaId);
    const payload = samplePhaseFocus();
    payload.readyTop = Array.from({ length: 16 }, (_, i) => ({
      id: `T${i}`,
      title: "x",
      status: "ready",
      priority: null
    }));
    assert.equal(validate(payload), false);
  });

  it("rejects extra properties on ready row", () => {
    const validate = ajv.compile({ $ref: `${schemaId}#/$defs/agentPhaseFocusReadyRow` });
    assert.equal(
      validate({ id: "T1", title: "t", status: "ready", priority: null, extra: true }),
      false
    );
  });
});
