/**
 * Structural markdown validation for workspace CAE artifacts (T100093 / test matrix).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkspaceArtifactMarkdown } from "../dist/core/cae/workspace-artifact-markdown-validate.js";

test("validateWorkspaceArtifactMarkdown accepts minimal H1 + title", () => {
  const r = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "# Hello\n\nBody.\n",
    title: "Hello"
  });
  assert.equal(r.ok, true);
});

test("validateWorkspaceArtifactMarkdown rejects empty body", () => {
  const r = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "   \n",
    title: "T"
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-workspace-artifact-markdown-empty");
});

test("validateWorkspaceArtifactMarkdown rejects missing H1", () => {
  const r = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "No heading here.\n",
    title: "T"
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-workspace-artifact-markdown-heading");
});

test("validateWorkspaceArtifactMarkdown accepts ATX H1 without space after hash (regex branch)", () => {
  const r = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "#Hello\n",
    title: "Hello"
  });
  assert.equal(r.ok, true);
});

test("validateWorkspaceArtifactMarkdown requires ## fragment section when fragment set", () => {
  const bad = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "# T\n\n## Other\n",
    title: "T",
    fragment: "expected"
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "cae-workspace-artifact-markdown-fragment");

  const good = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "# T\n\n## expected\n\nok\n",
    title: "T",
    fragment: "expected"
  });
  assert.equal(good.ok, true);
});

test("validateWorkspaceArtifactMarkdown rejects empty title", () => {
  const r = validateWorkspaceArtifactMarkdown({
    contentMarkdown: "# Hi\n",
    title: "  "
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-workspace-artifact-markdown-title");
});
