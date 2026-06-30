import { execSync } from 'node:child_process';
import assert from 'node:assert';

// Run the benchmark script and capture output
const output = execSync('node --experimental-strip-types scripts/benchmark-dashboard.ts', {
  encoding: 'utf8',
  env: { ...process.env, WORKSPACE_KIT_CLI_PERF_TRACE: '1' }
});

// Extract lines that contain benchmark JSON payloads
const benchmarkLines = output.split('\n').filter(line => line.startsWith('[benchmark]'));

// Ensure we got metrics for each command
assert(benchmarkLines.length >= 7, `Expected at least 7 benchmark lines, got ${benchmarkLines.length}`);

// Parse and validate each metric payload
benchmarkLines.forEach(line => {
  const jsonPart = line.replace(/^\[benchmark\]\s*/, '').trim();
  const data = JSON.parse(jsonPart);
  assert(data.command, 'Missing command in benchmark payload');
  assert(typeof data.durationMs === 'string' || typeof data.durationMs === 'number', 'durationMs should be present');
});

console.log('Dashboard performance benchmark test passed');
