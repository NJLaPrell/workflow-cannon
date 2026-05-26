import test from "node:test";
import assert from "node:assert/strict";

import { withPlanningSqliteRecoveryHint } from "../dist/modules/task-engine/planning-sqlite-doctor-remediation.js";

test("withPlanningSqliteRecoveryHint appends backup and readiness commands once", () => {
  const base = "sqlite-open-failed: disk full";
  const once = withPlanningSqliteRecoveryHint(base);
  assert.match(once, /backup-planning-sqlite/);
  assert.match(once, /task-persistence-readiness/);
  assert.equal(withPlanningSqliteRecoveryHint(once), once);
});
