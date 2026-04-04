import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverSkillPacks } from "../dist/modules/skills/discovery.js";
import { validateSidecarJson } from "../dist/modules/skills/manifest-validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

test("validateSidecarJson accepts fixture manifest", () => {
  const raw = readFileSync(path.join(ROOT, "scripts/fixtures/skill-pack-manifest-min.json"), "utf8");
  const v = validateSidecarJson(JSON.parse(raw));
  assert.equal(v.ok, true);
});

test("discoverSkillPacks lists sample-wc-skill in this repo", () => {
  const res = discoverSkillPacks(ROOT, undefined);
  assert.equal(res.ok, true);
  const ids = res.packs.map((p) => p.id);
  assert.ok(ids.includes("sample-wc-skill"));
});

test("discoverSkillPacks fails closed on duplicate skill ids across roots", () => {
  const tmp = path.join(ROOT, "artifacts", "skills-dup-test");
  rmSync(tmp, { recursive: true, force: true });
  const a = path.join(tmp, "a", "dup");
  const b = path.join(tmp, "b", "dup");
  mkdirSync(path.join(a), { recursive: true });
  mkdirSync(path.join(b), { recursive: true });
  writeFileSync(
    path.join(a, "SKILL.md"),
    "---\nname: Dup A\ndescription: x\n---\n\nbody\n",
    "utf8"
  );
  writeFileSync(
    path.join(b, "SKILL.md"),
    "---\nname: Dup B\ndescription: y\n---\n\nbody\n",
    "utf8"
  );
  const res = discoverSkillPacks(tmp, { skills: { discoveryRoots: ["a", "b"] } });
  assert.equal(res.ok, false);
  assert.equal(res.code, "skill-duplicate-id");
  rmSync(tmp, { recursive: true, force: true });
});
