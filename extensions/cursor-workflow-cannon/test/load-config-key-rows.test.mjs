import test from "node:test";
import assert from "node:assert/strict";

import { loadConfigKeyRows } from "../dist/views/config/load-config-key-rows.js";

function mockClient(handlers) {
  return {
    async config(argv) {
      const key = argv.join(" ");
      if (handlers[key]) return handlers[key]();
      return { code: 1, stdout: "", stderr: "unexpected argv: " + key };
    }
  };
}

test("loadConfigKeyRows maps keys and effective values", async () => {
  const client = mockClient({
    "list --json": () => ({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        data: {
          keys: [
            {
              key: "kit.currentPhase",
              type: "number",
              description: "Phase",
              default: 1,
              domainScope: "project",
              owningModule: "kit",
              exposure: "public",
              sensitive: false,
              requiresApproval: false,
              requiresRestart: false,
              writableLayers: ["project"]
            }
          ]
        }
      }),
      stderr: ""
    }),
    resolve: () => ({
      code: 0,
      stdout: JSON.stringify({ kit: { currentPhase: 106 } }),
      stderr: ""
    })
  });
  const { rows, errors, includeAll } = await loadConfigKeyRows(client, { includeAll: false });
  assert.equal(errors.length, 0);
  assert.equal(includeAll, false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "kit.currentPhase");
  assert.equal(rows[0].effectiveValue, 106);
});

test("loadConfigKeyRows includeAll passes --all to list", async () => {
  let listArgv = "";
  const client = mockClient({
    "list --json --all": () => {
      listArgv = "all";
      return { code: 0, stdout: JSON.stringify({ ok: true, data: { keys: [] } }), stderr: "" };
    },
    resolve: () => ({ code: 0, stdout: "{}", stderr: "" })
  });
  await loadConfigKeyRows(client, { includeAll: true });
  assert.equal(listArgv, "all");
});

test("loadConfigKeyRows records list failure", async () => {
  const client = mockClient({
    "list --json": () => ({ code: 2, stdout: "", stderr: "boom" }),
    resolve: () => ({ code: 0, stdout: "{}", stderr: "" })
  });
  const { rows, errors } = await loadConfigKeyRows(client);
  assert.equal(rows.length, 0);
  assert.match(errors.join("\n"), /config list exited 2/);
});

test("loadConfigKeyRows records resolve failure", async () => {
  const client = mockClient({
    "list --json": () => ({
      code: 0,
      stdout: JSON.stringify({ ok: true, data: { keys: [] } }),
      stderr: ""
    }),
    resolve: () => ({ code: 1, stdout: "", stderr: "nope" })
  });
  const { errors } = await loadConfigKeyRows(client);
  assert.match(errors.join("\n"), /config resolve exited 1/);
});

test("loadConfigKeyRows records malformed list JSON", async () => {
  const client = mockClient({
    "list --json": () => ({ code: 0, stdout: "not-json", stderr: "" }),
    resolve: () => ({ code: 0, stdout: "{}", stderr: "" })
  });
  const { errors } = await loadConfigKeyRows(client);
  assert.match(errors.join("\n"), /stdout is not JSON/);
});
