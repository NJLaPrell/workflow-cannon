import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const SCHEMA_PATH = path.join(ROOT, "schemas/task-engine-run-contracts.schema.json");
const PKG_PATH = path.join(ROOT, "package.json");

function fail(message) {
  console.error(`[check-task-engine-run-contracts] ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to parse JSON at ${filePath}: ${error.message}`);
  }
}

const manifest = loadJson(MANIFEST_PATH);
const pkg = loadJson(PKG_PATH);
const schema = loadJson(SCHEMA_PATH);

const schemaPkg =
  schema?.properties?.packageVersion && typeof schema.properties.packageVersion === "object"
    ? schema.properties.packageVersion.const
    : undefined;
if (schemaPkg !== pkg.version) {
  fail(
    `schema properties.packageVersion.const (${schemaPkg}) does not match package.json version (${pkg.version}).`
  );
}

const commandNames = manifest.filter((r) => r.moduleId === "task-engine").map((r) => r.name);
if (commandNames.length === 0) {
  fail('Could not discover task-engine command names from builtin-run-command-manifest.json (moduleId "task-engine").');
}

const commandSet = new Set(commandNames);
const schemaCommands = schema?.properties?.commands?.properties
  ? Object.keys(schema.properties.commands.properties)
  : [];
const schemaSet = new Set(schemaCommands);

const missingInSchema = [...commandSet].filter((name) => !schemaSet.has(name));
const missingInModule = [...schemaSet].filter((name) => !commandSet.has(name));
const missingRequiredList = [...commandSet].filter(
  (name) =>
    !Array.isArray(schema?.properties?.commands?.required) ||
    !schema.properties.commands.required.includes(name)
);

if (missingInSchema.length > 0) {
  fail(`Missing command contract(s) in schema: ${missingInSchema.join(", ")}`);
}
if (missingInModule.length > 0) {
  fail(`Schema includes unknown command(s): ${missingInModule.join(", ")}`);
}
if (missingRequiredList.length > 0) {
  fail(`Schema commands.required missing: ${missingRequiredList.join(", ")}`);
}

for (const name of commandNames) {
  const contract = schema.properties.commands.properties[name];
  const hasTopLevelArgs = Boolean(contract?.properties?.args);
  const hasTopLevelResponse = Boolean(contract?.properties?.responseData);
  const hasAllOf = Array.isArray(contract?.allOf) && contract.allOf.length > 0;
  const hasRef = typeof contract?.$ref === "string" && contract.$ref.length > 0;
  if (!(hasTopLevelArgs || hasAllOf || hasRef) || !(hasTopLevelResponse || hasAllOf || hasRef)) {
    fail(`Command '${name}' contract must define args and responseData.`);
  }
}

console.log(
  `[check-task-engine-run-contracts] OK: ${commandNames.length} commands matched; schema version ${schema.schemaVersion}; package ${pkg.version}.`
);
