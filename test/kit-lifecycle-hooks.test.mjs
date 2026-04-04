import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("KitLifecycleHookBus observe mode traces after-module-command", async () => {
  const { createKitLifecycleHookBus } = await import(
    pathToFileURL(path.join(process.cwd(), "dist/core/kit-lifecycle-hooks.js")).href
  );
  const dir = await mkdtemp(path.join(tmpdir(), "wk-hooks-"));
  try {
    const hooksDir = path.join(dir, "hooks");
    await mkdir(hooksDir, { recursive: true });
    const handlerPath = path.join(hooksDir, "echo.mjs");
    await writeFile(
      handlerPath,
      `export async function handle() { return { verdict: "allow" }; }\n`,
      "utf8"
    );
    const effective = {
      kit: {
        lifecycleHooks: {
          enabled: true,
          mode: "observe",
          traceRelativePath: ".workspace-kit/kit/traces.jsonl",
          handlers: [
            {
              id: "echo",
              order: 0,
              events: ["after-module-command"],
              kind: "node",
              modulePath: "hooks/echo.mjs"
            }
          ]
        }
      }
    };
    const bus = createKitLifecycleHookBus(dir, effective);
    assert.equal(bus.isEnabled(), true);
    await bus.emitAfterModuleCommand("list-tasks", true, "ok");
    const tracePath = path.join(dir, ".workspace-kit/kit/traces.jsonl");
    const lines = (await readFile(tracePath, "utf8")).trim().split("\n");
    assert.ok(lines.length >= 1);
    const row = JSON.parse(lines[lines.length - 1]);
    assert.equal(row.event, "after-module-command");
    assert.equal(row.handlerId, "echo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
