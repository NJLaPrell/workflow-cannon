import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTaskIntakePolicyConfig,
  resolveTaskIntakePolicy
} from "../dist/modules/task-engine/task-intake-policy-resolver.js";

test("default task intake policy recommends current task detail fields", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {},
    action: "create-task",
    targetStatus: "proposed",
    fields: { title: "New task", type: "execution", status: "proposed" }
  });
  assert.equal(r.resolvedPolicy.profileName, "advisory");
  assert.deepEqual(r.resolvedPolicy.requiredFields, []);
  assert.deepEqual(r.missingRequiredFields, []);
  assert.deepEqual(r.missingRecommendedFields, ["summary", "technicalScope", "acceptanceCriteria"]);
  assert.equal(r.resolvedPolicy.enforcementMode, "advisory");
});

test("built-in compatibility profile represents improvement task guardrails", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {},
    action: "create-task",
    targetStatus: "proposed",
    fields: { title: "Improve thing", type: "improvement" }
  });
  assert.equal(r.resolvedPolicy.profileName, "improvement");
  assert.deepEqual(r.resolvedPolicy.requiredFields, [
    "technicalScope",
    "acceptanceCriteria",
    "metadata.issue",
    "metadata.supportingReasoning"
  ]);
  assert.deepEqual(r.missingRequiredFields, [
    "technicalScope",
    "acceptanceCriteria",
    "metadata.issue",
    "metadata.supportingReasoning"
  ]);
});

test("module override resolves stricter accept policy and evaluates field rules", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          defaultProfile: "advisory",
          enforcementMode: "advisory",
          profiles: {
            advisory: {
              requiredFields: [],
              recommendedFields: ["summary"],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "advisory"
            },
            "ready-intake": {
              requiredFields: ["title", "metadata.issue", "technicalScope", "acceptanceCriteria"],
              recommendedFields: ["metadata.supportingReasoning"],
              forbiddenFields: ["metadata.rawTranscript"],
              fieldRules: {
                technicalScope: { minItems: 2, itemMinLength: 8 },
                priority: { allowedValues: ["P1", "P2", "P3"] },
                "metadata.issue": { minLength: 12, requiresAny: ["metadata.supportingReasoning", "metadata.evidenceRef"] }
              },
              enforcementMode: "enforce"
            }
          },
          moduleOverrides: {
            improvement: { profile: "ready-intake", enforcementMode: "enforce" }
          }
        }
      }
    },
    action: "accept",
    targetStatus: "ready",
    moduleId: "improvement",
    fields: {
      id: "T1",
      title: "Improve thing",
      type: "improvement",
      priority: "P4",
      technicalScope: ["short"],
      acceptanceCriteria: ["Verified"],
      metadata: { issue: "Too short", rawTranscript: "large paste" }
    }
  });

  assert.equal(r.resolvedPolicy.profileName, "ready-intake");
  assert.equal(r.resolvedPolicy.enforcementMode, "enforce");
  assert.deepEqual(r.missingRequiredFields, []);
  assert.deepEqual(r.missingRecommendedFields, ["metadata.supportingReasoning"]);
  assert.deepEqual(r.forbiddenPresentFields, ["metadata.rawTranscript"]);
  assert.ok(r.fieldRuleViolations.some((v) => v.field === "technicalScope" && v.rule === "minItems"));
  assert.ok(r.fieldRuleViolations.some((v) => v.field === "priority" && v.rule === "allowedValues"));
  assert.ok(r.fieldRuleViolations.some((v) => v.field === "metadata.issue" && v.rule === "minLength"));
  assert.ok(r.fieldRuleViolations.some((v) => v.field === "metadata.issue" && v.rule === "requiresAny"));
  assert.equal(r.resolvedPolicy.context.moduleId, "improvement");
  assert.equal(r.resolvedPolicy.context.targetStatus, "ready");
});

test("task metadata intake profile wins over module override", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce"
            }
          },
          moduleOverrides: { "task-engine": { profile: "advisory" } }
        }
      }
    },
    task: {
      id: "T2",
      status: "proposed",
      type: "execution",
      title: "Task",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: { taskIntakeProfile: "strict" }
    },
    moduleId: "task-engine",
    action: "accept",
    targetStatus: "ready"
  });
  assert.equal(r.resolvedPolicy.profileName, "strict");
  assert.deepEqual(r.missingRequiredFields, ["summary"]);
});

test("context profile names can match action, type, category, and phase", () => {
  const effectiveConfig = {
    tasks: {
      intakePolicy: {
        profiles: {
          advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
          "accept-ready": {
            requiredFields: ["summary"],
            recommendedFields: [],
            forbiddenFields: [],
            fieldRules: {}
          },
          "category-policy": {
            requiredFields: ["metadata.policyArea"],
            recommendedFields: [],
            forbiddenFields: [],
            fieldRules: {}
          },
          "phase-83": {
            requiredFields: ["phaseKey"],
            recommendedFields: [],
            forbiddenFields: [],
            fieldRules: {}
          }
        }
      }
    }
  };

  const actionMatch = resolveTaskIntakePolicy({
    effectiveConfig,
    action: "accept",
    targetStatus: "ready",
    fields: { title: "Task", type: "execution", metadata: { category: "policy" } }
  });
  assert.equal(actionMatch.resolvedPolicy.profileName, "accept-ready");
  assert.deepEqual(actionMatch.missingRequiredFields, ["summary"]);

  const categoryMatch = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
            "category-policy": effectiveConfig.tasks.intakePolicy.profiles["category-policy"]
          }
        }
      }
    },
    action: "create-task",
    category: "policy",
    fields: { title: "Task", type: "execution" }
  });
  assert.equal(categoryMatch.resolvedPolicy.profileName, "category-policy");

  const phaseMatch = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
            "phase-83": effectiveConfig.tasks.intakePolicy.profiles["phase-83"]
          }
        }
      }
    },
    action: "create-task",
    phaseKey: "83",
    fields: { title: "Task", type: "execution" }
  });
  assert.equal(phaseMatch.resolvedPolicy.profileName, "phase-83");
});

test("parseTaskIntakePolicyConfig merges built-in advisory profile", () => {
  const cfg = parseTaskIntakePolicyConfig({});
  assert.ok(cfg.profiles.advisory);
  assert.ok(cfg.profiles.improvement);
  assert.deepEqual(cfg.profiles.advisory.recommendedFields, [
    "title",
    "summary",
    "technicalScope",
    "acceptanceCriteria"
  ]);
});

test("workspace tasks.intakePolicy enforcement off skips field evaluation and warnings", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          enforcementMode: "off",
          defaultProfile: "strict",
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} },
            strict: {
              requiredFields: ["summary"],
              recommendedFields: [],
              forbiddenFields: [],
              fieldRules: {},
              enforcementMode: "enforce"
            }
          }
        }
      }
    },
    fields: { title: "x", type: "execution", status: "ready" },
    action: "create-ready",
    targetStatus: "ready"
  });
  assert.equal(r.resolvedPolicy.enforcementMode, "off");
  assert.deepEqual(r.missingRequiredFields, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.explain, []);
});

test("workspace intake off overrides module override enforcement", () => {
  const r = resolveTaskIntakePolicy({
    effectiveConfig: {
      tasks: {
        intakePolicy: {
          enforcementMode: "off",
          defaultProfile: "advisory",
          profiles: {
            advisory: { requiredFields: [], recommendedFields: [], forbiddenFields: [], fieldRules: {} }
          },
          moduleOverrides: {
            "task-engine": { profile: "advisory", enforcementMode: "enforce" }
          }
        }
      }
    },
    moduleId: "task-engine",
    action: "create-task",
    targetStatus: "ready",
    fields: { title: "t", type: "execution", status: "ready" }
  });
  assert.equal(r.resolvedPolicy.enforcementMode, "off");
});
