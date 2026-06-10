import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// List of dashboard slice commands to benchmark
const commands = [
  'wk run dashboard-overview-slice',
  'wk run dashboard-queue-slice',
  'wk run dashboard-status-slice',
  'wk run dashboard-agent-activity-slice',
  'wk run dashboard-agent-types-slice',
  'wk run dashboard-bootstrap-slices',
  'wk run dashboard-summary projection=full'
];

function runBenchmark(cmd: string) {
  const start = performance.now();
  try {
    execSync(cmd, { stdio: 'ignore', env: { ...process.env, WORKSPACE_KIT_CLI_PERF_TRACE: '1' } });
  } catch (e) {
    // ignore errors for benchmarking purposes
  }
  const duration = performance.now() - start;
  console.log(`[benchmark] { "command": "${cmd}", "durationMs": ${duration.toFixed(2)} }`);
}

for (const cmd of commands) {
  console.log(`Running benchmark for: ${cmd}`);
  runBenchmark(cmd);
}
