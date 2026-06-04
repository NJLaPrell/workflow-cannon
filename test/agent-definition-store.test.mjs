import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { KIT_SQLITE_USER_VERSION, kitSqliteHasAgentDefinitionBridge, prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import { getAgentDefinitionById, listAgentDefinitions, parseAgentDefinitionInput, registerAgentDefinition, retireAgentDefinition } from "../dist/modules/task-engine/agent-definition-store.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(root, "fixtures", "agent-orchestration");
function loadFixture(name) { return JSON.parse(fs.readFileSync(path.join(fixturesRoot, name), "utf8")); }
async function openDb() { const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-agent-definition-")); const db = new Database(path.join(workspace, "workspace-kit.db")); prepareKitSqliteDatabase(db); return db; }
test("v31 migration adds AgentDefinition bridge columns", async () => { const db = await openDb(); try { assert.ok(KIT_SQLITE_USER_VERSION >= 33); assert.equal(db.pragma("user_version", { simple: true }), KIT_SQLITE_USER_VERSION); assert.equal(kitSqliteHasAgentDefinitionBridge(db), true); } finally { db.close(); } });
test("registers orchestration and task-worker AgentDefinition fixtures", async () => { const db = await openDb(); const now = "2026-05-31T12:00:00.000Z"; try { for (const file of ["agent-definition-orchestration-agent.v1.json", "agent-definition-task-worker.v1.json"]) { const fixture = loadFixture(file); const parsed = parseAgentDefinitionInput({ agentDefinition: fixture }); assert.equal(parsed.ok, true, file); registerAgentDefinition(db, parsed.definition, now); } assert.equal(listAgentDefinitions(db, { orchestrationOnly: true }).length, 2); } finally { db.close(); } });
test("legacy subagent rows remain readable", async () => { const db = await openDb(); const now = "2026-05-31T12:00:00.000Z"; try { db.prepare(`INSERT INTO kit_subagent_definitions (id, display_name, description, allowed_commands_json, retired, metadata_json, created_at, updated_at) VALUES (?,?,?,?,0,?,?,?)`).run("legacy-helper", "Legacy Helper", "Pre-bridge subagent", "[]", null, now, now); const row = getAgentDefinitionById(db, "legacy-helper"); assert.equal(row?.orchestrationReady, false); } finally { db.close(); } });
test("rejects invalid AgentDefinition payloads", () => { assert.equal(parseAgentDefinitionInput({ agentDefinitionId: "bad id" }).ok, false); });
test("retire marks definition retired", async () => { const db = await openDb(); const now = "2026-05-31T12:00:00.000Z"; try { const fixture = loadFixture("agent-definition-task-worker.v1.json"); registerAgentDefinition(db, fixture, now); assert.equal(retireAgentDefinition(db, fixture.agentDefinitionId, now), true); } finally { db.close(); } });
