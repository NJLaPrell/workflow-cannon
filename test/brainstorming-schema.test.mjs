import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  BRAINSTORM_SCORING_SUB_INPUT_FIELDS,
  computeBrainstormSessionScores,
  computeConfidenceScore,
  computeEffortScore,
  computePriorityScore,
  computeRiskScore,
  computeValueScore,
  synthesizeBrainstormScores
} from "../dist/modules/ideas/brainstorm-scoring.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas", "ideas", "states", "brainstorming.schema.json");
const sessionSchemaPath = path.join(root, "schemas", "ideas", "brainstorm-session.schema.json");
const fixturePath = path.join(root, "fixtures", "ideas", "brainstorming-session.fixture.json");

function loadValidators() {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const sessionSchema = JSON.parse(fs.readFileSync(sessionSchemaPath, "utf8"));
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  ajv.addSchema(sessionSchema);
  ajv.addSchema(schema);
  const validateDocument = ajv.getSchema(schema.$id);
  const validateSession = ajv.getSchema(sessionSchema.$id);
  assert.ok(validateDocument, "brainstorming state schema should register");
  assert.ok(validateSession, "brainstorm session schema should register");
  return { schema, validateDocument, validateSession };
}

const { schema, validateDocument, validateSession } = loadValidators();

test("brainstorming session fixture validates against session record schema", () => {
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(validateSession(session), true, ajvErrors(validateSession));
});

test("canonical agentDirective includes all 13 scoring sub-input questions", () => {
  const directive = schema.$defs.canonicalAgentDirective;
  const scoringQuestions = directive.questions.filter((question) =>
    ["value-scoring", "risk-scoring", "effort-scoring", "confidence-scoring"].includes(question.phase)
  );
  assert.equal(scoringQuestions.length, 13);
  for (const fieldName of BRAINSTORM_SCORING_SUB_INPUT_FIELDS) {
    assert.ok(
      scoringQuestions.some((question) => question.fieldName === fieldName),
      `missing scoring question for ${fieldName}`
    );
  }
});

test("canonical agentDirective question phases are ordered", () => {
  const expectedOrder = [
    "ideation-feature",
    "ideation-perspective",
    "ideation-expectation",
    "checkpoint",
    "context",
    "value-scoring",
    "risk-scoring",
    "effort-scoring",
    "confidence-scoring",
    "unknowns",
    "alternatives",
    "session-notes"
  ];
  const phases = schema.$defs.canonicalAgentDirective.questions.map((question) => question.phase);
  let lastIndex = -1;
  for (const phase of phases) {
    const index = expectedOrder.indexOf(phase);
    assert.ok(index >= lastIndex, `phase ${phase} is out of order`);
    lastIndex = index;
  }
});

test("brainstorming state schema documents brainstorming to planning transitions", () => {
  assert.deepEqual(schema["x-validTransitions"], ["brainstorming", "planning"]);
});

test("brainstorming state schema distinguishes session completion from planning transition", () => {
  assert.match(schema.description, /Session completion is not lifecycle completion/);
  assert.match(schema["x-sessionMutability"].description, /Setting completedAt finishes the guided session only/);
  const sessionNotes = schema.$defs.canonicalAgentDirective.questions.find(
    (question) => question.fieldName === "sessionNotes"
  );
  assert.ok(sessionNotes, "sessionNotes directive question should exist");
  assert.match(sessionNotes.guidance, /do not transition to planning unless the operator explicitly confirms/);
});

test("scoring formulas produce correct outputs for known inputs", () => {
  const inputs = {
    valueImpact: 8,
    valueReach: 7,
    valueUrgency: 6,
    valueStrategicFit: 9,
    riskTechnical: 5,
    riskOperational: 4,
    riskUnknowns: 6,
    riskReversibility: 3,
    tShirtSize: "M",
    complexity: 9,
    confidenceEvidence: 7,
    confidenceExpertise: 8,
    confidenceClarity: 6
  };

  const valueScore = round3(computeValueScore(inputs));
  const riskScore = round3(computeRiskScore(inputs));
  const effortScore = round3(computeEffortScore(inputs));
  const confidenceScore = round3(computeConfidenceScore(inputs));
  const priorityScore = round3(computePriorityScore({ valueScore, riskScore, effortScore, confidenceScore }));

  assert.equal(valueScore, 7.6);
  assert.equal(riskScore, 4.7);
  assert.equal(effortScore, 7.8);
  assert.equal(confidenceScore, 6.95);
  assert.equal(priorityScore, 61);

  const highComplexityMedium = computeEffortScore({ tShirtSize: "M", complexity: 9 });
  const lowComplexityLarge = computeEffortScore({ tShirtSize: "L", complexity: 2 });
  assert.ok(highComplexityMedium > lowComplexityLarge, "high-complexity M should outscore low-complexity L");

  const computed = computeBrainstormSessionScores(inputs);
  assert.equal(computed.value, 7.6);
  assert.equal(computed.risk, 4.7);
  assert.equal(computed.effort, 7.8);
  assert.equal(computed.confidence, 6.95);
  assert.equal(computed.priority, 61);
});

test("N=1 synthesis returns session scores directly", () => {
  const sessions = [
    {
      sessionId: "one",
      startedAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:30:00.000Z",
      scores: { value: 7.6, risk: 4.7, effort: 7.8, confidence: 6.95 }
    }
  ];
  const synthesized = synthesizeBrainstormScores(sessions);
  assert.deepEqual(synthesized, { value: 7.6, risk: 4.7, effort: 7.8, confidence: 6.95 });
});

test("N=2 synthesis applies 60/40 weighting", () => {
  const sessions = [
    {
      sessionId: "first",
      startedAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:30:00.000Z",
      scores: { value: 7, risk: 5, effort: 6, confidence: 7 }
    },
    {
      sessionId: "second",
      startedAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:30:00.000Z",
      scores: { value: 9, risk: 4, effort: 8, confidence: 8 }
    }
  ];
  const synthesized = synthesizeBrainstormScores(sessions);
  assert.deepEqual(synthesized, {
    value: 8.2,
    risk: 4.4,
    effort: 7.2,
    confidence: 7.6
  });
});

test("sample brainstorming document validates with required brainstorm section and no plan section", () => {
  const directive = structuredClone(schema.$defs.canonicalAgentDirective);
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 1,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "brainstorming",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T10:45:00.000Z",
    brainstorm: {
      sessions: [session],
      activeSessionId: session.sessionId
    },
    agentDirective: directive
  };
  assert.equal(validateDocument(document), true, ajvErrors(validateDocument));

  const withPlan = { ...document, plan: { title: "should fail" } };
  assert.equal(validateDocument(withPlan), false);
});

function ajvErrors(validateFn) {
  return validateFn.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ");
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
