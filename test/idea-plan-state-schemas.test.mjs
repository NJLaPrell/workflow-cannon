import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  IDEA_PLAN_STATUSES,
  IDEA_PLAN_STATUS_TRANSITIONS
} from "../dist/modules/ideas/idea-plan-types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statesDir = path.join(root, "schemas", "ideas", "states");
const sessionSchemaPath = path.join(root, "schemas", "ideas", "brainstorm-session.schema.json");
const fixturePath = path.join(root, "fixtures", "ideas", "brainstorming-session.fixture.json");

const STATE_SCHEMA_FILES = [
  "idea.schema.json",
  "brainstorming.schema.json",
  "planning.schema.json",
  "reviewed.schema.json",
  "accepted.schema.json",
  "delivered.schema.json"
];

function loadStateSchemas() {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const sessionSchema = JSON.parse(fs.readFileSync(sessionSchemaPath, "utf8"));
  ajv.addSchema(sessionSchema);

  const schemas = new Map();
  const validators = new Map();

  for (const fileName of STATE_SCHEMA_FILES) {
    const filePath = path.join(statesDir, fileName);
    assert.ok(fs.existsSync(filePath), `${fileName} should exist`);
    const schema = JSON.parse(fs.readFileSync(filePath, "utf8"));
    ajv.addSchema(schema);
    const state = schema.properties.status.const;
    schemas.set(state, schema);
    validators.set(state, ajv.getSchema(schema.$id));
  }

  return { schemas, validators, sessionSchema };
}

const { schemas, validators } = loadStateSchemas();

test("all six IdeaPlan state schema files parse as valid JSON Schema", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    const validator = validators.get(status);
    assert.ok(validator, `validator for ${status} should register`);
    assert.equal(schemas.get(status).properties.status.const, status);
  }
});

test("x-validTransitions align with IDEA_PLAN_STATUS_TRANSITIONS", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    const schema = schemas.get(status);
    assert.deepEqual(
      schema["x-validTransitions"],
      [...IDEA_PLAN_STATUS_TRANSITIONS[status]],
      `transitions for ${status}`
    );
  }
});

test("forward-only transition spine is acyclic and reaches delivered", () => {
  const forwardSpine = {
    idea: "brainstorming",
    brainstorming: "planning",
    planning: "reviewed",
    reviewed: "accepted",
    accepted: "delivered",
    delivered: null
  };

  const visited = new Set();
  let state = "idea";
  while (state) {
    assert.ok(!visited.has(state), `forward spine cycle at ${state}`);
    visited.add(state);
    state = forwardSpine[state];
  }
  assert.equal(visited.size, IDEA_PLAN_STATUSES.length);
});

test("reviewed may return to planning for revision without blocking forward acceptance", () => {
  assert.ok(IDEA_PLAN_STATUS_TRANSITIONS.reviewed.includes("planning"));
  assert.ok(IDEA_PLAN_STATUS_TRANSITIONS.reviewed.includes("accepted"));
});

test("forward lifecycle chain is reachable: idea through delivered", () => {
  const chain = ["idea", "brainstorming", "planning", "reviewed", "accepted", "delivered"];
  for (let index = 0; index < chain.length - 1; index += 1) {
    const from = chain[index];
    const to = chain[index + 1];
    assert.ok(
      IDEA_PLAN_STATUS_TRANSITIONS[from].includes(to),
      `${from} should transition to ${to}`
    );
  }
});

test("non-brainstorming state schemas do not define scoring computeSteps", () => {
  for (const status of ["idea", "planning", "reviewed", "accepted", "delivered"]) {
    const schema = schemas.get(status);
    const directive = schema.$defs?.canonicalAgentDirective;
    assert.ok(directive, `${status} should define canonicalAgentDirective`);
    assert.equal(directive.computeSteps, undefined, `${status} must not define computeSteps`);
    assert.equal(directive.synthesisStep, undefined, `${status} must not define synthesisStep`);
  }
});

test("each state schema agentDirective state const matches document status", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    const schema = schemas.get(status);
    const directiveState = schema.$defs.agentDirective.properties.state.const;
    const canonicalState = schema.$defs.canonicalAgentDirective.state;
    assert.equal(directiveState, status);
    assert.equal(canonicalState, status);
  }
});

test("idea state document validates without progressive sections", () => {
  const schema = schemas.get("idea");
  const validate = validators.get("idea");
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 1,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "idea",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
    agentDirective: structuredClone(schema.$defs.canonicalAgentDirective)
  };
  assert.equal(validate(document), true, ajvErrors(validate));
});

test("planning state document validates with brainstorm and plan sections", () => {
  const schema = schemas.get("planning");
  const validate = validators.get("planning");
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 2,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "planning",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T11:00:00.000Z",
    brainstorm: { sessions: [session], activeSessionId: session.sessionId },
    plan: {
      title: "Unified IdeaPlan lifecycle",
      summary: "Author structured plan sections from brainstorm synthesis.",
      wbsRowCount: 0
    },
    agentDirective: structuredClone(schema.$defs.canonicalAgentDirective)
  };
  assert.equal(validate(document), true, ajvErrors(validate));
});

test("reviewed state document validates with review section", () => {
  const schema = schemas.get("reviewed");
  const validate = validators.get("reviewed");
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 3,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "reviewed",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T12:00:00.000Z",
    brainstorm: { sessions: [session] },
    plan: { title: "Unified IdeaPlan lifecycle", summary: "Structured plan.", wbsRowCount: 5 },
    review: {
      passed: true,
      blockerCount: 0,
      openQuestionCount: 1,
      warningCount: 2,
      reviewedAt: "2026-07-02T12:00:00.000Z"
    },
    agentDirective: structuredClone(schema.$defs.canonicalAgentDirective)
  };
  assert.equal(validate(document), true, ajvErrors(validate));
});

test("accepted state document validates with acceptance section", () => {
  const schema = schemas.get("accepted");
  const validate = validators.get("accepted");
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 3,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "accepted",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T13:00:00.000Z",
    brainstorm: { sessions: [session] },
    plan: { title: "Unified IdeaPlan lifecycle", summary: "Structured plan.", wbsRowCount: 5 },
    review: { passed: true, reviewedAt: "2026-07-02T12:00:00.000Z" },
    acceptance: {
      acceptedAt: "2026-07-02T13:00:00.000Z",
      acceptedBy: "operator@example.com",
      acceptedVersion: 3
    },
    agentDirective: structuredClone(schema.$defs.canonicalAgentDirective)
  };
  assert.equal(validate(document), true, ajvErrors(validate));
});

test("delivered state document validates with delivery section", () => {
  const schema = schemas.get("delivered");
  const validate = validators.get("delivered");
  const session = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const document = {
    schemaVersion: 1,
    planId: "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    version: 3,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60",
    status: "delivered",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T14:00:00.000Z",
    brainstorm: { sessions: [session] },
    plan: { title: "Unified IdeaPlan lifecycle", summary: "Structured plan.", wbsRowCount: 5 },
    review: { passed: true, reviewedAt: "2026-07-02T12:00:00.000Z" },
    acceptance: {
      acceptedAt: "2026-07-02T13:00:00.000Z",
      acceptedBy: "operator@example.com",
      acceptedVersion: 3
    },
    delivery: {
      deliveredAt: "2026-07-02T14:00:00.000Z",
      taskCount: 5,
      phaseKey: "140"
    },
    agentDirective: structuredClone(schema.$defs.canonicalAgentDirective)
  };
  assert.equal(validate(document), true, ajvErrors(validate));
});

function ajvErrors(validateFn) {
  return validateFn.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ");
}
