import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSubstantialBrainstormIdeation,
  mergeBrainstormSessionIdeation,
  parseBrainstormSessionIdeationPatch
} from "../dist/modules/ideas/brainstorm-ideation.js";
import { validateBrainstormSectionForPlanning } from "../dist/modules/ideas/validate-brainstorm-section.js";

test("parseBrainstormSessionIdeationPatch accepts structured ideation arrays", () => {
  const patch = parseBrainstormSessionIdeationPatch({
    featureIdeas: [{ text: "Seed plan from ideation" }],
    perspectives: [{ text: "Operator-first guided chat" }],
    transcript: [{ role: "agent", text: "hello", at: "2026-07-07T00:00:00.000Z" }]
  });
  assert.equal(patch?.featureIdeas?.[0]?.text, "Seed plan from ideation");
  assert.equal(patch?.transcript?.[0]?.role, "agent");
});

test("mergeBrainstormSessionIdeation appends transcript and replaces curated lists", () => {
  const merged = mergeBrainstormSessionIdeation(
    {
      featureIdeas: [{ text: "first" }],
      transcript: [{ role: "agent", text: "turn 1", at: "2026-07-07T00:00:00.000Z" }]
    },
    {
      featureIdeas: [{ text: "second" }],
      transcript: [{ role: "operator", text: "turn 2", at: "2026-07-07T00:01:00.000Z" }]
    }
  );
  assert.equal(merged.featureIdeas?.[0]?.text, "second");
  assert.equal(merged.transcript?.length, 2);
});

test("validateBrainstormSectionForPlanning accepts ideation-rich sessions without full scoring", () => {
  const result = validateBrainstormSectionForPlanning({
    sessions: [
      {
        sessionId: "bsess-1",
        startedAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        ideation: {
          featureIdeas: [{ text: "Feature one" }],
          perspectives: [{ text: "Perspective one" }]
        }
      }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(hasSubstantialBrainstormIdeation({ featureIdeas: [{ text: "a" }], perspectives: [{ text: "b" }] }), true);
});
