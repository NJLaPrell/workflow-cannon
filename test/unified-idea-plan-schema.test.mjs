import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { IDEA_PLAN_STATUSES } from "../dist/modules/ideas/idea-plan-types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ideasDir = path.join(root, "schemas", "ideas");
const statesDir = path.join(ideasDir, "states");
const fixturesDir = path.join(root, "fixtures", "ideas");

const UNIFIED_SCHEMA_PATH = path.join(ideasDir, "unified-idea-plan.schema.json");
const SESSION_SCHEMA_PATH = path.join(ideasDir, "brainstorm-session.schema.json");

const PROGRESSIVE_FIXTURES = [
  { file: "idea-state.fixture.json", status: "idea", hasBrainstorm: false, hasPlan: false },
  { file: "brainstorming-state.fixture.json", status: "brainstorming", hasBrainstorm: true, hasPlan: false },
  { file: "planning-state.fixture.json", status: "planning", hasBrainstorm: true, hasPlan: true },
  { file: "accepted-state.fixture.json", status: "accepted", hasBrainstorm: true, hasPlan: true }
];

const STATE_SCHEMA_FILES = [
  "idea.schema.json",
  "brainstorming.schema.json",
  "planning.schema.json",
  "reviewed.schema.json",
  "accepted.schema.json",
  "delivered.schema.json"
];

function loadValidators() {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });

  const sessionSchema = JSON.parse(fs.readFileSync(SESSION_SCHEMA_PATH, "utf8"));
  ajv.addSchema(sessionSchema);

  for (const fileName of STATE_SCHEMA_FILES) {
    const schema = JSON.parse(fs.readFileSync(path.join(statesDir, fileName), "utf8"));
    ajv.addSchema(schema);
  }

  const unifiedSchema = JSON.parse(fs.readFileSync(UNIFIED_SCHEMA_PATH, "utf8"));
  ajv.addSchema(unifiedSchema);

  const validateUnified = ajv.getSchema(unifiedSchema.$id);
  const validateSession = ajv.getSchema(sessionSchema.$id);
  const stateValidators = new Map();

  for (const status of IDEA_PLAN_STATUSES) {
    const fileName = `${status}.schema.json`;
    const schema = JSON.parse(fs.readFileSync(path.join(statesDir, fileName), "utf8"));
    stateValidators.set(status, ajv.getSchema(schema.$id));
  }

  assert.ok(validateUnified, "unified envelope schema should register");
  assert.ok(validateSession, "brainstorm session schema should register");

  return { validateUnified, validateSession, stateValidators };
}

const { validateUnified, validateSession, stateValidators } = loadValidators();

function loadFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, fileName), "utf8"));
}

function ajvErrors(validateFn) {
  return validateFn.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ");
}

test("unified-idea-plan.schema.json oneOf covers all six IdeaPlan statuses", () => {
  const unifiedSchema = JSON.parse(fs.readFileSync(UNIFIED_SCHEMA_PATH, "utf8"));
  assert.equal(unifiedSchema.oneOf.length, IDEA_PLAN_STATUSES.length);
  for (const status of IDEA_PLAN_STATUSES) {
    const ref = `https://workflow-cannon.dev/schemas/ideas/states/${status}.schema.json`;
    assert.ok(
      unifiedSchema.oneOf.some((entry) => entry.$ref === ref),
      `unified schema should reference ${status} state schema`
    );
  }
});

for (const { file, status, hasBrainstorm, hasPlan } of PROGRESSIVE_FIXTURES) {
  test(`${file} validates against unified-idea-plan.schema.json`, () => {
    const fixture = loadFixture(file);
    assert.equal(fixture.status, status);
    assert.equal(validateUnified(fixture), true, ajvErrors(validateUnified));
    assert.equal(stateValidators.get(status)(fixture), true, ajvErrors(stateValidators.get(status)));
    assert.equal(Boolean(fixture.brainstorm), hasBrainstorm, `${file} brainstorm presence`);
    assert.equal(Boolean(fixture.plan), hasPlan, `${file} plan presence`);
  });
}

test("progressive fixtures reject future sections leaking into earlier states", () => {
  const ideaFixture = loadFixture("idea-state.fixture.json");
  const brainstormingFixture = loadFixture("brainstorming-state.fixture.json");

  const ideaWithBrainstorm = {
    ...ideaFixture,
    brainstorm: { sessions: [{ sessionId: "x", startedAt: ideaFixture.createdAt, updatedAt: ideaFixture.updatedAt }] }
  };
  assert.equal(validateUnified(ideaWithBrainstorm), false, "idea state must reject brainstorm section");

  const brainstormingWithPlan = {
    ...brainstormingFixture,
    plan: { title: "future plan", summary: "should fail" }
  };
  assert.equal(validateUnified(brainstormingWithPlan), false, "brainstorming state must reject plan section");
});

test("fixtures with brainstorm sessions validate session records against brainstorm-session.schema.json", () => {
  for (const { file, hasBrainstorm } of PROGRESSIVE_FIXTURES) {
    if (!hasBrainstorm) {
      continue;
    }
    const fixture = loadFixture(file);
    for (const session of fixture.brainstorm.sessions) {
      assert.equal(validateSession(session), true, `${file} session ${session.sessionId}: ${ajvErrors(validateSession)}`);
    }
  }
});

test("completed session fixture includes all 13 sub-inputs and five computed scores", () => {
  const session = JSON.parse(fs.readFileSync(path.join(fixturesDir, "brainstorming-session.fixture.json"), "utf8"));
  assert.equal(validateSession(session), true, ajvErrors(validateSession));

  const subInputs = [
    "valueImpact",
    "valueReach",
    "valueUrgency",
    "valueStrategicFit",
    "riskTechnical",
    "riskOperational",
    "riskUnknowns",
    "riskReversibility",
    "tShirtSize",
    "complexity",
    "confidenceEvidence",
    "confidenceExpertise",
    "confidenceClarity"
  ];
  for (const field of subInputs) {
    assert.ok(session.inputs?.[field] !== undefined, `missing sub-input ${field}`);
  }

  for (const scoreField of ["value", "risk", "effort", "confidence", "priority"]) {
    assert.ok(typeof session.scores?.[scoreField] === "number", `missing computed score ${scoreField}`);
  }
});
