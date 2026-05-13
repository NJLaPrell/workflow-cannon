import test from "node:test";
import assert from "node:assert/strict";
import { buildLeaseUiState, leaseActionLabel } from "../dist/lease-status-ui.js";

test("buildLeaseUiState renders free lease actions", () => {
  const ui = buildLeaseUiState({ leaseStatus: { state: "lease-free", active: false, staleOrInvalid: false, holder: null } });
  assert.equal(ui.kind, "free");
  assert.match(ui.statusBarText, /lease free/);
  assert.deepEqual(ui.actions, ["claim", "inspect"]);
});

test("buildLeaseUiState renders held-by-me lease actions", () => {
  const ui = buildLeaseUiState({
    leaseStatus: {
      state: "lease-held-by-me",
      active: true,
      holder: { agentSessionId: "sess-a", taskId: "T1" }
    }
  });
  assert.equal(ui.kind, "held-by-me");
  assert.match(ui.tooltip, /T1 by sess-a/);
  assert.deepEqual(ui.actions, ["release", "inspect"]);
});

test("buildLeaseUiState renders held-by-other as inspect-only", () => {
  const ui = buildLeaseUiState({
    leaseStatus: {
      state: "lease-held-by-other",
      active: true,
      holder: { agentSessionId: "sess-b", taskId: null }
    }
  });
  assert.equal(ui.kind, "held-by-other");
  assert.deepEqual(ui.actions, ["inspect"]);
});

test("buildLeaseUiState renders stale and suspect recovery states", () => {
  const stale = buildLeaseUiState({ leaseStatus: { state: "stale-invalid", staleOrInvalid: true } });
  assert.equal(stale.kind, "stale");
  assert.deepEqual(stale.actions, ["recover", "inspect"]);

  const suspect = buildLeaseUiState({
    leaseStatus: { state: "lease-held-by-me", active: true },
    suspectFlags: ["lease:branch_drift"]
  });
  assert.equal(suspect.kind, "suspect");
  assert.deepEqual(suspect.actions, ["inspect", "release", "recover"]);
});

test("leaseActionLabel names supported actions", () => {
  assert.equal(leaseActionLabel("claim"), "Claim workspace edit lease");
  assert.equal(leaseActionLabel("release"), "Release my workspace edit lease");
  assert.equal(leaseActionLabel("recover"), "Recover stale workspace edit lease");
  assert.equal(leaseActionLabel("inspect"), "Inspect workspace edit lease");
});
