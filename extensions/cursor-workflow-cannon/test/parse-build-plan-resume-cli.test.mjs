import assert from "node:assert/strict";
import test from "node:test";
import { parseBuildPlanArgsFromResumeCli } from "../dist/parse-build-plan-resume-cli.js";

test("parseBuildPlanArgsFromResumeCli extracts JSON from workspace-kit resume line", () => {
  const line = `workspace-kit run build-plan '{"planningType":"change","answers":{"a":"b"},"finalize":false,"outputMode":"response"}'`;
  const args = parseBuildPlanArgsFromResumeCli(line);
  assert.ok(args);
  assert.equal(args.planningType, "change");
  assert.equal(args.finalize, false);
  assert.equal(args.outputMode, "response");
  assert.deepEqual(args.answers, { a: "b" });
});

test("parseBuildPlanArgsFromResumeCli accepts pnpm-wrapped command", () => {
  const line = `pnpm run wk run build-plan '{"planningType":"new-feature","answers":{},"finalize":false,"outputMode":"wishlist"}'`;
  const args = parseBuildPlanArgsFromResumeCli(line);
  assert.ok(args);
  assert.equal(args.planningType, "new-feature");
});

test("parseBuildPlanArgsFromResumeCli returns null on garbage", () => {
  assert.equal(parseBuildPlanArgsFromResumeCli(""), null);
  assert.equal(parseBuildPlanArgsFromResumeCli("nope"), null);
});
