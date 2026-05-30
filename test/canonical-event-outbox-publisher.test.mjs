import test from "node:test";
import assert from "node:assert/strict";

import { CanonicalEventOutboxPublisher } from "../dist/modules/task-engine/persistence/canonical-event-outbox-publisher.js";

function makeEvent(eventId, taskId, sequence = 0) {
  return {
    schemaVersion: 1,
    eventId,
    sequence,
    parentEventId: null,
    recordedAt: "2026-05-30T00:00:00.000Z",
    actor: { id: "test", source: "test" },
    command: { name: "run-transition", moduleId: "task-engine" },
    kind: "task.updated",
    payload: { taskId, changed: ["title"] }
  };
}

function makeRow({ id, eventId, taskId, attempts = 0, expectedVersion = 1 }) {
  return {
    id,
    eventId,
    eventKind: "task.updated",
    event: makeEvent(eventId, taskId),
    touchedTaskIds: [taskId],
    expectedTaskVersions: { [taskId]: expectedVersion },
    status: "pending",
    attempts,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    lastAttemptAt: null,
    lastError: null,
    publishedHeadSha: null,
    publishedSequenceStart: null,
    publishedSequenceEnd: null
  };
}

function makeRepository(rows) {
  const state = {
    rows: [...rows],
    resetCalls: [],
    markPublishingCalls: [],
    markPublishedCalls: [],
    markConflictCalls: [],
    markFailedCalls: []
  };
  return {
    state,
    repo: {
      enqueueCanonicalEvent() {
        throw new Error("enqueueCanonicalEvent should not be called in publisher test");
      },
      listPendingCanonicalEvents(limit) {
        return state.rows.filter((row) => row.status === "pending").slice(0, limit);
      },
      markPublishing(ids) {
        state.markPublishingCalls.push([...ids]);
        let changed = 0;
        for (const row of state.rows) {
          if (ids.includes(row.id) && row.status === "pending") {
            row.status = "publishing";
            row.attempts += 1;
            changed += 1;
          }
        }
        return changed;
      },
      markPublished(ids, publishResult) {
        state.markPublishedCalls.push({ ids: [...ids], publishResult });
        let changed = 0;
        for (const row of state.rows) {
          if (ids.includes(row.id) && row.status === "publishing") {
            row.status = "published";
            changed += 1;
          }
        }
        return changed;
      },
      markFailed(ids, error) {
        state.markFailedCalls.push({ ids: [...ids], error });
        let changed = 0;
        for (const row of state.rows) {
          if (ids.includes(row.id) && row.status === "publishing") {
            row.status = "failed";
            changed += 1;
          }
        }
        return changed;
      },
      markConflict(ids, conflict) {
        state.markConflictCalls.push({ ids: [...ids], conflict });
        let changed = 0;
        for (const row of state.rows) {
          if (ids.includes(row.id) && row.status === "publishing") {
            row.status = "conflict";
            changed += 1;
          }
        }
        return changed;
      },
      resetStalePublishing(thresholdMs) {
        state.resetCalls.push(thresholdMs);
        let changed = 0;
        for (const row of state.rows) {
          if (row.status === "publishing") {
            row.status = "pending";
            changed += 1;
          }
        }
        return changed;
      },
      getOutboxStatus() {
        return {
          schemaVersion: 1,
          counts: { total: 0, pending: 0, publishing: 0, published: 0, failed: 0, conflict: 0 },
          oldestPendingCreatedAt: null,
          latestAttemptAt: null,
          latestPublishedAt: null
        };
      }
    }
  };
}

function makeCtx(overrides = {}) {
  return {
    workspacePath: "/tmp/wk",
    runtimeVersion: "test",
    effectiveConfig: {
      tasks: {
        canonicalPublishQueue: {
          enabled: true,
          batchMaxEvents: 2,
          batchMaxAgeMs: 1234,
          intervalMs: 25,
          maxAttempts: 3
        }
      }
    },
    ...overrides
  };
}

test("publisher batches pending rows and marks them published", async () => {
  const { repo, state } = makeRepository([
    makeRow({ id: "r1", eventId: "e1", taskId: "T1", expectedVersion: 2 }),
    makeRow({ id: "r2", eventId: "e2", taskId: "T2", expectedVersion: 4 }),
    makeRow({ id: "r3", eventId: "e3", taskId: "T3", expectedVersion: 7 })
  ]);
  const publisher = new CanonicalEventOutboxPublisher({
    ctx: makeCtx(),
    repository: repo,
    resolveHeadSha: () => "abc123",
    publish: async (input) => {
      assert.equal(input.events.length, 2);
      return {
        ok: true,
        headSha: "abc123",
        publishedEvents: input.events.map((event, index) => ({ ...event, sequence: 900 + index })),
        attempts: 1,
        branch: "workflow-cannon/task-state"
      };
    }
  });

  const result = await publisher.runCycle();
  assert.equal(result.enabled, true);
  assert.equal(result.pendingRowsFetched, 2);
  assert.equal(result.publishedCount, 2);
  assert.deepEqual(state.markPublishingCalls[0], ["r1", "r2"]);
  assert.equal(state.rows.find((row) => row.id === "r1").status, "published");
  assert.equal(state.rows.find((row) => row.id === "r2").status, "published");
  assert.equal(state.rows.find((row) => row.id === "r3").status, "pending");
});

test("publisher marks conflicts and stops reprocessing conflicted rows", async () => {
  const { repo, state } = makeRepository([makeRow({ id: "r1", eventId: "e1", taskId: "T1" })]);
  const publisher = new CanonicalEventOutboxPublisher({
    ctx: makeCtx(),
    repository: repo,
    resolveHeadSha: () => "abc123",
    publish: async () => ({
      ok: false,
      code: "task-state-publish-task-conflict",
      message: "Task T1 version conflict",
      data: { taskId: "T1" }
    })
  });

  const first = await publisher.runCycle();
  assert.equal(first.conflictCount, 1);
  assert.equal(state.rows[0].status, "conflict");

  const second = await publisher.runCycle();
  assert.equal(second.pendingRowsFetched, 0);
  assert.equal(second.conflictCount, 0);
});

test("publisher marks exhausted failures and defers retryable ones", async () => {
  const { repo, state } = makeRepository([
    makeRow({ id: "r1", eventId: "e1", taskId: "T1", attempts: 0 }),
    makeRow({ id: "r2", eventId: "e2", taskId: "T2", attempts: 2 })
  ]);
  const publisher = new CanonicalEventOutboxPublisher({
    ctx: makeCtx(),
    repository: repo,
    resolveHeadSha: () => "abc123",
    publish: async () => ({
      ok: false,
      code: "task-state-publish-push-failed",
      message: "push rejected"
    })
  });

  const result = await publisher.runCycle();
  assert.equal(result.failedCount, 1);
  assert.equal(result.deferredCount, 1);
  assert.equal(state.rows.find((row) => row.id === "r1").status, "publishing");
  assert.equal(state.rows.find((row) => row.id === "r2").status, "failed");
});

test("publisher can be disabled by config", async () => {
  const { repo, state } = makeRepository([makeRow({ id: "r1", eventId: "e1", taskId: "T1" })]);
  const publisher = new CanonicalEventOutboxPublisher({
    ctx: makeCtx({
      effectiveConfig: { tasks: { canonicalPublishQueue: { enabled: false } } }
    }),
    repository: repo
  });

  const result = await publisher.runCycle();
  assert.equal(result.enabled, false);
  assert.deepEqual(state.resetCalls, []);
  assert.deepEqual(state.markPublishingCalls, []);
});
