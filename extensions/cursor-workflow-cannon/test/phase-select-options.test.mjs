import assert from "node:assert/strict";
import test from "node:test";

test("phase select: labels and descending sort", async () => {
  const mod = await import("../dist/views/phase-select-options.js");
  assert.equal(mod.formatPhaseSelectLabel("108"), "Phase 108");
  assert.equal(mod.formatPhaseSelectLabel("91", "Ship gates"), "Phase 91 - Ship gates");
  assert.equal(mod.formatPhaseSelectLabel("91", "  "), "Phase 91");
  const sorted = mod.sortPhaseKeySuggestions([
    mod.buildPhaseKeySuggestion("91", "A"),
    mod.buildPhaseKeySuggestion("108"),
    mod.buildPhaseKeySuggestion("100", "B")
  ]);
  assert.deepEqual(
    sorted.map((s) => s.phaseKey),
    ["108", "100", "91"]
  );
  assert.equal(sorted[0].label, "Phase 108");
  assert.equal(sorted[1].label, "Phase 100 - B");
});
