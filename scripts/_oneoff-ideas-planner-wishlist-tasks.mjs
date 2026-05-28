#!/usr/bin/env node
/**
 * One-off: materialize the approved "Ideas + Planner-as-Wizard + Wishlist Removal" plan
 * into Phase 116 (A+B) and Phase 117 (C) as proposed tasks.
 *
 * Usage: node scripts/_oneoff-ideas-planner-wishlist-tasks.mjs
 */

import { spawnSync } from "node:child_process";

const ACTOR = "planner-chat-wizard";
const RUN_PREFIX = ["pnpm", "exec", "wk", "run"];

function runJson(cmd, payload) {
  const res = spawnSync(RUN_PREFIX[0], [...RUN_PREFIX.slice(1), cmd, JSON.stringify(payload)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (res.error) throw res.error;
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    console.error("Non-JSON stdout:", res.stdout);
    console.error("stderr:", res.stderr);
    throw e;
  }
}

function currentPlanningGeneration() {
  const out = runJson("list-phase-catalog", {});
  // planningGeneration is at top-level data.planningGeneration sometimes; fallback via dashboard
  if (out?.data?.planningGeneration) return out.data.planningGeneration;
  const ds = runJson("dashboard-summary", {});
  return ds.data.planningGeneration;
}

const phase116Label = "Phase 116 - Ideas Module + Planner-as-Wizard";
const phase117Label = "Phase 117 - Wishlist Removal";

/** @type {Array<{key:string,title:string,phaseKey:"116"|"117",approach:string}>} */
const TASKS = [
  // ---- Milestone A (Phase 116) ----
  { key: "A1",  phaseKey: "116", title: "Ideas module: scaffold table, schema, registry", approach: "Create src/modules/ideas with SQLite table workflow_ideas (id I###, title, note, status, sortOrder, createdAt, updatedAt, linkedPlanArtifact, previousPlanArtifacts). Register module in src/core/module-registry.ts. Add schemas/idea.schema.json." },
  { key: "A2",  phaseKey: "116", title: "Ideas: create-idea + get-idea + unit tests", approach: "Implement create-idea (title required, note optional, status open) and get-idea verbs with full unit coverage." },
  { key: "A3",  phaseKey: "116", title: "Ideas: list/update/delete/reorder verbs + tests", approach: "Implement list-ideas (sortOrder-respecting), update-idea, delete-idea (hard), reorder-ideas. Round-trip integration test through SQLite." },
  { key: "A5",  phaseKey: "116", title: "dashboard-summary emits ideas slice", approach: "Add slice:'ideas' to dashboard-summary projection; eager refresh policy." },
  { key: "A6",  phaseKey: "116", title: "Register ideas dashboard section + invalidation", approach: "Add 'ideas' to DASHBOARD_SECTION_REGISTRY (tabId overview, eager, ttl 45s). Update dashboard-section-invalidation for idea mutations. Update render-dashboard-shell to render Overview as ordered stack with ideas second from top." },
  { key: "A7",  phaseKey: "116", title: "Webview Ideas card: render + inline create", approach: "Compact card UI: list (title + truncated note + drag handle); inline + New idea form (title required, optional note)." },
  { key: "A8",  phaseKey: "116", title: "Webview: inline edit + hard-delete + undo toast", approach: "Inline edit per row; hard delete with ~10s undo toast that restores the row." },
  { key: "A9",  phaseKey: "116", title: "Webview: drag-to-reorder wired to reorder-ideas", approach: "Drag handle persists order via reorder-ideas verb (A3); reload preserves order." },
  { key: "A10", phaseKey: "116", title: "Plan this button stub on Ideas card", approach: "Render '▶ Plan this' on each idea row; no-op until B6 wires Composer." },
  { key: "A11", phaseKey: "116", title: "Milestone A pre-merge gates", approach: "Run pnpm run build && check && test && pre-merge-gates; address findings." },

  { key: "B1",  phaseKey: "116", title: "Spike: register dummy playbook via CAE end-to-end", approach: "Validate cae-list-artifacts / register / activate path with a throwaway playbook to de-risk policy approval surface before B3 begins." },
  { key: "B2",  phaseKey: "116", title: "Plan artifact schema: sourceIdeaId + previousPlanArtifacts[]", approach: "Add provenance.sourceIdeaId (string) and provenance.previousPlanArtifacts[] (string[]) to schemas/planning/* and TypeScript types." },
  { key: "B2a", phaseKey: "116", title: "Unit test: draft-plan-artifact round-trips new provenance fields", approach: "Cover draft-plan-artifact path for both new fields; assert persistence + read parity. Dependency for B8." },
  { key: "B3",  phaseKey: "116", title: "Author .ai/playbooks/planner-chat.md to spec", approach: "Operating principles, turn-by-turn loop, error recovery, tone. Per locked spec from planning session." },
  { key: "B4",  phaseKey: "116", title: "Register planner-chat playbook as CAE artifact", approach: "Use CAE registration path (artifactType 'playbook'); verify via cae-list-artifacts." },
  { key: "B5",  phaseKey: "116", title: "buildPlannerChatPrompt + playbook-chat-prompts wiring", approach: "Add extensions/cursor-workflow-cannon/src/planner-chat-prompt.ts mirroring wishlist-chat-prompt shape (will outlive wishlist deletion). Register in playbook-chat-prompts.ts." },
  { key: "B6",  phaseKey: "116", title: "Wire Plan this -> Composer; status open->planning", approach: "▶ Plan this opens Composer with planner-chat prompt + ideaId; update idea status open->planning atomically." },
  { key: "B7",  phaseKey: "116", title: "Persist planning-chat session row; Resume button", approach: "Write planning-chat row to workspace_module_state on start; button label flips to 'Resume planning →' when active row exists for that ideaId." },
  { key: "B8",  phaseKey: "116", title: "Wire draft->review->accept->phase->convert against real CLIs", approach: "Connect wizard to draft-plan-artifact, review-plan-artifact, accept-plan-artifact, finalize-plan-to-phase. Phase question defaults from dashboard-summary." },
  { key: "B9",  phaseKey: "116", title: "E2E happy-path test (zero-CLI-prompt assertion)", approach: "End-to-end test: create-idea through finalize-plan-to-phase. Assert the user-facing prompt log contains zero CLI invocations surfaced to user." },
  { key: "B10", phaseKey: "116", title: "E2E rejection-and-resume tests", approach: "Cover review-rejection (idea stays planning) and resume-from-session-row (mid-wizard reload)." },
  { key: "B11", phaseKey: "116", title: "Milestone B pre-merge gates", approach: "Run full validation suite; phase-116 closeout readiness." },

  // ---- Milestone C (Phase 117) ----
  { key: "C1", phaseKey: "117", title: "Extract allocateNextNumericId to id-allocation module", approach: "Move from src/modules/task-engine/wishlist/wishlist-intake.ts to src/modules/task-engine/id-allocation.ts as generic allocateNextNumericId(prefix, table). Update improvement/generate-recommendations-runtime.ts import; Ideas module also switches to use it." },
  { key: "C2", phaseKey: "117", title: "Migration: clear stale planning-build-session rows", approach: "Clear workspace_module_state rows whose payload contains \"outputMode\":\"wishlist\" or createWishlist, so post-C resume cannot hit removed enum values." },
  { key: "C3", phaseKey: "117", title: "Migration: drop wishlist_intake table and rows", approach: "Drop wishlist_intake table after C2; Phase 100 data is intentionally not migrated per locked decision." },
  { key: "C4", phaseKey: "117", title: "Planner: repoint outputMode default; remove createWishlist", approach: "Change build-plan default outputMode away from 'wishlist'; remove createWishlist flag; repoint or remove planning-wishlist-ready / planning-artifact-created codes." },
  { key: "C5", phaseKey: "117", title: "Remove *-wishlist CLI verbs + wishlist module dir", approach: "Delete create-wishlist, list-wishlist, get-wishlist, convert-wishlist, import-wishlist registrations and src/modules/task-engine/wishlist/." },
  { key: "C6", phaseKey: "117", title: "Delete wishlist playbooks, prompts, .cursor rules", approach: "Remove .ai/playbooks/wishlist-intake-to-execution.md, extensions/cursor-workflow-cannon/src/wishlist-chat-prompt.ts, .cursor/rules/playbook-wishlist-intake-to-execution.mdc and any references." },
  { key: "C7", phaseKey: "117", title: "Purge wishlist refs from docs/schemas/AGENT-CLI-MAP", approach: "Sweep README, PLANNER_COMMANDS.md, phase-complete-release-prompt.ts, docs/maintainers/runbooks/wishlist-workflow.md, .ai/AGENT-CLI-MAP.md, agent-doc-routing, task-engine-state.schema.json enum, planning schemas." },
  { key: "C8", phaseKey: "117", title: "CHANGELOG entry + major version bump", approach: "Breaking change notice: wishlist removed, data discarded; recommend DB backup before upgrade; replaced by Ideas module + planner-chat wizard." },
  { key: "C9", phaseKey: "117", title: "Phase 117 pre-merge gates", approach: "Full validation; release-evidence + phase-closeout-readiness." }
];

async function main() {
  console.log(`Creating ${TASKS.length} proposed tasks (${TASKS.filter(t => t.phaseKey === "116").length} in Phase 116, ${TASKS.filter(t => t.phaseKey === "117").length} in Phase 117)…`);

  const gen = currentPlanningGeneration();
  console.log(`Planning generation: ${gen}`);

  const ops = TASKS.map((t) => ({
    kind: "create-task",
    payload: {
      allocateId: true,
      title: t.title,
      status: "proposed",
      type: "execution",
      phase: t.phaseKey === "116" ? phase116Label : phase117Label,
      phaseKey: t.phaseKey,
      approach: t.approach,
      metadata: {
        planSourceKey: t.key,
        planSource: "planner-chat-bootstrap-2026-05-27"
      },
      clientMutationId: `ideas-planner-wishlist-${t.key}-v1`
    }
  }));

  const result = runJson("apply-task-batch", {
    ops,
    actor: ACTOR,
    expectedPlanningGeneration: gen
  });

  if (!result.ok) {
    console.error("apply-task-batch failed:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("ok:", result.ok, "code:", result.code);
  const results = result?.data?.results ?? result?.data?.opResults ?? [];
  for (const [i, r] of results.entries()) {
    const t = TASKS[i];
    const id = r?.task?.id ?? r?.id ?? r?.data?.task?.id ?? "?";
    console.log(`  ${t.key.padEnd(4)} -> ${id}  ${t.title.slice(0, 70)}`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
