import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Phase 91 guard: Dashboard-originated kit flows should stay in the webview drawer
 * (`#wc-drawer-host` contract). Native `showInputBox` / `showQuickPick` in
 * `DashboardViewProvider` are regressions unless explicitly re-justified in README.
 */
test("dashboard: DashboardViewProvider has no await showInputBox / showQuickPick", () => {
  const p = path.join(__dirname, "../src/views/dashboard/DashboardViewProvider.ts");
  const src = fs.readFileSync(p, "utf8");
  const lines = src.split(/\r?\n/);
  const bad = [];
  const re = /\bawait\s+vscode\.window\.(showInputBox|showQuickPick)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }
    if (re.test(line)) {
      bad.push(`${String(i + 1)}:${line.trim()}`);
    }
  }
  assert.equal(
    bad.length,
    0,
    `Native input/pick prompts in DashboardViewProvider — use the dashboard drawer instead:\n${bad.join("\n")}`
  );
});
