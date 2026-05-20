import test from "node:test";
import assert from "node:assert/strict";

import {
  formatConfigMutationError,
  handleConfigMutationResult,
  renderConfigRestartBannerHtml
} from "../dist/views/config/config-mutation-result.js";

const row = {
  key: "kit.cae.enforcement.enabled",
  type: "boolean",
  description: "CAE enforcement",
  default: false,
  domainScope: "project",
  owningModule: "kit",
  exposure: "public",
  sensitive: false,
  requiresApproval: false,
  requiresRestart: true,
  writableLayers: ["project"],
  effectiveValue: false
};

test("formatConfigMutationError surfaces policy approval guidance", () => {
  const msg = formatConfigMutationError("policy-denied: missing approval", 1);
  assert.match(msg, /POLICY-APPROVAL/);
  assert.match(msg, /WORKSPACE_KIT_POLICY_APPROVAL/);
});

test("handleConfigMutationResult success without restart refreshes only", () => {
  const out = handleConfigMutationResult(
    { ...row, requiresRestart: false },
    { code: 0, stdout: "ok", stderr: "" },
    "set"
  );
  assert.equal(out.statusKind, "ok");
  assert.equal(out.restartHint, undefined);
});

test("handleConfigMutationResult success with requiresRestart adds hint", () => {
  const out = handleConfigMutationResult(row, { code: 0, stdout: "ok", stderr: "" }, "set");
  assert.equal(out.statusKind, "ok");
  assert.equal(out.restartHint?.key, row.key);
  assert.match(out.statusText, /reload/i);
});

test("handleConfigMutationResult failure uses policy formatter", () => {
  const out = handleConfigMutationResult(row, { code: 1, stdout: "policy-denied", stderr: "" }, "set");
  assert.equal(out.statusKind, "err");
  assert.match(out.statusText, /policy/i);
});

test("renderConfigRestartBannerHtml includes reload action", () => {
  const html = renderConfigRestartBannerHtml("kit.agentRole");
  assert.match(html, /cfg-restart-banner/);
  assert.match(html, /config-reload-window/);
  assert.match(html, /kit\.agentRole/);
  assert.doesNotMatch(html, /<script>/i);
});
