#!/usr/bin/env node
import { resolveRegistryAndConfig } from "../dist/core/module-registry-resolve.js";
import { defaultRegistryModules } from "../dist/modules/index.js";
import { openPlanningStoresForTaskStateCache } from "../dist/modules/task-engine/persistence/task-state-cache-runtime-shared.js";
import { commitCanonicalPlanningEvents } from "../dist/modules/task-engine/persistence/planning-canonical-mutation-hook.js";
import { draftPlanningPhaseDeliveryHistoryUpsertedEvent } from "../dist/modules/task-engine/persistence/planning-event-draft.js";

const repoRoot = new URL("..", import.meta.url).pathname;

async function main() {
  console.log("Resolving registry and config...");
  const { registry, effective } = await resolveRegistryAndConfig(repoRoot, defaultRegistryModules);

  const ctx = {
    runtimeVersion: "0.99.28",
    workspacePath: repoRoot,
    effectiveConfig: effective
  };

  console.log("Opening planning stores...");
  const planning = await openPlanningStoresForTaskStateCache(ctx);

  const deliveredPhaseKeys = [
    // 75-89
    "75", "76", "77", "78", "79", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89",
    // 90-108 except 109
    "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "100", "101", "102", "103", "104", "105", "106", "107", "108",
    // 110-116
    "110", "111", "112", "113", "114", "115", "116",
    // 118-131 (109, 117, 132 intentionally omitted — future roster phases)
    "118", "119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", "130", "131",
    // 135-136 (133-134 not in catalog)
    "135", "136"
  ];

  console.log(`Drafting upsert events for ${deliveredPhaseKeys.length} delivered phases...`);
  const nowIso = new Date().toISOString();
  const events = deliveredPhaseKeys.map((pk) => {
    return draftPlanningPhaseDeliveryHistoryUpsertedEvent({
      row: {
        phaseKey: pk,
        status: "delivered",
        deliveredAt: nowIso,
        releaseVersion: null,
        gitTag: null,
        githubReleaseUrl: null,
        npmPackage: null,
        npmDistTag: null,
        releaseWorkflowUrl: null,
        mainCommitSha: null,
        releaseBranch: null,
        releasePrUrl: null,
        evidence: {},
        createdAt: nowIso,
        updatedAt: nowIso
      },
      ctx: {
        commandName: "seed-delivered-phases",
        moduleId: "task-engine"
      }
    });
  });

  console.log("Committing canonical events...");
  const res = await commitCanonicalPlanningEvents({
    ctx,
    store: planning.taskStore,
    planning,
    events,
    policyApproval: {
      confirmed: true,
      rationale: "Seed historical delivered phases to clean up phase roster display"
    }
  });

  console.log("Done!", res);
}

main().catch((e) => {
  console.error("Failed to seed delivered phases:", e);
  process.exit(1);
});
