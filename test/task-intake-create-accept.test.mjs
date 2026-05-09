import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCreateIntakeKind,
  evaluateIntakeForAccept,
  evaluateIntakeForCreate,
  shouldBlockTaskIntake
} from "../dist/modules/task-engine/task-intake-mutation-policy.js";

test("shouldBlockTaskIntake respects mode and mutation kind", () => {
  assert.equal(shouldBlockTaskIntake("off", "create-ready", true), false);
  assert.equal(shouldBlockTaskIntake("advisory", "accept-to-ready", true), false);
  assert.equal(shouldBlockTaskIntake("enforce-on-accept", "create-ready", true), false);
  assert.equal(shouldBlockTaskIntake("enforce-on-accept", "accept-to-ready", true), true);
  assert.equal(shouldBlockTaskIntake("enforce", "create-proposed", true), false);
  assert.equal(shouldBlockTaskIntake("enforce", "create-ready", true), true);
  assert.equal(shouldBlockTaskIntake("enforce", "accept-to-ready", true), true);
});

test("classifyCreateIntakeKind maps statuses", () => {
  assert.equal(classifyCreateIntakeKind("proposed"), "create-proposed");
  assert.equal(classifyCreateIntakeKind("ready"), "create-ready");
  assert.equal(classifyCreateIntakeKind("research"), "create-research");
});

test("evaluateIntakeForCreate blocks create-ready under enforce when required field missing", () => {
  const r = evaluateIntakeForCreate({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          defaultProfile: "strict",
          enforcementMode: "advisory",
          profiles: {
            advisory: {
              requiredFields: [],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "advisory"
            },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce"
            }
          },
          moduleOverrides: {}
        }
      }
    },
    task: {
      id: "T900",
      title: "Only title",
      type: "execution",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.ok(r.block);
  assert.equal(r.block.code, "task-intake-blocked");
});

test("evaluateIntakeForCreate allows proposed under enforce when required field missing", () => {
  const r = evaluateIntakeForCreate({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          defaultProfile: "strict",
          enforcementMode: "advisory",
          profiles: {
            advisory: {
              requiredFields: [],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "advisory"
            },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce"
            }
          },
          moduleOverrides: {}
        }
      }
    },
    task: {
      id: "T901",
      title: "Only title",
      type: "execution",
      status: "proposed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.equal(r.block, null);
});

test("evaluateIntakeForAccept blocks accept under enforce-on-accept when incomplete", () => {
  const r = evaluateIntakeForAccept({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          defaultProfile: "strict",
          enforcementMode: "advisory",
          profiles: {
            advisory: {
              requiredFields: [],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "advisory"
            },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce-on-accept"
            }
          },
          moduleOverrides: {}
        }
      }
    },
    task: {
      id: "T902",
      title: "No summary",
      type: "execution",
      status: "proposed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.equal(r.block, true);
});

test("evaluateIntakeForAccept does not block accept under enforce-on-accept when satisfied", () => {
  const r = evaluateIntakeForAccept({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          defaultProfile: "strict",
          enforcementMode: "advisory",
          profiles: {
            advisory: {
              requiredFields: [],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "advisory"
            },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce-on-accept"
            }
          },
          moduleOverrides: {}
        }
      }
    },
    task: {
      id: "T903",
      title: "Titled",
      type: "execution",
      status: "proposed",
      summary: "Has summary",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.equal(r.block, false);
});

test("evaluateIntakeForCreate emits no advisory strings when workspace intake is off", () => {
  const r = evaluateIntakeForCreate({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          enforcementMode: "off",
          defaultProfile: "strict",
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: ["technicalScope"],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce"
            }
          }
        }
      }
    },
    task: {
      id: "T910",
      title: "No summary",
      type: "execution",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.equal(r.block, null);
  assert.deepEqual(r.stringWarnings, []);
  assert.equal(r.intakePayload.enforcementMode, "off");
});
