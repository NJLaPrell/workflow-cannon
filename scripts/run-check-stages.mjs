#!/usr/bin/env node
/**
 * Staged `pnpm run check` — prints a banner per step and fix hints on failure.
 * @see .ai/agent-source-of-truth-order.md (governance path order)
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscJs = path.join(root, "node_modules", "typescript", "lib", "tsc.js");

const stages = [
  {
    id: "typescript",
    label: "TypeScript (tsc --noEmit)",
    command: process.execPath,
    args: [tscJs, "-p", "tsconfig.json", "--noEmit"],
    hint: "Fix TS errors, then re-run pnpm run check. Config: tsconfig.json"
  },
  {
    id: "command-manifest",
    label: "Shipped command manifest vs handlers",
    command: process.execPath,
    args: ["scripts/check-builtin-command-manifest.mjs"],
    hint: "See scripts/check-builtin-command-manifest.mjs and src/modules task-engine command wiring."
  },
  {
    id: "cae-registry",
    label: "CAE registry validate (cae-registry-validate)",
    command: process.execPath,
    args: ["scripts/check-cae-registry.mjs"],
    hint: "Fix .ai/cae/registry JSON or CAE loader; see .ai/runbooks/cae-debug.md; run pnpm run build before check."
  },
  {
    id: "core-layer-allowlist",
    label: "Core → module import allowlist (R102)",
    command: process.execPath,
    args: ["scripts/check-core-module-layer-allowlist.mjs"],
    hint: "docs/maintainers/ARCHITECTURE.md — core must not import modules except allowlisted paths."
  },
  {
    id: "task-engine-contracts",
    label: "Task-engine run command contracts",
    command: process.execPath,
    args: ["scripts/check-task-engine-run-contracts.mjs"],
    hint: "Instruction markdown and manifest rows must match for sensitive run commands."
  },
  {
    id: "task-engine-instruction-contract-sections",
    label: "Task-engine generated instruction contract sections",
    command: process.execPath,
    args: ["scripts/check-task-engine-instruction-contract-sections.mjs"],
    hint: "Run node scripts/check-task-engine-instruction-contract-sections.mjs --write after changing task-engine command contracts."
  },
  {
    id: "pilot-run-args-snapshot",
    label: "Pilot run-args snapshot vs task-engine contracts",
    command: process.execPath,
    args: ["scripts/check-pilot-run-args-snapshot.mjs"],
    hint: "Regenerate schemas/pilot-run-args.snapshot.json via node scripts/refresh-pilot-run-args-snapshot.mjs after changing pilot command arg contracts."
  },
  {
    id: "run-args-cli-validation-waivers",
    label: "Sensitive run commands: pilot snapshot or explicit waiver",
    command: process.execPath,
    args: ["scripts/check-run-args-cli-validation-waivers.mjs"],
    hint: "Add AJV coverage in pilot snapshot or list explicit rationale in schemas/run-args-cli-validation-waivers.json."
  },
  {
    id: "agent-cli-map",
    label: "AGENT-CLI-MAP coverage of sensitive commands",
    command: process.execPath,
    args: ["scripts/check-agent-cli-map-coverage.mjs"],
    hint: "docs/maintainers/AGENT-CLI-MAP.md — add rows for new policy-sensitive run commands."
  },
  {
    id: "orphan-instructions",
    label: "Orphan module instruction files",
    command: process.execPath,
    args: ["scripts/check-orphan-instructions.mjs"],
    hint: "Each src/modules/*/instructions/*.md should be registered on a module or allowlisted."
  },
  {
    id: "principles-rules-snapshot",
    label: ".ai/PRINCIPLES.md rule id snapshot (machine canon)",
    command: process.execPath,
    args: ["scripts/check-principles-rule-snapshot.mjs"],
    hint: "After adding/removing rule|id=R### lines, update scripts/fixtures/principles-rule-ids.json."
  },
  {
    id: "governance-doc-order",
    label: "Agent source-of-truth path order snapshot",
    command: process.execPath,
    args: ["scripts/check-governance-doc-order.mjs"],
    hint: "If you reorder .ai/agent-source-of-truth-order.md § Source-of-truth order (agents), update scripts/fixtures/governance-doc-order.json."
  },
  {
    id: "maintainer-doc-canonicals",
    label: "Maintainer doc canon (task store + pnpm wk invocation)",
    command: process.execPath,
    args: ["scripts/check-maintainer-doc-canonicals.mjs"],
    hint: "Fix stale state.json-as-primary lines or `pnpm run wk -- run` examples; see scripts/check-maintainer-doc-canonicals.mjs."
  },
  {
    id: "documentation-data",
    label: "Documentation data JSON + ROADMAP/FEATURE-TAXONOMY drift gate",
    command: process.execPath,
    args: ["scripts/check-documentation-data.mjs"],
    hint: "Fix `src/modules/documentation/data/*.json` or regenerate maintainer markdown via `pnpm run wk run generate-document` (ROADMAP.md / FEATURE-TAXONOMY.md); see scripts/check-documentation-data.mjs."
  },
  {
    id: "ai-to-docs-drift",
    label: ".ai → docs/maintainers drift gate (Phase 56)",
    command: process.execPath,
    args: ["scripts/check-ai-to-docs-drift.mjs"],
    hint: "Edit .ai sources, run pnpm run generate-maintainer-docs-from-ai, commit outputs. See docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md."
  },
  {
    id: "orphan-ai-sources",
    label: "Orphan .ai markdown under covered maintainer trees",
    command: process.execPath,
    args: ["scripts/check-orphan-ai-sources.mjs"],
    hint: "Add missing .ai paths to docs/maintainers/data/ai-to-docs-coverage.json."
  },
  {
    id: "behavior-interview-playbook",
    label: "Behavior interview playbook ↔ interview.ts question fingerprint",
    command: process.execPath,
    args: ["scripts/check-behavior-interview-playbook-alignment.mjs"],
    hint: "Keep INTERVIEW_QUESTION_IDS_FINGERPRINT and .ai/playbooks/workspace-kit-chat-behavior-interview.md HTML comment in sync with INTERVIEW_QUESTIONS."
  }
];

function runStage(stage) {
  console.error(`\n[check] ▶ ${stage.label}`);
  const res = spawnSync(stage.command, stage.args, {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
  if (res.status !== 0) {
    console.error(`\n[check] ✖ Failed: ${stage.label}`);
    console.error(`[check]   Hint: ${stage.hint}`);
    process.exit(res.status ?? 1);
  }
  console.error(`[check] ✓ ${stage.label}`);
}

for (const stage of stages) {
  runStage(stage);
}

console.error("\n[check] All stages passed.");
