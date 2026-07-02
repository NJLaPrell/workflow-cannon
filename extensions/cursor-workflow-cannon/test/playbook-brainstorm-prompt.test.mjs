import test from "node:test";
import assert from "node:assert/strict";

const mod = await import("../dist/playbook-chat-prompts.js");

test("buildBrainstormSessionPrompt includes ideaId, sessionIndex, and schema load instruction", () => {
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
});
