import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts"),
  "utf8"
);

test("T100497: refresh defers when coordinator mutation active", () => {
  assert.match(providerSrc, /isMutationActive\(\)/);
  assert.match(providerSrc, /dashboardRefreshBusy/);
  assert.match(providerSrc, /setDashboardRefreshBusy/);
});

test("T100497: drawer-submit UI locks removed from drawer refresh hold", () => {
  const holdBlock = providerSrc.slice(
    providerSrc.indexOf("beginDrawerSubmitRefreshHold"),
    providerSrc.indexOf("private isPushUpdateStale")
  );
  assert.doesNotMatch(holdBlock, /setDashboardUiInteraction\("drawer-submit"/);
  assert.doesNotMatch(holdBlock, /setDashboardUiInteraction\("drawer-busy"/);
});
