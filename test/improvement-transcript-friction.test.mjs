import test from "node:test";
import assert from "node:assert/strict";

import { analyzeCursorTranscriptLine } from "../dist/index.js";

test("transcript friction: user error line admits", () => {
  const line = JSON.stringify({ role: "user", text: "This is broken again error" });
  const a = analyzeCursorTranscriptLine(line);
  assert.ok(a.score >= 0.35);
  assert.equal(a.role, "user");
});

test("transcript friction: assistant success summary skips", () => {
  const line = JSON.stringify({
    role: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: "Here's what landed:\n\n### Move\n- All docs updated; no invalid paths remain."
        }
      ]
    }
  });
  const a = analyzeCursorTranscriptLine(line);
  assert.equal(a.score, 0);
  assert.equal(a.skipReason, "assistant-success-summary");
});

test("transcript friction: assistant with strong signal still scores", () => {
  const line = JSON.stringify({
    role: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: "pnpm failed with exit code 1 and ELIFECYCLE — policy denied doc.generate-document"
        }
      ]
    }
  });
  const a = analyzeCursorTranscriptLine(line);
  assert.ok(a.score >= 0.35);
});
