import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';

import { runCli } from '../dist/cli.js';
import { cliPerfTracer } from '../dist/core/cli-perf-trace.js';

function createCapture() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

async function createDoctorFixture(rootDir) {
  const workspaceKitDir = path.join(rootDir, '.workspace-kit');
  const schemasDir = path.join(rootDir, 'schemas');
  await fs.mkdir(workspaceKitDir, { recursive: true });
  await fs.mkdir(schemasDir, { recursive: true });

  await fs.writeFile(
    path.join(rootDir, 'workspace-kit.profile.json'),
    JSON.stringify({
      project: { name: 'fixture-project' },
      packageManager: 'pnpm',
      commands: { test: 'pnpm test', lint: 'pnpm lint', typecheck: 'pnpm check' },
      github: { defaultBranch: 'main' }
    }, null, 2)
  );

  await fs.writeFile(
    path.join(schemasDir, 'workspace-kit-profile.schema.json'),
    JSON.stringify({ type: 'object' }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1 }, null, 2)
  );

  await fs.writeFile(
    path.join(workspaceKitDir, 'owned-paths.json'),
    JSON.stringify({ schemaVersion: 1, ownedPaths: [] }, null, 2)
  );

  const stamp = {
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: 'v22.11.0',
    arch: process.arch,
    platform: process.platform,
    abi: process.versions.modules,
    packageRoot: process.cwd(),
    checkedAt: '2026-05-12T00:00:00.000Z'
  };
  await fs.writeFile(path.join(workspaceKitDir, 'runtime.json'), JSON.stringify(stamp, null, 2));
  await fs.mkdir(path.join(workspaceKitDir, 'bin'), { recursive: true });
  await fs.writeFile(path.join(workspaceKitDir, 'bin', 'wk'), '# dummy launcher', 'utf8');

  const tasksDir = path.join(workspaceKitDir, 'tasks');
  await fs.mkdir(tasksDir, { recursive: true });
  const dbPath = path.join(tasksDir, 'workspace-kit.db');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_planning_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    task_store_json TEXT NOT NULL
  );`);
  const emptyTaskDoc = JSON.stringify({
    schemaVersion: 1,
    tasks: [],
    transitionLog: [],
    mutationLog: [],
    lastUpdated: new Date().toISOString()
  });
  db.prepare('INSERT OR REPLACE INTO workspace_planning_state (id, task_store_json) VALUES (1, ?)').run(emptyTaskDoc);
  db.close();
}

test('CLI mutation safety and performance boundaries', async (t) => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'wk-cli-mutation-'));
  await createDoctorFixture(fixtureRoot);

  const originalStderrWrite = process.stderr.write;
  let stderrOutput = '';
  process.stderr.write = (chunk, encoding, callback) => {
    stderrOutput += chunk.toString();
    if (typeof callback === 'function') callback();
    return true;
  };

  // Mutation command: clear-agent-activity (mutates state)
  process.env.WORKSPACE_KIT_CLI_PERF_TRACE = 'true';
  cliPerfTracer.reset();
  stderrOutput = '';
  const capture = createCapture();
  const mutationCode = await runCli(['run', 'clear-agent-activity', '{}'], { cwd: fixtureRoot, ...capture });
  assert.equal(mutationCode, 0, 'mutation command should succeed');
  assert.ok(stderrOutput.includes('span=policy/session grant checks'), 'policy span should be present');
  assert.ok(stderrOutput.includes('span=planningGenerationPrelude'), 'planning generation span should be present');
  assert.ok(stderrOutput.includes('span=tryAutoCheckpointBeforeRun'), 'checkpoint span should run for mutation');

  // Unknown command defaults to safe behavior
  delete process.env.WORKSPACE_KIT_CLI_PERF_TRACE;
  cliPerfTracer.reset();
  stderrOutput = '';
  const unknownCapture = createCapture();
  const unknownCode = await runCli(['run', 'unknown-command', '{}'], { cwd: fixtureRoot, ...unknownCapture });
  assert.equal(unknownCode, 1, 'unknown command should return validation failure code');
  assert.ok(!stderrOutput.includes('span='), 'no performance spans should be emitted for unknown command');

  process.stderr.write = originalStderrWrite;
  delete process.env.WORKSPACE_KIT_CLI_PERF_TRACE;
  await rm(fixtureRoot, { recursive: true, force: true });
});
