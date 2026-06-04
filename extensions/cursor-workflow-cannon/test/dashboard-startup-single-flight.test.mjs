import test from "node:test";
import assert from "node:assert/strict";

import { DashboardStartupSingleFlight } from "../dist/views/dashboard/dashboard-startup-single-flight.js";

test("DashboardStartupSingleFlight coalesces concurrent startup triggers", async () => {
  const singleFlight = new DashboardStartupSingleFlight();
  let calls = 0;
  let reuseCount = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const factory = async () => {
    calls += 1;
    await gate;
  };

  const a = singleFlight.run(factory, () => {
    reuseCount += 1;
  });
  const b = singleFlight.run(factory, () => {
    reuseCount += 1;
  });
  const c = singleFlight.run(factory, () => {
    reuseCount += 1;
  });

  assert.equal(calls, 1);
  assert.equal(reuseCount, 2);
  assert.equal(singleFlight.isInFlight(), true);
  release();
  await Promise.all([a, b, c]);
  assert.equal(singleFlight.isInFlight(), false);
});

test("DashboardStartupSingleFlight clears after rejection", async () => {
  const singleFlight = new DashboardStartupSingleFlight();
  let calls = 0;
  await assert.rejects(
    singleFlight.run(async () => {
      calls += 1;
      throw new Error("boom");
    }),
    /boom/
  );
  await singleFlight.run(async () => {
    calls += 1;
  });
  assert.equal(calls, 2);
});
