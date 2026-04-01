#!/usr/bin/env node
/**
 * One-shot: create architect-review tasks (T450–T469).
 * Default: type improvement, status proposed (triage backlog).
 * Workable queue: node scripts/architect-review-proposals-2026-03-31.mjs --ready
 *   → type workspace-kit, status ready (shows in get-next-actions / ready preview).
 * Or: node scripts/phase29-architect-ready-tasks.mjs
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cli = path.join(root, "dist", "cli.js");

export const phase = "Phase 29 — architecture and operability hygiene";
export const phaseKey = "29";

export const proposals = [
  {
    id: "T450",
    title: "[improvement] Reduce native SQLite consumer pain for workspace-kit",
    original:
      "Native `better-sqlite3` on a published workflow CLI — You ship a compiled addon to arbitrary Node versions and machines. The repo itself warns about ABI mismatch and `pnpm rebuild`. That's a support vector shaped like a middle finger to anyone who thought \"npm install\" meant \"it works.\"",
    plan:
      "Theme: distribution and install predictability for the same class of issues (native addons, cross-platform CI, consumer docs). Audit alternatives (optional wasm/sql.js, pure JS fallback, documented optional dependency) against determinism and R002; produce ADR + migration path; tighten postinstall/doctor signals; document consumer runbooks in one place.",
    technicalScope: [
      "Survey install failure modes (ABI, corporate proxies, air-gapped) and current mitigations (`ensure-native-sqlite`, AGENTS.md).",
      "Compare trade-offs: keep native default vs optional backend vs bundled prebuilds; align with task-engine persistence ADRs.",
      "Define acceptance tests / parity expectations if adding a fallback path."
    ],
    acceptanceCriteria: [
      "Written decision (ADR or ROADMAP slice) with explicit compatibility stance.",
      "Doctor or install path surfaces actionable recovery in one screen of output.",
      "Maintainer doc links consumer expectations without scattering warnings across 5 files."
    ]
  },
  {
    id: "T451",
    title: "[improvement] Rethink JSON-document-in-SQLite task persistence model",
    original:
      "SQLite used as a fancy JSON file — Task state is a `TaskStoreDocument` blob in `TEXT`, not normalized rows. You pay native SQLite operational cost and migration complexity (`legacy-dual` vs `task-only` in `sqlite-dual-planning.ts`) without getting relational querying or clean concurrency story.",
    plan:
      "Theme: persistence shape vs operational benefit. Either lean into documents (simplify SQLite to one blob, fewer shapes) or incrementally normalize hot paths (indexes, query by status/id without full parse). Same class: migrations, dual table shapes, load/save costs.",
    technicalScope: [
      "Document current read/write hot paths and migration story (`SqliteDualPlanningStore`, `TaskStore.forSqliteDual`).",
      "Spike minimal schema option (single row versioned blob vs keyed columns) with benchmark or complexity note.",
      "If normalized: define migration from existing files and JSON opt-out parity."
    ],
    acceptanceCriteria: [
      "ADR or design note commits to direction (document-first vs hybrid vs normalized) with rationale.",
      "Migration risk called out with rollback story.",
      "No increase in undocumented table shapes without doctor detection."
    ]
  },
  {
    id: "T452",
    title: "[improvement] Unify dual persistence (SQLite default + JSON opt-out) operator story",
    original:
      "Two persistence backends for the same conceptual store — Default SQLite vs JSON opt-out means two code paths, two mental models, and docs that constantly say \"unless you're on the other one.\" Every bug report starts with \"which backend?\"",
    plan:
      "Theme: single mental model for operators and agents. Consolidate troubleshooting (doctor output, AGENT-CLI-MAP), consider auto-detect banner, shared invariant tests across backends, and explicit `explain-config` for persistence.",
    technicalScope: [
      "Inventory all user-facing mentions of JSON vs SQLite; classify into canonical vs duplicate.",
      "Add or extend doctor / `resolve-config` output: effective persistence backend + paths.",
      "Ensure parity tests or checklist explicitly runs both paths where feasible."
    ],
    acceptanceCriteria: [
      "One maintainer runbook section: \"determine backend + paths + recovery\".",
      "CLI surfaces effective backend without reading three docs.",
      "Tests or scripts document parity expectations for both backends."
    ]
  },
  {
    id: "T453",
    title: "[improvement] Clarify and harden two approval lanes (run JSON vs env)",
    original:
      "Two approval lanes that humans and agents will swap — JSON `policyApproval` on `workspace-kit run` vs env `WORKSPACE_KIT_POLICY_APPROVAL` for `config` / `init` / `upgrade`. The design is defensible; the UX is a trap.",
    plan:
      "Theme: wrong-lane errors and teachable denials. Improve error text, add doctor subcheck, optional CLI hint when env set during `run`, and AGENT-CLI-MAP decision tree updates; same class: any future third lane.",
    technicalScope: [
      "Trace denial paths in `run-command.ts` and config/init entrypoints; catalog confusion cases.",
      "Prototype clearer errors: \"you used env approval but this command requires JSON policyApproval\" (wording policy-safe).",
      "Update CLI-VISUAL-GUIDE / AGENT-CLI-MAP with a single flowchart entry."
    ],
    acceptanceCriteria: [
      "Representative misuse scenarios get explicit next-step text (no generic failure).",
      "AGENT-CLI-MAP tier table cross-links the two lanes in one subsection.",
      "Tests cover at least one wrong-lane message."
    ]
  },
  {
    id: "T454",
    title: "[improvement] Centralize policy sensitivity registry for extensions",
    original:
      "Policy sensitivity is a scavenger hunt — Builtins in `builtin-run-command-manifest`, plus `extraSensitiveModuleCommands` from effective config, plus command-specific dry-run exceptions in `policy.ts`. Extend the kit without updating all three and you've invented silent \"not sensitive\" behavior.",
    plan:
      "Theme: single source of truth + CI enforcement. Extend manifest or codegen; add check script that manifest, policy aggregates, and instruction metadata agree; document extension pattern for module authors.",
    technicalScope: [
      "Map every path that feeds `isSensitiveModuleCommand` / `resolvePolicyOperationIdForCommand`.",
      "Design additive manifest fields or build step to emit policy map.",
      "Extend existing check scripts (`check-builtin-command-manifest`, coverage) for drift detection."
    ],
    acceptanceCriteria: [
      "New module command cannot ship without policy classification in CI (or explicit exempt with reason).",
      "Maintainer doc: \"how to mark sensitive\" in one page.",
      "No silent downgrade: tests for dynamic + builtin + dry-run matrix."
    ]
  },
  {
    id: "T455",
    title: "[improvement] Reduce governance doc stack surface area for agents",
    original:
      "Governance stack taller than the feature stack — Source-of-truth ordering across `.ai/`, `docs/maintainers/`, `.cursor/rules/`, playbooks, runbooks, workbooks, maps, visual guides… Operating the repo correctly is a specialization.",
    plan:
      "Theme: progressive disclosure without losing precedence. Curate a single onboarding path (e.g. AGENTS.md → decision tree), collapse duplicate mirrors, mark generated vs hand-edited, optional \"if you only read one file\" card; same class: any new doc family.",
    technicalScope: [
      "Audit overlap between AGENTS, ARCHITECTURE, AGENT-CLI-MAP, CLI-VISUAL-GUIDE; measure duplicate paragraphs.",
      "Define tiers: T0 bootstrap (200 lines), T1 role-based links.",
      "Optional automation: lint for broken cross-links or stale phase numbers."
    ],
    acceptanceCriteria: [
      "New contributor path documented in README or AGENTS with ≤5 hops to \"run a transition safely\".",
      "Explicit note which docs are mirrors and which are canonical.",
      "ROADMAP or DECISIONS entry if precedence order changes."
    ]
  },
  {
    id: "T456",
    title: "[improvement] Make R102 layering exceptions navigable in code and docs",
    original:
      "Layering \"rules\" with a standing list of exceptions — R102 says modules only touch `core`/`contracts`, then ARCHITECTURE documents facades where `core` imports the whole module barrel anyway. New contributors trip on the holes.",
    plan:
      "Theme: honest architecture = graph + allowlist. Maintain machine-checkable exception list (comment + script), diagram in ARCHITECTURE, module-build-guide \"when to add an exception\"; same class: new facades.",
    technicalScope: [
      "List all documented exceptions and verify against imports (config-cli, core/planning, etc.).",
      "Add grep-based or dep-cruiser style check with allowlist file.",
      "Short diagram: intended vs actual edges."
    ],
    acceptanceCriteria: [
      "CI or script fails on new core↔modules edges not in allowlist.",
      "ARCHITECTURE links allowlist location.",
      "module-build-guide explains escalation path for new exceptions."
    ]
  },
  {
    id: "T457",
    title: "[improvement] Simplify response-template resolution and failure modes",
    original:
      "Response templates are a mini language inside the CLI — Multiple inputs (`responseTemplateId`, directives, instruction text parsing, overrides, `enforcementMode`). Strict mode failures are correct; they're also a lot of cognitive load.",
    plan:
      "Theme: fewer sources of truth, clearer precedence doc, kinder errors. Consider collapsing directive sources, improving `response-template-conflict` messages with diffs, AGENT-CLI-MAP cookbook; same class: instruction template mapper complexity.",
    technicalScope: [
      "Document resolution order in one table (code + docs).",
      "User-test error messages for top 3 misconfigurations.",
      "Evaluate deprecating redundant arg names behind compatibility window."
    ],
    acceptanceCriteria: [
      "Single maintainer section: precedence + examples.",
      "Strict mode errors include which source won and why.",
      "Tests assert message substrings for common mistakes."
    ]
  },
  {
    id: "T458",
    title: "[improvement] Clarify planning module vs task-engine planning persistence",
    original:
      "Planning vs task-engine ownership is easy to misunderstand — Planning module vs planning persistence in task-engine/SQLite, with `core/planning` as a facade—documented, but still a bounded-context hairball.",
    plan:
      "Theme: naming and diagrams. Rename doc sections for clarity, add sequence diagram (who owns writes), ensure module READMEs state boundaries; same class: wishlist vs tasks split.",
    technicalScope: [
      "Trace write paths for planning artifacts and SQLite rows.",
      "Produce one mermaid diagram in ARCHITECTURE or planning README.",
      "Glossary entries in TERMS.md if new terms needed."
    ],
    acceptanceCriteria: [
      "\"Where does this state live?\" answered in planning module README lead section.",
      "No contradictory statements between task-engine and planning docs.",
      "Optional doctor subcommand or static doc only—no scope creep."
    ]
  },
  {
    id: "T459",
    title: "[improvement] Reduce /qt vs workspace-kit policy confusion",
    original:
      "`/qt` explicitly doesn't run the kit — README is clear: editor `/qt` is templates only. So you have a friendly-looking workflow affordance that cannot satisfy policy or persist state.",
    plan:
      "Theme: safe affordances. Template headers, Cursor command docs, link to AGENT-CLI-MAP line; consider `/qt` stub warning when step mentions policy; same class: any editor-only shortcuts.",
    technicalScope: [
      "Inventory `/qt` templates and add mandatory kit-invocation reminder block.",
      "Document in consumer cadence runbooks.",
      "If repo ships `.cursor/commands`, ensure copy matches POLICY-APPROVAL."
    ],
    acceptanceCriteria: [
      "Every template that mutates kit state includes copy-paste workspace-kit line or explicit \"run separately\".",
      "AGENTS.md `/qt` section references template convention.",
      "No claim that `/qt` satisfies policy."
    ]
  },
  {
    id: "T460",
    title: "[improvement] Trim Cursor rules duplication vs maintainer docs",
    original:
      "A small forest of Cursor rules mirroring maintainer docs—sync burden and \"which file did we forget to update?\" energy.",
    plan:
      "Theme: generated or pointer-only rules. Prefer rules that link to canonical paths, codegen from AGENTS headings, or periodic check script; same class: .ai mirrors.",
    technicalScope: [
      "Classify rules into: must mirror vs can be pointer + link.",
      "Prototype one rule file as thin pointer with stability test.",
      "Document update workflow in module-build-guide or playbooks."
    ],
    acceptanceCriteria: [
      "Policy for new rules: mirror vs link decision recorded.",
      "At least one heavy rule slimmed without losing enforcement intent.",
      "CHANGELOG note if contributor workflow changes."
    ]
  },
  {
    id: "T461",
    title: "[improvement] Align .ai machine canon with human docs (drift control)",
    original:
      "`.ai/PRINCIPLES.md` pipe-delimited machine dialect living beside human prose—two representations of the same canon; drift is always one edit away.",
    plan:
      "Theme: single author workflow. Optional generator from structured source, or CI diff check human vs machine, or explicit \"edit order\"; same class: generated mirrors in `.ai/AGENTS.md`.",
    technicalScope: [
      "Inventory machine-readable files and their human siblings.",
      "Spike validate script or codegen from YAML/JSON principles source.",
      "Document in RELEASING or maintainer checklist."
    ],
    acceptanceCriteria: [
      "CI fails on principles drift OR single source generates both formats.",
      "Maintainer doc: how to change R00x safely.",
      "No silent desync for one release cycle (spot-check process)."
    ]
  },
  {
    id: "T462",
    title: "[improvement] Rename or document phase4-gates / phase5-gates scripts",
    original:
      "`phase4-gates` / `phase5-gates` script names tied to roadmap era while the product keeps moving—archaeological naming in `package.json`.",
    plan:
      "Theme: intention-revealing script names. Alias to `maintainer-gates` / `pre-merge-gates`, keep old names as deprecated shims, update docs; same class: any phase-numbered artifacts.",
    technicalScope: [
      "Grep usages in CI, docs, and runbooks.",
      "Add new names, deprecate with console warning optional.",
      "Update ROADMAP/RELEASING references."
    ],
    acceptanceCriteria: [
      "Primary doc references neutral gate names.",
      "Old names still work one release or documented removal version.",
      "package.json scripts section has short comment block."
    ]
  },
  {
    id: "T463",
    title: "[improvement] Harden check-script chain ergonomics and failure clarity",
    original:
      "`pnpm run check` is a daisy chain of bespoke Node scripts (manifest, contracts, CLI map coverage, orphan instructions). Good hygiene, slightly hosed feeling when one fails and you decode which invariant broke.",
    plan:
      "Theme: unified reporter. Wrapper prints banner per step, timings, fix hints; consider `check --only X`; same class: phase5-gates composition.",
    technicalScope: [
      "Wrap existing scripts in a small runner with step labels.",
      "Map each script to one-line \"what failed / how to fix\" in doc or output.",
      "Optional parallel safe steps—only if deterministic."
    ],
    acceptanceCriteria: [
      "Failed `pnpm run check` names the stage and points to owning doc/script.",
      "CONTRIBUTING or AGENTS mentions check composition.",
      "No regression in which checks run vs today."
    ]
  },
  {
    id: "T464",
    title: "[improvement] Tame unknown-command error output size",
    original:
      "Unknown `run` subcommand errors that concatenate every known command into the message—fine for tiny CLIs, gross once the router is huge.",
    plan:
      "Theme: scalable CLI UX. Truncate with \"… N more\" + hint to `workspace-kit run` or `doctor --agent-instruction-surface`; same class: any enumerated list errors.",
    technicalScope: [
      "Measure current command count and message length.",
      "Implement cap + stable sort + suggestion for closest match (optional).",
      "Test golden output bounds."
    ],
    acceptanceCriteria: [
      "Error output under N characters or first K commands + count.",
      "Hint references discovery command.",
      "Tests updated for new format."
    ]
  },
  {
    id: "T465",
    title: "[improvement] Align extension build toolchain with repo (npm vs pnpm)",
    original:
      "Extension subdirectory on `npm` while the monolith is `pnpm`—tiny inconsistency that makes the \"how do I build the UI?\" path feel janky.",
    plan:
      "Theme: one package manager story per repo. Migrate extension to pnpm workspace, or document why npm is required, script `ui:prepare` accordingly; same class: nested lockfiles.",
    technicalScope: [
      "Audit extension package.json, lockfiles, CI.",
      "Choose workspace merge or documented exception.",
      "Update ui:prepare / CONTRIBUTING."
    ],
    acceptanceCriteria: [
      "Single documented path builds extension on clean clone.",
      "CI uses same tool as docs.",
      "CHANGELOG compatibility note if consumer impact."
    ]
  },
  {
    id: "T466",
    title: "[improvement] Streamline wishlist W### vs execution task onboarding",
    original:
      "Wishlist `W###` vs execution tasks—extra id space and migration language in README; necessary evolution, still makes onboarding feel like reading patch notes.",
    plan:
      "Theme: one story for id spaces. Glossary card, diagram in consumer cadence, doctor line for counts by type; same class: imp- ids from ingest.",
    technicalScope: [
      "Review README + TERMS for W/T/imp narrative.",
      "Add concise \"when to use which id\" to runbook.",
      "Optional list-tasks filter examples in AGENT-CLI-MAP."
    ],
    acceptanceCriteria: [
      "New user can answer \"what id do I create?\" from one page.",
      "TERMS cross-links wishlist workflow doc.",
      "No duplicate contradictory explanations."
    ]
  },
  {
    id: "T467",
    title: "[improvement] Plan task store schemaVersion evolution beyond hard-stop",
    original:
      "Task store schema version `1` hard-stop in JSON path—simple, until you need a migration story that isn't \"throw.\"",
    plan:
      "Theme: forward-compatible migrations. Version bump playbook, automatic migrate on load for additive changes, doctor reporting; same class: SQLite blob schema inside JSON.",
    technicalScope: [
      "Document current schemaVersion semantics in task-engine workbook.",
      "Design migration hook: load → migrate → save, with backup advice.",
      "Spike one noop v2 or additive field migration."
    ],
    acceptanceCriteria: [
      "Documented migration policy for maintainers.",
      "Either implemented migration path for one safe change OR explicit \"no bump until X\" decision in ADR.",
      "Tests cover migrate + idempotency."
    ]
  },
  {
    id: "T468",
    title: "[improvement] Balance safety messaging on chat vs JSON approval",
    original:
      "\"Chat approval doesn't count\" repeated everywhere—correct for safety, exhausting as ritual. The system trusts JSON flags more than the human in the thread, which is logically consistent and emotionally weird.",
    plan:
      "Theme: tone + dedup. Single canonical paragraph linked everywhere; optional interactive approval UX reduces repetition; same class: policy denial copy.",
    technicalScope: [
      "Count occurrences; refactor to shared doc fragment or constant in CLI output.",
      "Review interactive-policy path for user-visible messaging.",
      "Ensure POLICY-APPROVAL remains normative."
    ],
    acceptanceCriteria: [
      "One canonical explanation linked from secondary docs.",
      "CLI errors link POLICY-APPROVAL once instead of paragraph repeat.",
      "No weakening of approval semantics."
    ]
  },
  {
    id: "T469",
    title: "[improvement] Improve command discovery from first-run help",
    original:
      "`workspace-kit run` with no args as the real command discovery—works, but it's not the first thing `--help` teaches; discovery is slightly indirect for newcomers.",
    plan:
      "Theme: progressive CLI help. Top-level --help mentions `run` discovery; `run --help` if added; doctor points to menu; same class: any nested submenus.",
    technicalScope: [
      "Audit cli.ts help text and first-run output.",
      "Add explicit line: \"run with no subcommand lists all module commands\".",
      "Optional `run --help` mirroring behavior."
    ],
    acceptanceCriteria: [
      "`workspace-kit --help` mentions discovery without reading README.",
      "Parity test or snapshot for help text if project uses them.",
      "AGENT-CLI-MAP unchanged in meaning—only UX alignment."
    ]
  }
];

/** @param {{ ready: boolean }} opts */
export function runArchitectPhase29Creates(opts) {
  const { ready } = opts;
  let ok = 0;
  for (const p of proposals) {
    const title = ready ? p.title.replace(/^\[improvement\]/, "[workspace-kit]") : p.title;
    const payload = {
      id: p.id,
      title,
      type: ready ? "workspace-kit" : "improvement",
      status: ready ? "ready" : "proposed",
      phase,
      phaseKey,
      priority: ready ? "P3" : undefined,
      clientMutationId: ready
        ? `phase29-workable-2026-04-01-${p.id}`
        : `architect-review-2026-03-31-${p.id}`,
      metadata: {
        source: "architect-review-2026-03-31",
        originalObservation: p.original,
        ...(ready ? { promotedToReadyQueue: true, note: "Architect review item — Phase 29 execution backlog" } : {})
      },
      approach: `Overall plan (and similar issues): ${p.plan}`,
      technicalScope: p.technicalScope,
      acceptanceCriteria: p.acceptanceCriteria
    };
    if (!ready) {
      delete payload.priority;
    }
    try {
      const out = execFileSync(process.execPath, [cli, "run", "create-task", JSON.stringify(payload)], {
        cwd: root,
        encoding: "utf8"
      });
      const parsed = JSON.parse(out.trim());
      if (!parsed.ok) {
        if (parsed.code === "duplicate-task-id") {
          console.log("skip (exists)", p.id);
          ok++;
          continue;
        }
        console.error(p.id, parsed);
        process.exitCode = 1;
        break;
      }
      console.log("created", p.id, parsed.message ?? "ok");
      ok++;
    } catch (e) {
      console.error(e.stderr?.toString() ?? e.message);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`Done: ${ok}/${proposals.length}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runArchitectPhase29Creates({ ready: process.argv.includes("--ready") });
}
