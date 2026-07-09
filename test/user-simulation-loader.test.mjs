import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPersona,
  listPersonaIds,
  loadAllPersonas
} from "./harness/user-simulation/lib/load-persona.mjs";
import {
  loadScenario,
  listScenarioIds,
  loadAllScenarios
} from "./harness/user-simulation/lib/load-scenario.mjs";

test("persona loader validates schema for all bundled personas", () => {
  const ids = listPersonaIds();
  assert.deepEqual(ids.sort(), ["expert-engineer", "pm-nontechnical"]);

  for (const persona of loadAllPersonas()) {
    assert.ok(persona.goals.length > 0, `${persona.id}: goals`);
    assert.ok(persona.behaviorProfile.length > 0, `${persona.id}: behaviorProfile`);
    assert.ok(persona.likelyConfusions?.length > 0, `${persona.id}: likelyConfusions`);
    assert.ok(persona.successCriteria.length > 0, `${persona.id}: successCriteria`);
  }
});

test("persona loader rejects id/filename mismatch", () => {
  assert.throws(() => loadPersona("missing-persona"), /ENOENT|Cannot find/);
});

test("scenario loader validates schema for all bundled scenarios", () => {
  const ids = listScenarioIds().sort();
  assert.deepEqual(ids, [
    "complete-release-active-work",
    "complete-release-completed-only",
    "complete-release-empty-phase"
  ]);

  for (const scenario of loadAllScenarios()) {
    assert.ok(scenario.fixture?.expectedVerdict, `${scenario.id}: state verdict`);
    assert.ok(scenario.efficiency?.avoidBroadCommands?.length >= 0, `${scenario.id}: efficiency`);
    assert.ok(scenario.personaIds.length > 0, `${scenario.id}: personaIds for UX evaluators`);
  }
});

test("scenario loader rejects id/filename mismatch", () => {
  assert.throws(() => loadScenario("missing-scenario"), /ENOENT|Cannot find/);
});
