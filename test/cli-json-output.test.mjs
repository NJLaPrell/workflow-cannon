import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikePackageManagerBanner,
  parseWorkspaceKitJsonStdout
} from "../dist/index.js";

test("parseWorkspaceKitJsonStdout parses pretty-printed JSON as one value", () => {
  const parsed = parseWorkspaceKitJsonStdout(`{
  "ok": true,
  "code": "task-retrieved",
  "data": {
    "taskId": "T975"
  }
}
`);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.ok, true);
  assert.equal(parsed.payload.data.taskId, "T975");
});

test("parseWorkspaceKitJsonStdout diagnoses pnpm run banner contamination", () => {
  const stdout = `> @workflow-cannon/workspace-kit@0.73.0 wk /repo
> node dist/cli.js run list-tasks '{}'

{
  "ok": true,
  "code": "tasks-listed"
}
`;
  const parsed = parseWorkspaceKitJsonStdout(stdout, { exitCode: 0 });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "workspace-kit-json-stdout-parse-failed");
  assert.equal(parsed.details.suspectedPackageManagerBanner, true);
  assert.match(parsed.message, /pnpm exec wk|banner-free|package-manager/i);
  assert.ok(parsed.remediation.cleanInvocations.includes("pnpm exec wk run <command> '<json>'"));
});

test("looksLikePackageManagerBanner ignores clean JSON", () => {
  assert.equal(looksLikePackageManagerBanner('{"ok":true}'), false);
});
