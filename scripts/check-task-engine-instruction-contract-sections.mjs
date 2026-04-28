#!/usr/bin/env node
/**
 * Verify generated task-engine instruction sections against command contracts.
 *
 * Use `--write` to refresh the bounded generated blocks. Human prose outside the
 * markers stays hand-editable; command facts inside markers come from schemas
 * and transition metadata.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const PILOT_SCHEMA_PATH = path.join(ROOT, "schemas/pilot-run-args.snapshot.json");
const TRANSITIONS_PATH = path.join(ROOT, "src/modules/task-engine/transitions.ts");
const INSTRUCTION_DIR = path.join(ROOT, "src/modules/task-engine/instructions");

const FIELD_DESCRIPTIONS = {
  action: "Transition action.",
  actor: "Actor recorded on transition evidence or task mutation metadata.",
  clientMutationId: "Retry/idempotency key.",
  config: "Invocation-local config override.",
  expectedPlanningGeneration: "Optimistic concurrency token from a prior read response.",
  id: "Task id.",
  policyApproval: "JSON policy approval payload for sensitive run commands.",
  status: "Initial task status.",
  taskId: "Task id.",
  title: "Task title.",
  updates: "Mutable task field patch."
};

const COMMANDS = [
  { name: "run-transition", file: "run-transition.md", sections: ["args", "actions"] },
  { name: "create-task", file: "create-task.md", sections: ["args"] },
  { name: "update-task", file: "update-task.md", sections: ["args"] }
];

function fail(message) {
  console.error(`[check-task-engine-instruction-contract-sections] ${message}`);
  process.exitCode = 1;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function schemaForCommand(snapshot, commandName) {
  const schema = snapshot.commands?.[commandName];
  if (!schema) {
    throw new Error(`Missing pilot schema for ${commandName}`);
  }
  return schema;
}

function typeLabel(schema) {
  if (!schema || typeof schema !== "object") {
    return "unknown";
  }
  if (Array.isArray(schema.enum)) {
    return `string (${schema.enum.map((v) => `\`${v}\``).join(", ")})`;
  }
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map(typeLabel).join(" or ");
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map((v) => `\`${v}\``).join(" or ");
  }
  return typeof schema.type === "string" ? `\`${schema.type}\`` : "object";
}

function orderedFields(schema) {
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const names = Object.keys(props);
  return [
    ...names.filter((name) => required.has(name)),
    ...names.filter((name) => !required.has(name))
  ];
}

function renderArgsSection(commandName, schema) {
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const lines = [
    "| Field | Type | Required | Description |",
    "| --- | --- | --- | --- |"
  ];
  for (const field of orderedFields(schema)) {
    lines.push(
      `| \`${field}\` | ${typeLabel(props[field])} | ${required.has(field) ? "yes" : "no"} | ${
        FIELD_DESCRIPTIONS[field] ?? "Command argument."
      } |`
    );
  }
  return lines.join("\n");
}

function readTransitionTable() {
  const source = fs.readFileSync(TRANSITIONS_PATH, "utf8");
  const match = /const ALLOWED_TRANSITIONS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(source);
  if (!match) {
    throw new Error("Unable to parse ALLOWED_TRANSITIONS from transitions.ts");
  }
  const rows = [];
  const entryRe = /"([^"]+)->([^"]+)":\s*\{\s*action:\s*"([^"]+)"\s*\}/g;
  let entry;
  while ((entry = entryRe.exec(match[1])) !== null) {
    rows.push({ from: entry[1], to: entry[2], action: entry[3] });
  }
  if (rows.length === 0) {
    throw new Error("No transition rows parsed from transitions.ts");
  }
  return rows;
}

function renderActionsSection() {
  const grouped = new Map();
  for (const row of readTransitionTable()) {
    const list = grouped.get(row.from) ?? [];
    list.push(`\`${row.action}\` → ${row.to}`);
    grouped.set(row.from, list);
  }
  const lines = [
    "| Current State | Allowed Actions |",
    "| --- | --- |"
  ];
  for (const [from, actions] of grouped.entries()) {
    lines.push(`| \`${from}\` | ${actions.join(", ")} |`);
  }
  return lines.join("\n");
}

function block(commandName, sectionName, content) {
  const start = `<!-- workspace-kit:generated task-engine-instruction-contract command=${commandName} section=${sectionName} start -->`;
  const end = `<!-- workspace-kit:generated task-engine-instruction-contract command=${commandName} section=${sectionName} end -->`;
  return `${start}\n${content}\n${end}`;
}

function verifyOrWrite(filePath, commandName, sectionName, content) {
  const expected = block(commandName, sectionName, content);
  const start = `<!-- workspace-kit:generated task-engine-instruction-contract command=${commandName} section=${sectionName} start -->`;
  const end = `<!-- workspace-kit:generated task-engine-instruction-contract command=${commandName} section=${sectionName} end -->`;
  const current = fs.readFileSync(filePath, "utf8");
  const startIdx = current.indexOf(start);
  const endIdx = current.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    fail(`Missing generated block ${commandName}/${sectionName} in ${path.relative(ROOT, filePath)}`);
    return;
  }
  const endWithMarker = endIdx + end.length;
  const actual = current.slice(startIdx, endWithMarker);
  if (actual === expected) {
    return;
  }
  if (WRITE) {
    fs.writeFileSync(filePath, `${current.slice(0, startIdx)}${expected}${current.slice(endWithMarker)}`);
    return;
  }
  fail(
    `Generated block drift for ${commandName}/${sectionName} in ${path.relative(
      ROOT,
      filePath
    )}. Run: node scripts/check-task-engine-instruction-contract-sections.mjs --write`
  );
}

const snapshot = loadJson(PILOT_SCHEMA_PATH);
for (const command of COMMANDS) {
  const filePath = path.join(INSTRUCTION_DIR, command.file);
  const schema = schemaForCommand(snapshot, command.name);
  for (const section of command.sections) {
    const content = section === "actions" ? renderActionsSection() : renderArgsSection(command.name, schema);
    verifyOrWrite(filePath, command.name, section, content);
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(
  `[check-task-engine-instruction-contract-sections] OK: ${COMMANDS.length} task-engine instruction file(s) verified.`
);
