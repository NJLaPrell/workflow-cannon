import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentActivityLabel, withCommandBoundaryActivityBestEffort } from "../dist/modules/task-engine/agent-activity-recorder.js";
import {
  clearAgentActivityLeases,
  listCurrentAgentActivityLeases,
  setAgentActivityLease
} from "../dist/modules/task-engine/agent-activity-store.js";

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function cloneRow(row) {
  return row ? JSON.parse(JSON.stringify(row)) : undefined;
}

function makeFakeActivityDb() {
  const rows = new Map();
  const tableName = "kit_agent_activity_leases";

  function sortedRows() {
    return [...rows.values()].sort((a, b) => {
      const updated = String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
      if (updated !== 0) return updated;
      const started = String(b.started_at ?? "").localeCompare(String(a.started_at ?? ""));
      if (started !== 0) return started;
      return String(a.activity_id ?? "").localeCompare(String(b.activity_id ?? ""));
    });
  }

  function deleteMatching(params, sql) {
    let index = 0;
    const matchers = [];
    if (sql.includes("activity_id = ?")) {
      const expected = String(params[index++]);
      matchers.push((row) => row.activity_id === expected);
    }
    if (sql.includes("agent_id = ?")) {
      const expected = String(params[index++]);
      matchers.push((row) => row.agent_id === expected);
    }
    if (sql.includes("session_id = ?")) {
      const expected = String(params[index++]);
      matchers.push((row) => row.session_id === expected);
    }
    let changes = 0;
    for (const [activityId, row] of rows.entries()) {
      if (matchers.every((fn) => fn(row))) {
        rows.delete(activityId);
        changes += 1;
      }
    }
    return { changes };
  }

  return {
    rows,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      return {
        get(...params) {
          if (normalized.startsWith("SELECT 1 AS ok FROM sqlite_master")) {
            return params[0] === tableName ? { ok: 1 } : undefined;
          }
          if (normalized === `SELECT started_at FROM ${tableName} WHERE activity_id = ?`) {
            const row = rows.get(String(params[0]));
            return row ? { started_at: row.started_at } : undefined;
          }
          if (normalized === `SELECT * FROM ${tableName} WHERE activity_id = ?`) {
            return cloneRow(rows.get(String(params[0])));
          }
          throw new Error(`Unexpected get SQL: ${normalized}`);
        },
        run(...params) {
          if (normalized.startsWith(`INSERT INTO ${tableName} (`)) {
            const [
              activityId,
              agentId,
              sessionId,
              agentDefinitionId,
              assignmentId,
              kind,
              label,
              currentStep,
              hostHint,
              modelTier,
              modelHint,
              taskId,
              command,
              phaseKey,
              prNumber,
              version,
              detailsJson,
              startedAt,
              updatedAt,
              expiresAt
            ] = params;
            const existing = rows.get(String(activityId));
            rows.set(String(activityId), {
              activity_id: String(activityId),
              agent_id: String(agentId),
              session_id: String(sessionId),
              agent_definition_id: agentDefinitionId ?? null,
              assignment_id: assignmentId ?? null,
              kind: String(kind),
              label: String(label),
              current_step: currentStep ?? null,
              host_hint: hostHint ?? null,
              model_tier: modelTier ?? null,
              model_hint: modelHint ?? null,
              task_id: taskId ?? null,
              command: command ?? null,
              phase_key: phaseKey ?? null,
              pr_number: prNumber ?? null,
              version: version ?? null,
              details_json: detailsJson ?? null,
              started_at: existing?.started_at ?? String(startedAt),
              updated_at: String(updatedAt),
              expires_at: String(expiresAt)
            });
            return { changes: 1, lastInsertRowid: 1 };
          }
          if (normalized.startsWith(`UPDATE ${tableName} SET updated_at = ?, expires_at = ? WHERE activity_id = ?`)) {
            const [updatedAt, expiresAt, activityId] = params;
            const row = rows.get(String(activityId));
            if (row) {
              row.updated_at = String(updatedAt);
              row.expires_at = String(expiresAt);
            }
            return { changes: row ? 1 : 0 };
          }
          if (normalized.startsWith(`DELETE FROM ${tableName} WHERE`)) {
            return deleteMatching(params, normalized);
          }
          throw new Error(`Unexpected run SQL: ${normalized}`);
        },
        all(...params) {
          if (normalized === `SELECT * FROM ${tableName} ORDER BY updated_at DESC, started_at DESC, activity_id ASC`) {
            return sortedRows().map(cloneRow);
          }
          throw new Error(`Unexpected all SQL: ${normalized}`);
        }
      };
    }
  };
}

function makePlanning(db) {
  return {
    sqliteDual: {
      getDatabase() {
        return db;
      }
    }
  };
}

test("buildAgentActivityLabel formats boundary-oriented activity labels", () => {
  assert.equal(
    buildAgentActivityLabel({ kind: "awaiting_human_gate", details: { detail: "waiting on PR approval" } }),
    "Awaiting Human Gate - waiting on PR approval"
  );
  assert.equal(
    buildAgentActivityLabel({ kind: "reviewing_item", details: { reviewItemId: "review-item:T100060" } }),
    "Reviewing Item review-item:T100060"
  );
  assert.equal(
    buildAgentActivityLabel({ kind: "validating", details: { validationCommand: "pnpm run check" } }),
    "Validating pnpm run check"
  );
});

test("withCommandBoundaryActivityBestEffort records and clears a working_task lease", async () => {
  const db = makeFakeActivityDb();
  const planning = makePlanning(db);

  await withCommandBoundaryActivityBestEffort(
    { resolvedActor: "copilot" },
    planning,
    {
      command: "run-transition",
      kind: "working_task",
      taskId: "T777",
      phaseKey: "81"
    },
    async () => {
      const leases = listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z");
      assert.equal(leases.length, 1);
      assert.equal(leases[0].kind, "working_task");
      assert.equal(leases[0].label, "Working on Task T777");
      assert.equal(leases[0].activityId, "auto:copilot:default:run-transition:T777");
      assert.equal(leases[0].command, "run-transition");
      return "ok";
    }
  );

  assert.equal(listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z").length, 0);
});

test("withCommandBoundaryActivityBestEffort records and clears a reviewing_item lease", async () => {
  const db = makeFakeActivityDb();
  const planning = makePlanning(db);

  await withCommandBoundaryActivityBestEffort(
    { resolvedActor: "copilot" },
    planning,
    {
      command: "review-item",
      kind: "reviewing_item",
      taskId: "T778",
      details: { reviewItemId: "T778", detail: "decision accept" }
    },
    async () => {
      const leases = listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z");
      assert.equal(leases.length, 1);
      assert.equal(leases[0].kind, "reviewing_item");
      assert.equal(leases[0].label, "Reviewing Item T778");
      assert.equal(leases[0].details?.detail, "decision accept");
      return "ok";
    }
  );

  assert.equal(listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z").length, 0);
});

test("manual setAgentActivityLease remains supported alongside boundary hooks", () => {
  const db = makeFakeActivityDb();
  const lease = setAgentActivityLease(db, {
    activityId: "copilot:manual",
    agentId: "copilot",
    sessionId: "manual",
    kind: "awaiting_human_gate",
    label: "Awaiting Human Gate - waiting on PR approval",
    now: "2026-05-06T10:00:00.000Z",
    expiresAt: "2026-05-06T10:05:00.000Z",
    details: { detail: "waiting on PR approval" }
  });

  assert.equal(lease.activityId, "copilot:manual");
  assert.equal(lease.kind, "awaiting_human_gate");
  assert.equal(lease.label, "Awaiting Human Gate - waiting on PR approval");
  assert.equal(listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z").length, 1);
  assert.equal(clearAgentActivityLeases(db, { activityId: "copilot:manual" }), 1);
  assert.equal(listCurrentAgentActivityLeases(db, "2026-05-06T10:00:30.000Z").length, 0);
});
