import test from "node:test";
import assert from "node:assert/strict";

const mod = await import("../dist/playbook-chat-prompts.js");

test("buildBrainstormSessionPrompt requires interactive operator participation", () => {
  const prompt = mod.buildBrainstormSessionPrompt({
    ideaId: "I005",
    title: "Operator idea",
    note: "Try unified brainstorm",
    sessionIndex: 2,
    planRef: "plan-artifact:f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60"
  });
  assert.match(prompt, /I005/);
  assert.match(prompt, /session index: \*\*2\*\*/i);
  assert.match(prompt, /schemas\/ideas\/states\/brainstorming\.schema\.json/);
  assert.match(prompt, /agentDirective/);
  assert.match(prompt, /Operator idea/);
  assert.match(prompt, /Try unified brainstorm/);
  assert.match(prompt, /\.ai\/playbooks\/brainstorm-session\.md/);
  assert.match(prompt, /interactive brainstorm session/i);
  assert.match(prompt, /Never one-shot the session/i);
  assert.match(prompt, /One move per turn, then wait/i);
  assert.match(prompt, /Propose → ask → persist/i);
  assert.match(prompt, /features and functions/i);
  assert.match(prompt, /Numeric scoring is optional/i);
  assert.match(prompt, /Session completion gate/i);
  assert.match(prompt, /Planning gate/i);
  assert.match(prompt, /completedAt/);
  assert.match(prompt, /update-brainstorm-session/);
  assert.match(prompt, /complete-brainstorm/);
  assert.match(prompt, /operatorConfirmedBrainstormComplete/);
  assert.match(prompt, /continue this session/i);
  assert.match(prompt, /start a new brainstorm session/i);
  assert.match(prompt, /First turn/i);
  assert.match(prompt, /stop and wait/i);
  assert.doesNotMatch(prompt, /agent-led brainstorm session/i);
  assert.doesNotMatch(prompt, /Stop after the session update/);
});
