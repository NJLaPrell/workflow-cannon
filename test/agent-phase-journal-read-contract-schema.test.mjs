/**
 * Validates agent-facing phase journal read contract schema (T100036).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/agent-phase-journal-read-contract.v1.json");
const schemaId = "https://workflow-cannon.dev/schemas/agent-phase-journal-read-contract.v1.json";

function loadSchema() {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(loadSchema());
  return ajv;
}

function samplePhaseNote() {
  return {
    id: "pn-1",
    phaseKey: "78",
    phaseLabel: "Phase 78",
    taskId: null,
    noteType: "follow-up",
    summary: "Ship the schema",
    details: null,
    status: "active",
    priority: "normal",
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    expiresAt: null,
    supersededBy: null,
    convertedTaskId: null,
    idempotencyKey: null,
    refs: [{ type: "task", value: "T100036" }]
  };
}

describe("agent-phase-journal-read-contract schema (v1)", () => {
  const ajv = makeAjv();

  it("compiles the top-level contract document", () => {
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, "schema should be registered");
    assert.equal(
      validate({
        schemaVersion: 1,
        models: {
          phaseNoteProjection: samplePhaseNote(),
          phaseNoteTaskSuggestionProjection: {
            id: "sug-1",
            noteId: "pn-1",
            title: "Add JSON schema",
            description: "CI-guard phase journal projections.",
            suggestedStatus: "proposed",
            suggestedPhaseKey: "78",
            suggestedPhaseLabel: "Phase 78",
            suggestedTaskType: "workspace-kit",
            convertedTaskId: null,
            createdAt: "2026-05-01T12:00:00.000Z",
            updatedAt: "2026-05-01T12:00:00.000Z"
          },
          phaseJournalSnapshot: {
            phaseKey: "78",
            phaseLabel: "Phase 78",
            activeNoteCount: 4,
            criticalCount: 0,
            openFollowUpCount: 2,
            topNotes: [
              { id: "a", noteType: "blocker", priority: "high", summary: "CI" },
              { id: "b", noteType: "finding", priority: "normal", summary: "OK" }
            ]
          },
          nextActionsPhaseContext: {
            phaseKey: "78",
            relevantNotes: [{ id: "n1", noteType: "finding", priority: "low", summary: "x" }],
            taskSuggestionsFromNotes: []
          }
        }
      }),
      true,
      ajv.errorsText(validate.errors)
    );
  });

  it("rejects too many relevantNotes on nextActionsPhaseContext", () => {
    const validate = ajv.compile({ $ref: `${schemaId}#/$defs/agentNextActionsPhaseContext` });
    const notes = Array.from({ length: 9 }, (_, i) => ({
      id: `n${i}`,
      noteType: "finding",
      priority: "normal",
      summary: "s"
    }));
    assert.equal(
      validate({
        phaseKey: "78",
        relevantNotes: notes,
        taskSuggestionsFromNotes: []
      }),
      false
    );
  });

  it("rejects extra properties on phase note projection", () => {
    const validate = ajv.compile({ $ref: `${schemaId}#/$defs/agentPhaseNoteProjection` });
    assert.equal(validate({ ...samplePhaseNote(), rawRow: true }), false);
  });
});
