/**
 * Consumer parity smoke test.
 * Verifies that the package exports resolve and the CLI entrypoint is accessible.
 * Exit 0 = pass, non-zero = fail.
 */

import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const failures = [];

  try {
    const pkg = await import("@workflow-cannon/workspace-kit");
    if (typeof pkg.ModuleRegistry !== "function") {
      failures.push("ModuleRegistry export missing or not a function");
    }
    if (typeof pkg.ModuleCommandRouter !== "function") {
      failures.push("ModuleCommandRouter export missing or not a function");
    }
    if (typeof pkg.validateModuleSet !== "function") {
      failures.push("validateModuleSet export missing or not a function");
    }
    if (!pkg.documentationModule) {
      failures.push("documentationModule export missing");
    }
  } catch (err) {
    failures.push(`Package import failed: ${err.message}`);
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require("@workflow-cannon/workspace-kit/package.json");
    if (!pkgJson.bin?.["workspace-kit"]) {
      failures.push("CLI bin entry missing from package.json");
    }
  } catch (err) {
    failures.push(`Package.json resolution failed: ${err.message}`);
  }

  if (failures.length > 0) {
    console.error("Parity smoke FAILED:");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log("Parity smoke passed.");
}

main();
