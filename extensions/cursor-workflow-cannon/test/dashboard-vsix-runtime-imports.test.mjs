import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(__dirname, "../dist");

function walkJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkJsFiles(abs, out);
      continue;
    }
    if (name.endsWith(".js")) {
      out.push(abs);
    }
  }
  return out;
}

test("VSIX dist has no runtime imports from @workflow-cannon/workspace-kit", () => {
  const offenders = [];
  for (const file of walkJsFiles(distRoot)) {
    const src = readFileSync(file, "utf8");
    if (/from\s+["']@workflow-cannon\/workspace-kit/.test(src)) {
      offenders.push(path.relative(distRoot, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `packaged extension must not import workspace-kit at runtime (use type-only imports or vendored mirrors): ${offenders.join(", ")}`
  );
});
