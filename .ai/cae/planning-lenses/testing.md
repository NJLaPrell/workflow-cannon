# Planning lens: testing

**Activate when:** `testingStrategy` section is authored or reviewed; before E2E investment (**A-TEST**).

## Intent

Align plan claims with test layers that will actually run in CI.

## Agent checklist

- `testingStrategy.layers` lists concrete layers: `unit`, `integration`, `extension`, `e2e-cli` as applicable.
- `criticalPaths` name behaviors, not file names only.
- Each WBS row `testingVerification` matches at least one critical path or layer.
- Fixture strategy references `fixtures/planning/` and schema tests where relevant.
- Blocked-path cases listed for review command codes (`plan-artifact-not-accepted`, etc.).

## Prompts

- What proves draft/review/accept/finalize without hand-editing the task store?
- Which tests are out of scope for this phase?
- Does extension UI require render tests or manual A-E2E only?

## Reference

- `PLANNER_TEST_STRATEGY.md` for golden/blocked paths.
