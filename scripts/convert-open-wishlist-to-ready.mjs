#!/usr/bin/env node
/**
 * For each open PLAN wishlist intake (excludes T470 test seed):
 * 1) update-wishlist — enrich expectedOutcome with implementation plan
 * 2) convert-wishlist — single workspace-kit task (proposed)
 * 3) run-transition accept — ready (policy-gated)
 *
 * Usage: pnpm run build && node scripts/convert-open-wishlist-to-ready.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");
const PHASE = "Phase 35 — PLAN backlog execution (wishlist conversion)";
const PHASE_KEY = "35";

const POLICY = {
  policyApproval: {
    confirmed: true,
    rationale: "Accept converted PLAN wishlist tasks to ready after plan vetting (bulk conversion script)"
  }
};

function run(sub, payload) {
  const out = execFileSync(process.execPath, [CLI, "run", sub, JSON.stringify(payload)], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const j = JSON.parse(out);
  if (!j.ok) {
    console.error(sub, payload, j);
    throw new Error(j.message || j.code || "CLI failed");
  }
  return j;
}

/** @type {{ wishlistTaskId: string; newTaskId: string; title: string; priority: string; expectedOutcome: string; approach: string; technicalScope: string[]; acceptanceCriteria: string[] }[]} */
const PLANS = [
  {
    wishlistTaskId: "T471",
    newTaskId: "T507",
    title: "Merge ≠ done guardian — Git vs task-engine desync signal",
    priority: "P1",
    expectedOutcome:
      "Deliver a maintainer-local (default) command that compares likely shipped Git state to task-engine rows and emits actionable JSON + short human summary. Optional org-hosted extension documented as sample only. Document false-positive bounds and keep heuristics conservative.",
    approach:
      "Problem: merged PRs without run-transition complete and idle in_progress tasks cause silent drift. Plan: (1) Define signals: default branch tip vs last transition timestamp, in_progress staleness, optional tag mapping. (2) Implement read-only CLI subcommand or script under scripts/ invoking task store + simple git exec (no GitHub API in core). (3) Add runbook section + fixture repo test. (4) Pilot with this repo; tune thresholds. Out of scope v1: auto-fixing task state.",
    technicalScope: [
      "src/cli or scripts: new read-only entry (kit-owned or maintainer script)",
      "Task store read APIs; no policy-sensitive mutations in guardian path",
      "docs/maintainers/runbook + AGENT-CLI-MAP row when stable",
      "tests: synthetic git + sqlite/json fixture"
    ],
    acceptanceCriteria: [
      "One documented invocation produces JSON schemaVersion + summary text on clean clone",
      "False-positive expectations documented; no network required for default path",
      "pnpm test / check green; no default write to task store"
    ]
  },
  {
    wishlistTaskId: "T472",
    newTaskId: "T508",
    title: "Evidence bundle exporter — audit / postmortem zip",
    priority: "P2",
    expectedOutcome:
      "Versioned command produces a manifest + allowlisted files (policy traces, transition excerpts, config snapshots, parity logs) with size caps and redaction hooks. Schema documented for consumers.",
    approach:
      "Plan: (1) Specify manifest JSON schema + max bytes / file counts. (2) Implement collector walking allowlisted paths under .workspace-kit and docs evidence dirs. (3) Redaction: strip or deny known secret patterns by default. (4) Zip or tar to artifacts/ with runId. (5) Maintainer doc + dry-run mode.",
    technicalScope: [
      "New module command or scripts/* with tests",
      "Manifest schema under schemas/ if persisted",
      "docs/maintainers/RELEASING or security runbook cross-link"
    ],
    acceptanceCriteria: [
      "Dry-run lists files without writing archive",
      "Apply mode produces zip + manifest; tests cover cap and redaction",
      "No secrets in default fixture output"
    ]
  },
  {
    wishlistTaskId: "T473",
    newTaskId: "T509",
    title: "Policy rehearsal mode — dry-run sensitive commands",
    priority: "P2",
    expectedOutcome:
      "Documented parity rules between dry-run and live for at least one sensitive command class; CI asserts trace shape without mutating workspace.",
    approach:
      "Plan: (1) Pick pilot command (e.g. generate-recommendations or ingest with dry flag). (2) Thread dryRun through router outcome without persistence side effects. (3) Emit stable policy trace shape comparable to live. (4) ADR + integration test. Defer full matrix to follow-up tasks.",
    technicalScope: [
      "src/cli/run-command.ts / module handlers",
      "test/*.test.mjs integration",
      "docs/maintainers ADR or DECISIONS entry"
    ],
    acceptanceCriteria: [
      "Pilot command documents dry vs live semantics",
      "CI test proves trace fields stable in dry mode",
      "POLICY-APPROVAL.md cross-link updated"
    ]
  },
  {
    wishlistTaskId: "T474",
    newTaskId: "T510",
    title: "Task time travel replay — read-only queue forensics",
    priority: "P2",
    expectedOutcome:
      "Read-only replay of get-next-actions / queue-health from exported snapshot id or tagged export-on-commit file, with explicit version mismatch warnings.",
    approach:
      "Plan: (1) Define snapshot input format (reuse unified export if present). (2) Implement replay command that loads frozen task list into ephemeral read model. (3) Document caveats when mixing snapshot with new code. (4) Example: answer one historical queue question from v0.x tag.",
    technicalScope: [
      "Task engine read path + snapshot loader",
      "docs/maintainers/runbooks",
      "tests with small frozen JSON"
    ],
    acceptanceCriteria: [
      "Replay command returns deterministic JSON for fixture snapshot",
      "Docs warn on code/snapshot skew",
      "No writes to live store during replay"
    ]
  },
  {
    wishlistTaskId: "T475",
    newTaskId: "T511",
    title: "Dependency graph / critical path — Cursor extension thin client",
    priority: "P2",
    expectedOutcome:
      "Extension view lists unblockers or compact graph from existing dashboard-summary / get-dependency-graph JSON without new backend truth.",
    approach:
      "Plan: (1) Reuse workspace-kit JSON commands from extension host. (2) Render list or Mermaid-lite graph with perf budget for N-task fixture. (3) Degrade gracefully for large queues. (4) Document a11y limits.",
    technicalScope: [
      "extensions/cursor-workflow-cannon",
      "No new persistence in core",
      "docs/e2e.md update"
    ],
    acceptanceCriteria: [
      "Loads from real dashboard-summary-shaped payload in tests",
      "Perf note documented for N>50 tasks",
      "ext:compile + root tests green"
    ]
  },
  {
    wishlistTaskId: "T476",
    newTaskId: "T512",
    title: "Playbook runner — canon-linked CLI steps (explicit format)",
    priority: "P2",
    expectedOutcome:
      "Machine-readable playbook format (not markdown scrape) runs steps with logged JSON evidence; pilot playbook end-to-end.",
    approach:
      "Plan: (1) Define YAML/JSON step schema: argv + expected exit codes. (2) Runner executes workspace-kit lines only; no AGENT-CLI-MAP parsing. (3) Evidence log append per step. (4) Pilot: task-to-main subset.",
    technicalScope: [
      "scripts/ or new thin package under repo",
      "docs/maintainers/playbooks reference",
      "tests: golden playbook"
    ],
    acceptanceCriteria: [
      "Pilot playbook runs without parsing .md as executable",
      "Evidence log contains per-step stdout/stderr summary or paths",
      "Documented security: subprocess boundary"
    ]
  },
  {
    wishlistTaskId: "T477",
    newTaskId: "T513",
    title: "Team queue namespaces — filtered next-actions",
    priority: "P3",
    expectedOutcome:
      "Design doc + spike: optional metadata label filter for get-next-actions with single global ordering rule documented.",
    approach:
      "Plan: (1) ADR for namespace field(s) on tasks. (2) Spike filter-only mode in get-next-actions. (3) Extension/CLI list filtered queue. (4) Migration story for existing tasks (default namespace).",
    technicalScope: [
      "task-engine suggestions.ts / get-next-actions",
      "schemas / CONFIG.md",
      "FEATURE-MATRIX note"
    ],
    acceptanceCriteria: [
      "ADR merged with ordering rule",
      "Spike returns filtered queue on fixture tasks",
      "No second competing priority truth without governance fields"
    ]
  },
  {
    wishlistTaskId: "T479",
    newTaskId: "T514",
    title: "IDE-agnostic kit status integration — documented protocol",
    priority: "P2",
    expectedOutcome:
      "Documented adapter pattern: spawn workspace-kit JSON, parse results; one non-Cursor editor pilot note (sample repo or gist).",
    approach:
      "Plan: (1) Write protocol doc: commands, cwd, versioning. (2) Optional tiny npm adapter package or template repo. (3) Explicitly defer LSP-in-core until ADR.",
    technicalScope: [
      "docs/maintainers/",
      "Optional examples/ide-adapter-stub",
      "Security: no credential passing in samples"
    ],
    acceptanceCriteria: [
      "Protocol doc lists minimum command set for read-only status",
      "Sample uses same JSON as Cursor extension contract",
      "Core package remains CLI-canonical"
    ]
  },
  {
    wishlistTaskId: "T480",
    newTaskId: "T515",
    title: "Transcript → task diff linker — improvement metadata",
    priority: "P2",
    expectedOutcome:
      "Improvement tasks optionally carry stable transcript ref + line span; ingest or generate attaches without breaking dedupe keys.",
    approach:
      "Plan: (1) Extend metadata schema for transcript linkage. (2) Wire ingest to populate when available. (3) list-tasks output remains backward compatible. (4) Privacy note in runbook.",
    technicalScope: [
      "src/modules/improvement",
      "task-engine list/get display",
      "docs/maintainers/runbooks/cursor-transcript-automation.md"
    ],
    acceptanceCriteria: [
      "Schema documented; optional field on new improvements",
      "Dedupe behavior unchanged for existing keys",
      "Tests for round-trip on fixture transcript path"
    ]
  },
  {
    wishlistTaskId: "T481",
    newTaskId: "T516",
    title: "Confidence-calibrated improvement inbox",
    priority: "P3",
    expectedOutcome:
      "Surface confidence tier in list-tasks / triage UX; optional filter by tier; tune thresholds with maintainer doc.",
    approach:
      "Plan: (1) Ensure confidence stored on all new recommendations. (2) Expose in API and extension. (3) Document how to triage medium vs low. (4) Metrics in generate-recommendations output.",
    technicalScope: [
      "improvement generate-recommendations-runtime",
      "extension tasks view optional column",
      "AGENT-CLI-MAP triage section"
    ],
    acceptanceCriteria: [
      "Filter or sort by confidenceTier in at least one CLI command",
      "Maintainer playbook references tier semantics",
      "Tests on fixture output"
    ]
  },
  {
    wishlistTaskId: "T482",
    newTaskId: "T517",
    title: "Response-template lint in CI (opt-in)",
    priority: "P3",
    expectedOutcome:
      "Opt-in script or check stage validates response templates against contract; documented for template-heavy consumers.",
    approach:
      "Plan: (1) Reuse existing strict validation paths in tests. (2) Add pnpm script gated behind env or config. (3) Document in consumer parity flow.",
    technicalScope: [
      "scripts/",
      "docs/maintainers/runbooks/parity-validation-flow.md",
      "CI example in docs only unless repo opts in"
    ],
    acceptanceCriteria: [
      "Script exits 0 on this repo templates",
      "Documented opt-in flag",
      "No default slowdown for minimal consumers"
    ]
  },
  {
    wishlistTaskId: "T483",
    newTaskId: "T518",
    title: "Planning session resume cards — extension",
    priority: "P2",
    expectedOutcome:
      "Extension panel shows build-plan session summary from persisted fields; thin client; stale guard vs explicit replan.",
    approach:
      "Plan: (1) Read planning session from existing file/API. (2) Webview card with resume CLI copy. (3) No duplicate persistence. (4) User test checklist in e2e doc.",
    technicalScope: [
      "extensions/cursor-workflow-cannon",
      "planning module read commands",
      "docs/e2e.md"
    ],
    acceptanceCriteria: [
      "Card renders from fixture JSON in test",
      "Refresh matches persisted session after build-plan",
      "Documented stale behavior"
    ]
  },
  {
    wishlistTaskId: "T484",
    newTaskId: "T519",
    title: "Cross-repo parity matrix — fleet script (maintainer-only)",
    priority: "P3",
    expectedOutcome:
      "Documented script listing consumer repos with kit version + doctor health; core stays single-repo scoped.",
    approach:
      "Plan: (1) Input: list of repo paths or clone URLs (maintainer env). (2) Output: markdown/CSV table. (3) No org auth in core. (4) examples/ only.",
    technicalScope: [
      "scripts/ or docs/examples/",
      "No workflow-cannon core dependency on GitHub org APIs"
    ],
    acceptanceCriteria: [
      "Example script produces table for 2+ local fixture paths",
      "README warns on tokens and shallow clone",
      "Not published as default product surface"
    ]
  },
  {
    wishlistTaskId: "T485",
    newTaskId: "T520",
    title: "Synthetic load harness — task engine stress (maintainers)",
    priority: "P3",
    expectedOutcome:
      "Dev-only harness generates synthetic task graphs and churn; optional CI job with bounded runtime; documents baseline numbers.",
    approach:
      "Plan: (1) Script creates N tasks + transitions in temp workspace. (2) Measure list-tasks / sqlite latency. (3) Optional CI nightly opt-in. (4) Catch one known hot path regression.",
    technicalScope: [
      "scripts/ internal",
      "TaskStore temp dir",
      "docs/maintainers note only"
    ],
    acceptanceCriteria: [
      "Harness runs locally under documented time bound",
      "Catches injected regression in test or documented manual step",
      "Not in default pnpm test unless opted"
    ]
  },
  {
    wishlistTaskId: "T486",
    newTaskId: "T521",
    title: "Human interrupt / delegation fields — taxonomy spike",
    priority: "P3",
    expectedOutcome:
      "Spike: blocked-reason taxonomy + display in list-tasks; defer ACLs/notifications; no politicized ordering.",
    approach:
      "Plan: (1) Propose metadata keys for blockedReasonCategory. (2) Optional validation enum. (3) Surface in list-tasks JSON and extension. (4) ADR for delegation deferral.",
    technicalScope: [
      "task-engine types + list-tasks",
      "docs/maintainers/TERMS.md",
      "optional extension label"
    ],
    acceptanceCriteria: [
      "At least 3 taxonomy values documented and filterable",
      "Default tasks omit noise when field unset",
      "ADR states v1 scope boundary"
    ]
  },
  {
    wishlistTaskId: "T487",
    newTaskId: "T522",
    title: "GitHub Check integration — sample Action (read-only)",
    priority: "P3",
    expectedOutcome:
      "Sample workflow + redaction checklist; tokens owned by consumer; not shipped inside @workflow-cannon/workspace-kit package runtime.",
    approach:
      "Plan: (1) Add examples/github-check-sample/ with workflow yaml. (2) Document queue-health or doctor as step. (3) Security checklist for internal fields. (4) Link from RELEASING or consumer doc.",
    technicalScope: [
      "examples/ directory",
      "docs only in core repo"
    ],
    acceptanceCriteria: [
      "Sample runs on public fork with PAT note",
      "Checklist covers redaction",
      "No new secrets in workflow defaults"
    ]
  },
  {
    wishlistTaskId: "T489",
    newTaskId: "T523",
    title: "Wishlist/planning → implementation estimate pack",
    priority: "P3",
    expectedOutcome:
      "Optional conversion template: S/M/L, risk, tests, rollback stubs when converting wishlist → tasks; human-verify banner; no auto-scoring as truth.",
    approach:
      "Plan: (1) Extend convert-wishlist or add post-convert update-task template. (2) Populate optional metadata fields. (3) Document in planning-workflow.md. (4) Pilot one conversion.",
    technicalScope: [
      "task-engine convert-wishlist or docs template",
      "planning runbooks"
    ],
    acceptanceCriteria: [
      "Template documented with example JSON",
      "Pilot conversion fills stubs without breaking validation",
      "Explicit human-owned acceptance criteria banner in doc"
    ]
  },
  {
    wishlistTaskId: "T490",
    newTaskId: "T524",
    title: "Trust dashboard — what the kit will not do (generated boundary)",
    priority: "P2",
    expectedOutcome:
      "Generated artifact from canon (documentation module / .ai) listing non-goals and trust boundaries; regen on drift.",
    approach:
      "Plan: (1) Source rules from existing MODULE boundaries + PRINCIPLES. (2) generate-document or doc batch target. (3) Wire into optional maintainer-gates check. (4) Not marketed as certification.",
    technicalScope: [
      "documentation module template",
      "schemas if needed",
      "docs/maintainers + README pointer"
    ],
    acceptanceCriteria: [
      "One command produces boundary doc from sources",
      "Diff shows drift when behavior contract changes",
      "Disclaimer on non-certification present"
    ]
  }
];

function main() {
  const dec = {
    rationale:
      "Single execution task per open PLAN wishlist item; boundaries and dependency intent recorded for audit.",
    boundaries: "Each task scoped to its title; cross-cutting work split in technicalScope; no silent expansion of policy model.",
    dependencyIntent: "Tasks are independent unless future maintainer adds explicit dependsOn edges."
  };

  for (const p of PLANS) {
    console.error("update-wishlist", p.wishlistTaskId);
    run("update-wishlist", {
      wishlistId: p.wishlistTaskId,
      updates: { expectedOutcome: p.expectedOutcome },
      actor: "maintainer-bulk-convert"
    });

    console.error("convert-wishlist", p.wishlistTaskId, "→", p.newTaskId);
    run("convert-wishlist", {
      wishlistTaskId: p.wishlistTaskId,
      decomposition: dec,
      tasks: [
        {
          id: p.newTaskId,
          title: p.title,
          phase: PHASE,
          priority: p.priority,
          type: "workspace-kit",
          approach: p.approach,
          technicalScope: p.technicalScope,
          acceptanceCriteria: p.acceptanceCriteria
        }
      ],
      actor: "maintainer-bulk-convert"
    });

    console.error("update-task phaseKey", p.newTaskId);
    run("update-task", {
      taskId: p.newTaskId,
      updates: { phaseKey: PHASE_KEY },
      actor: "maintainer-bulk-convert"
    });

    console.error("run-transition accept", p.newTaskId);
    run("run-transition", {
      taskId: p.newTaskId,
      action: "accept",
      actor: "maintainer-bulk-convert",
      ...POLICY
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        converted: PLANS.map((x) => ({ from: x.wishlistTaskId, to: x.newTaskId })),
        skipped: ["T470 test-seed-delete-me — left open; archive manually if desired"]
      },
      null,
      2
    )
  );
}

main();
