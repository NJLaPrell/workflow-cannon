#!/usr/bin/env node
/**
 * Staged `pnpm run check` — prints a banner per step and fix hints on failure.
 * @see docs/maintainers/AGENTS.md (check composition)
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
    label: "AGENTS.md source-of-truth order snapshot",
    command: process.execPath,
    args: ["scripts/check-governance-doc-order.mjs"],
    hint: "If you reorder docs/maintainers/AGENTS.md § Source-of-truth, update scripts/fixtures/governance-doc-order.json."
  },
  {
    id: "maintainer-doc-canonicals",
    label: "Maintainer doc canon (task store + pnpm wk invocation)",
    command: process.execPath,
    args: ["scripts/check-maintainer-doc-canonicals.mjs"],
    hint: "Fix stale state.json-as-primary lines or `pnpm run wk -- run` examples; see scripts/check-maintainer-doc-canonicals.mjs."
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
