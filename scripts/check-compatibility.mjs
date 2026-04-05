#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const MATRIX_PATH = resolve(ROOT, "docs/maintainers/data/compatibility-matrix.json");
const SCHEMA_PATH = resolve(ROOT, "schemas/compatibility-matrix.schema.json");
const REPORT_PATH = resolve(ROOT, "artifacts/compatibility-report.json");

function isSemver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

function getRequired(value, key, failures, label) {
  if (!(key in value)) {
    failures.push(`${label}: missing '${key}'`);
    return undefined;
  }
  return value[key];
}

async function main() {
  const failures = [];
  const warnings = [];

  const [
    { ModuleRegistry, POLICY_TRACE_SCHEMA_VERSION },
    {
      workspaceConfigModule,
      documentationModule,
      taskEngineModule,
      approvalsModule,
      planningModule,
      improvementModule,
      skillsModule,
      pluginsModule,
      subagentsModule,
      teamExecutionModule
    }
  ] = await Promise.all([import("../dist/index.js"), import("../dist/modules/index.js")]);

  let matrix;
  let schema;
  try {
    matrix = JSON.parse(await readFile(MATRIX_PATH, "utf8"));
  } catch {
    console.error(`FAIL: cannot read ${MATRIX_PATH}`);
    process.exit(1);
  }

  try {
    schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  } catch {
    console.error(`FAIL: cannot read ${SCHEMA_PATH}`);
    process.exit(1);
  }

  const requiredTop = Array.isArray(schema.required) ? schema.required : [];
  for (const key of requiredTop) {
    if (!(key in matrix)) failures.push(`matrix: missing top-level '${key}'`);
  }

  if (!Array.isArray(matrix.modules) || matrix.modules.length === 0) {
    failures.push("matrix.modules must be a non-empty array");
  }

  const modules = [
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule,
    skillsModule,
    pluginsModule,
    subagentsModule,
    teamExecutionModule
  ];

  try {
    new ModuleRegistry(modules);
  } catch (error) {
    failures.push(`module-registry validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const matrixById = new Map((matrix.modules || []).map((entry) => [entry.id, entry]));
  for (const mod of modules) {
    const reg = mod.registration;
    if (!isSemver(reg.version)) failures.push(`module '${reg.id}' has non-semver version '${reg.version}'`);
    if (reg.contractVersion !== "1") failures.push(`module '${reg.id}' contractVersion must be '1'`);

    const row = matrixById.get(reg.id);
    if (!row) {
      failures.push(`matrix missing module row for '${reg.id}'`);
      continue;
    }
    const rowVersion = getRequired(row, "version", failures, `matrix.modules.${reg.id}`);
    const rowContract = getRequired(row, "contractVersion", failures, `matrix.modules.${reg.id}`);
    if (rowVersion !== reg.version) {
      failures.push(`matrix version mismatch for '${reg.id}': matrix=${rowVersion} runtime=${reg.version}`);
    }
    if (rowContract !== reg.contractVersion) {
      failures.push(`matrix contract mismatch for '${reg.id}': matrix=${rowContract} runtime=${reg.contractVersion}`);
    }
  }

  const runtime = matrix.runtime || {};
  if (runtime.policyTraceSchema !== POLICY_TRACE_SCHEMA_VERSION) {
    failures.push(
      `matrix runtime.policyTraceSchema (${runtime.policyTraceSchema}) must match runtime (${POLICY_TRACE_SCHEMA_VERSION})`
    );
  }

  const channels = Array.isArray(matrix.channels) ? matrix.channels : [];
  const channelNames = new Set(channels.map((c) => c.name));
  for (const required of ["canary", "stable", "lts"]) {
    if (!channelNames.has(required)) failures.push(`matrix.channels missing '${required}'`);
  }
  for (const channel of channels) {
    if (!channel.npmDistTag) warnings.push(`channel '${channel.name}' missing npmDistTag`);
  }

  await mkdir(resolve(ROOT, "artifacts"), { recursive: true });
  await writeFile(
    REPORT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        ok: failures.length === 0,
        failures,
        warnings
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  if (failures.length > 0) {
    console.error("Compatibility check FAILED:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Compatibility check passed.");
  for (const warning of warnings) console.log(`warning: ${warning}`);
}

main();
