import { execFileSync } from "node:child_process";

const taskId = "T100065";

function wk(command, args) {
  const out = execFileSync("pnpm", ["exec", "wk", "run", command, JSON.stringify(args)], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });
  return JSON.parse(out);
}

const got = wk("get-task", { taskId });
if (got.ok !== true) {
  throw new Error(JSON.stringify(got));
}

const metadata = { ...(got.data.task.metadata ?? {}) };
metadata.deliveryEvidence = {
  schemaVersion: 1,
  branchName: "feature/T100065-cae-authoring-summary",
  prUrl: "https://github.com/NJLaPrell/workflow-cannon/pull/233",
  prNumber: 233,
  baseBranch: "release/phase-82",
  mergeSha: "6508caec7fc67ea1a143c1af4b221d7051f92f12",
  checks: [
    { name: "release-readiness", conclusion: "success" },
    { name: "test", conclusion: "success" }
  ],
  validationCommands: [
    {
      command:
        'PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" pnpm run build && "$HOME/.nvm/versions/node/v22.22.2/bin/node" --test test/cae-authoring-summary.test.mjs test/cae-cli-read-only-schema.test.mjs',
      exitCode: 0
    },
    {
      command:
        'PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" "$HOME/.nvm/versions/node/v22.22.2/bin/node" scripts/check-builtin-command-manifest.mjs',
      exitCode: 0
    }
  ]
};

const updated = wk("update-task", {
  taskId,
  expectedPlanningGeneration: got.data.planningGeneration,
  actor: "njlaprell@gmail.com",
  updates: { metadata }
});

console.log(
  JSON.stringify(
    {
      ok: updated.ok,
      code: updated.code,
      planningGeneration: updated.data?.planningGeneration ?? null,
      hasDeliveryEvidence: Boolean(updated.data?.task?.metadata?.deliveryEvidence)
    },
    null,
    2
  )
);