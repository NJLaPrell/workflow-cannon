/**
 * One-shot: create wishlist_intake tasks from PLAN.md exercise (20 items).
 *
 * NOT idempotent — each run mints 20 new T### rows. To run intentionally:
 *   WK_SEED_PLAN_WISHLIST=1 node scripts/seed-plan-wishlist-intake.mjs
 * (after `pnpm run build`). See `docs/exercises/workflow-cannon-feature-ideation.md` → “Registered as wishlist intake”.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

if (process.env.WK_SEED_PLAN_WISHLIST !== "1") {
  console.error(
    "Refusing to run: would create 20 duplicate wishlist_intake tasks. Set WK_SEED_PLAN_WISHLIST=1 if you mean it.",
  );
  process.exit(1);
}

const requestor = "docs/exercises/workflow-cannon-feature-ideation.md product ideation exercise";
const evidenceRef =
  "docs/exercises/workflow-cannon-feature-ideation.md — feature directions + review summary";

const proposals = [
  {
    title: "Merge ≠ done guardian (Git ↔ task engine)",
    problemStatement:
      "Teams merge PRs but omit run-transition complete, or leave tasks in_progress without activity; Git and canonical task state drift with no automated signal.",
    expectedOutcome:
      "Operators get an actionable report (local git and/or optional hosting) surfacing likely desync without claiming Git owns lifecycle.",
    impact:
      "Reduces the #1 maintainer failure mode documented in runbooks; increases trust that the queue matches shipped reality.",
    constraints:
      "Must not require GitHub by default; avoid noisy heuristics; preserve CLI-first and policy boundaries from PRINCIPLES.",
    successSignals:
      "Pilot consumers report fewer post-merge queue surprises; false-positive rate documented and bounded.",
  },
  {
    title: "Evidence bundle exporter (audit / postmortem zip)",
    problemStatement:
      "Audits and postmortems require hand-collecting task history, policy traces, config evidence, and parity artifacts.",
    expectedOutcome:
      "Single workspace-kit command produces a versioned, redaction-aware bundle manifest plus referenced files.",
    impact:
      "Faster security reviews and release retros; aligns with machine-readable evidence story.",
    constraints:
      "No secrets in bundle by default; explicit allowlist; size caps; bundle schema versioned for compatibility.",
    successSignals:
      "Maintainers can produce one bundle for an incident; redaction tests pass; consumers document opt-in paths.",
  },
  {
    title: "Policy rehearsal mode (dry-run sensitive commands)",
    problemStatement:
      "Teams cannot regression-test policy wiring in CI without mutating workspace state or duplicating logic informally.",
    expectedOutcome:
      "Documented parity between dry-run and live paths for at least one sensitive command class; CI can assert trace shape.",
    impact:
      "Safer refactors of policy-sensitive surfaces; clearer architecture boundary.",
    constraints:
      "Dry-run must not weaken policyApproval semantics; no false confidence if paths diverge.",
    successSignals:
      "ADR or spec for parity rules; integration tests cover dry vs live for pilot command(s).",
  },
  {
    title: "Task time travel replay (read-only queue forensics)",
    problemStatement:
      "Disputes and onboarding need to know what get-next-actions or queue-health implied at a past release or snapshot.",
    expectedOutcome:
      "Read-only replay from export-on-commit snapshot (or explicit snapshot id) with documented version caveats.",
    impact:
      "Debuggable forensics without hand-waving; reinforces determinism narrative.",
    constraints:
      "Avoid implying snapshot+new code is always valid; migration complexity must be bounded.",
    successSignals:
      "Maintainer can answer one historical queue question from a tagged export; docs warn on mismatch.",
  },
  {
    title: "Dependency graph / critical path in Cursor extension",
    problemStatement:
      "Humans struggle to parse blocked-by chains from flat JSON; extension summary is not enough for large queues.",
    expectedOutcome:
      "Thin-client UX: unblocker list or compact graph from existing dashboard-summary contracts without new backend truth.",
    impact:
      "Faster prioritization for dependency-heavy work; stays aligned with thin extension model if scoped.",
    constraints:
      "No full graph editor product; a11y and large-queue degradation behavior defined.",
    successSignals:
      "Extension users report faster next-task choice; perf budget met on N-task fixture.",
  },
  {
    title: "Playbook runner (canon-linked CLI steps)",
    problemStatement:
      "Playbooks link canon but copy-paste of workspace-kit JSON remains error-prone for onboarding.",
    expectedOutcome:
      "Repeatable step execution with logged JSON evidence; machine-readable step source (not fragile markdown parse).",
    impact:
      "Fewer skipped policyApproval steps; trainable maintainer path.",
    constraints:
      "Do not parse AGENT-CLI-MAP as executable; explicit step format only.",
    successSignals:
      "Pilot playbook runnable end-to-end with evidence log; no markdown scraping.",
  },
  {
    title: "Team queue namespaces (filtered next-actions)",
    problemStatement:
      "Monorepos with multiple squads share one queue; get-next-actions noise hides relevant work.",
    expectedOutcome:
      "Optional label/stream filter with a single documented global ordering rule; no competing truths.",
    impact:
      "Scales coordination model to real org shapes.",
    constraints:
      "Schema migration story; avoid politicized priority without governance fields.",
    successSignals:
      "Design doc + spike: filter-only mode; extension/CLI list filtered next-actions.",
  },
  {
    title: "Consumer golden path wizard (wk onboard)",
    problemStatement:
      "New npm consumers do not discover doctor, run menu, and get-next-actions quickly; support burden is high.",
    expectedOutcome:
      "Minimal onboard: validate env, run doctor, print three commands, optional stub pointing at AGENT-CLI-MAP.",
    impact:
      "Adoption and time-to-first-success; fewer what-do-I-run-first questions.",
    constraints:
      "Thin defaults; no opinionated policy in scaffold; stay synced with doctor output.",
    successSignals:
      "Consumer fixture repo completes onboard in under X minutes; docs link from README pattern.",
  },
  {
    title: "IDE-agnostic kit status integration (protocol)",
    problemStatement:
      "Only Cursor extension consumes dashboard-summary style contracts; other IDE users repeat CLI manually.",
    expectedOutcome:
      "Optional adapter package or documented pattern: spawn wk JSON commands; no second truth in core until stable.",
    impact:
      "Multi-IDE orgs can standardize; CLI remains canonical API.",
    constraints:
      "Core package does not own LSP long-term without ADR; security/versioning for process spawn documented.",
    successSignals:
      "One non-Cursor editor pilot uses read-only status without forking kit logic.",
  },
  {
    title: "Transcript → task diff linker (improvement metadata)",
    problemStatement:
      "Improvement triage lacks compact, evidence-backed linkage to repo change since last ingest.",
    expectedOutcome:
      "Opt-in, size-capped metadata: paths/stats or redacted diff summary; pinned SHA semantics documented.",
    impact:
      "Faster triage and defensible promotion/reject decisions.",
    constraints:
      "Secrets/PII must not land in tasks by default; deterministic when SHA pinned.",
    successSignals:
      "Triage playbook references new field; redaction tests; default off.",
  },
  {
    title: "Confidence-calibrated improvement inbox",
    problemStatement:
      "Backlog triage is heavy; operators want deterministic signals, not more guesswork.",
    expectedOutcome:
      "Unified surface with explicit dedupe keys, filters, and documented non-oracle hints only.",
    impact:
      "Supports improvement-triage-top-three at scale when transcript volume grows.",
    constraints:
      "No fuzzy oracle labeled as truth; determinism-first per PRINCIPLES.",
    successSignals:
      "Ship deterministic slice first; user-tested reduction in triage time.",
  },
  {
    title: "Response-template lint in CI (opt-in)",
    problemStatement:
      "Template id drift and conflicts reach production before strict enforcement surprises teams.",
    expectedOutcome:
      "Documented opt-in CI step or run wrapper reusing resolve semantics; fails fast on misconfig.",
    impact:
      "Governance-left for template-heavy consumers.",
    constraints:
      "Not default global CI; mirror full resolve or document gaps; avoid flaky merges.",
    successSignals:
      "Maintainer runbook section; one CI fixture repo green path.",
  },
  {
    title: "Planning session resume cards (extension)",
    problemStatement:
      "Long agent sessions lose build-plan context after compaction or tab switches.",
    expectedOutcome:
      "Extension card from existing persisted planning/dashboard fields; no new persistence model in v1.",
    impact:
      "Less abandoned planning; better UX for planning module users.",
    constraints:
      "Thin client; stale resume must not override explicit replan commands.",
    successSignals:
      "User test: resume matches persisted state; no duplicate source of truth.",
  },
  {
    title: "Cross-repo parity matrix (fleet view)",
    problemStatement:
      "Platform teams cannot see kit version, config, and doctor health across many consumer repos.",
    expectedOutcome:
      "Documented script or separate CLI listing repos; core remains repo-scoped.",
    impact:
      "Operational governability at org scale.",
    constraints:
      "No core dependency on org auth/layout; avoid political scoreboard in default product.",
    successSignals:
      "Internal pilot script produces one table; docs under maintainer examples.",
  },
  {
    title: "Synthetic load harness (task engine stress)",
    problemStatement:
      "SQLite contention and extension refresh behavior under large queues is under-characterized.",
    expectedOutcome:
      "Internal harness generates synthetic graphs and churn; optional CI job for regression band.",
    impact:
      "Risk reduction before user-scale pain; data for tuning queue-health.",
    constraints:
      "Not a published consumer feature; maintainers-only or dev-deps; avoid bikeshed SLOs without owners.",
    successSignals:
      "One benchmark run documented; catches one known hot path regression.",
  },
  {
    title: "Human interrupt / delegation fields on tasks",
    problemStatement:
      "Blocked reasons and handoffs live in free-form notes; get-next-actions cannot reflect human coordination.",
    expectedOutcome:
      "Spike: blocked reason taxonomy + display; delegation deferred until identity model exists.",
    impact:
      "Clearer multi-person queue semantics without full PM suite.",
    constraints:
      "No ACLs/notifications in v1; avoid politicized ordering without policy.",
    successSignals:
      "Taxonomy used in list-tasks filters; no empty-field noise default.",
  },
  {
    title: "GitHub Check integration (read-only, sample)",
    problemStatement:
      "Leaders want queue health visible on PRs without opening the extension.",
    expectedOutcome:
      "Sample Action + redaction guidelines; tokens and exposure owned by consumer.",
    impact:
      "Transparency where developers already work.",
    constraints:
      "Not in core package; shallow clone and spam risks documented.",
    successSignals:
      "One org adopts sample; checklist for redacting internal fields.",
  },
  {
    title: "Config intent layers for agents (facet explain)",
    problemStatement:
      "resolve-config is large for LLM context; agents mis-invoke keys unrelated to policy/transcript/persistence.",
    expectedOutcome:
      "explain-config --facet (or equivalent) generated from existing config metadata; single source of truth.",
    impact:
      "Fewer bad workspace-kit calls; scales with config surface.",
    constraints:
      "Must stay aligned with resolve-config tests; no silent omission of critical keys.",
    successSignals:
      "Agent harness uses facet for bootstrap; parity test vs full resolve for facet keys.",
  },
  {
    title: "Wishlist/planning → implementation estimate pack",
    problemStatement:
      "Converting planning to tasks leaves blank scope fields; humans re-type risk and test hints.",
    expectedOutcome:
      "Optional conversion template: S/M/L, risk, tests, rollback stubs with human-verify banner.",
    impact:
      "Smoother planning-to-execution handoff.",
    constraints:
      "No auto-scoring from prose as truth; avoid false precision.",
    successSignals:
      "Pilot conversion fills stubs; acceptance criteria remain human-owned.",
  },
  {
    title: "Trust dashboard — what the kit will not do",
    problemStatement:
      "Security reviewers and contributors lack a short, trustworthy boundary statement.",
    expectedOutcome:
      "Generated output from existing canon (documentation module / .ai records); not hand-curated duplicate.",
    impact:
      "Faster evaluation and onboarding; reinforces policy-serious brand.",
    constraints:
      "Not marketed as certification; staleness impossible vs hand doc if generated.",
    successSignals:
      "One command or generate step; diff shows drift when behavior changes.",
  },
];

function createWishlist(payload) {
  const body = {
    ...payload,
    requestor,
    evidenceRef,
  };
  const cli = path.join(root, "dist", "cli.js");
  execFileSync(process.execPath, [cli, "run", "create-wishlist", JSON.stringify(body)], {
    cwd: root,
    stdio: "inherit",
  });
}

for (const p of proposals) {
  createWishlist(p);
}

console.error(`Created ${proposals.length} wishlist intake task(s).`);
