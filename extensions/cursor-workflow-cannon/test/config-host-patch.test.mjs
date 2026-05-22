import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("handleConfigSetMessage patches row in place instead of reloading full list", () => {
  const src = readFileSync(path.join(__dirname, "../src/views/config/config-host.ts"), "utf8");
  assert.match(src, /postConfigRowPatched/);
  const setBlock = src.slice(src.indexOf("export async function handleConfigSetMessage"));
  const nextFn = setBlock.indexOf("export async function handleConfigUnsetMessage");
  const body = setBlock.slice(0, nextFn);
  assert.doesNotMatch(body, /pushConfigListToWebview\(client, webview, includeAll\)/);
});

test("handleConfigValidateKeyMessage exists for blur validation", () => {
  const src = readFileSync(path.join(__dirname, "../src/views/config/config-host.ts"), "utf8");
  assert.match(src, /handleConfigValidateKeyMessage/);
  assert.match(src, /validateKeyResult/);
});
