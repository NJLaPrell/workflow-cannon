#!/usr/bin/env node
/**
 * CI: prove list-plugins + inspect-plugin against docs/examples/claude-plugins (Phase 61 fixture).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const cli = path.join(ROOT, "dist", "cli.js");
const roots = ["docs/examples/claude-plugins"];

function run(args) {
  const r = spawnSync(process.execPath, [cli, "run", ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env }
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

const out = run([
  "list-plugins",
  JSON.stringify({
    config: { plugins: { discoveryRoots: roots } }
  })
]);
const data = JSON.parse(out);
if (!data.ok) {
  console.error("[ci-plugin-fixture-smoke] list-plugins failed:", out);
  process.exit(1);
}
const plugins = data.data?.plugins ?? [];
const sample = plugins.find((p) => p.name === "wc-phase-61-sample");
if (!sample || !sample.manifestValid) {
  console.error("[ci-plugin-fixture-smoke] expected valid wc-phase-61-sample plugin:", JSON.stringify(plugins, null, 2));
  process.exit(1);
}

const insp = run([
  "inspect-plugin",
  JSON.stringify({
    pluginName: "wc-phase-61-sample",
    config: { plugins: { discoveryRoots: roots } }
  })
]);
const inspJson = JSON.parse(insp);
if (!inspJson.ok || !inspJson.data?.plugin?.manifestValid) {
  console.error("[ci-plugin-fixture-smoke] inspect-plugin failed:", insp);
  process.exit(1);
}

console.log("[ci-plugin-fixture-smoke] OK");
