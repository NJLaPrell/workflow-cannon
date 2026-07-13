import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBrainstormDigest,
  buildPlanSeedFromBrainstorm,
  collectBrainstormIdeation
} from "../dist/modules/planning/brainstorm/brainstorm-plan-seed.js";

test("collectBrainstormIdeation merges ideation across sessions", () => {
  const collected = collectBrainstormIdeation({
    sessions: [
      {
        sessionId: "a",
        startedAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        ideation: {
          featureIdeas: [{ text: "Seed plan from ideation" }]
        },
        inputs: { contextProblem: "Brainstorming is a survey today" }
      },
      {
        sessionId: "b",
        startedAt: "2026-07-07T01:00:00.000Z",
        updatedAt: "2026-07-07T01:00:00.000Z",
        ideation: {
          perspectives: [{ text: "Split scoring from ideation" }]
        }
      }
    ]
  });
  assert.equal(collected.featureIdeas.length, 1);
  assert.equal(collected.perspectives.length, 1);
  assert.equal(collected.contextProblem, "Brainstorming is a survey today");
});

test("buildPlanSeedFromBrainstorm maps ideation into planning payload", () => {
  const seed = buildPlanSeedFromBrainstorm({
    title: "Guided brainstorming",
    brainstorm: {
      sessions: [
        {
          sessionId: "a",
          startedAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
          ideation: {
            featureIdeas: [{ text: "Structured ideation fields", rationale: "Persist agent proposals" }],
            openThreads: [{ text: "How much transcript to keep?" }]
          },
          inputs: { contextProblem: "Survey-only brainstorm" }
        }
      ]
    }
  });
  assert.match(seed.planSummary, /Guided brainstorming/);
  assert.match(seed.planSummary, /Structured ideation fields/);
  assert.deepEqual(seed.planningPayload.goals, ["Structured ideation fields"]);
  assert.deepEqual(seed.planningPayload.openQuestions, ["How much transcript to keep?"]);
  assert.equal(seed.planningPayload.userStories?.[0]?.iWant, "Structured ideation fields");
});

test("buildBrainstormDigest returns undefined when no content exists", () => {
  assert.equal(buildBrainstormDigest({ sessions: [{ sessionId: "a", startedAt: "t", updatedAt: "t" }] }), undefined);
});
