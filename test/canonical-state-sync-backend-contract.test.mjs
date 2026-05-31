/**
 * Contract tests for CanonicalStateSyncBackend (T100616 / T-BE-201).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const GENERIC_HEAD_KEYS = [
  "contractVersion",
  "latestSequence",
  "latestEventId",
  "backendRevision",
  "latestSnapshotId",
  "recordedAt"
];

const GIT_SPECIFIC_TOP_LEVEL_KEYS = ["branch", "ref", "tipSha", "headSha", "commitSha", "remoteRef"];

function sampleHead(overrides = {}) {
  return {
    contractVersion: 1,
    latestSequence: 42,
    latestEventId: "evt-42",
    backendRevision: "rev-abc123",
    latestSnapshotId: "snap-genesis",
    recordedAt: "2026-05-30T00:00:00.000Z",
    ...overrides
  };
}

function sampleEvent(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "evt-43",
    sequence: 43,
    parentEventId: "evt-42",
    recordedAt: "2026-05-30T00:00:01.000Z",
    kind: "task.updated",
    payload: { taskId: "T100616" },
    ...overrides
  };
}

function createMockBackend() {
  let sequence = 42;
  return {
    backendId: "mock-local",
    async readHead() {
      return sampleHead({ latestSequence: sequence });
    },
    async fetchEvents(input) {
      const head = await this.readHead();
      const events =
        typeof input.afterSequence === "number"
          ? [sampleEvent({ sequence: input.afterSequence + 1, eventId: `evt-${input.afterSequence + 1}` })]
          : [];
      return {
        ok: true,
        head,
        events,
        taskVersions: [{ taskId: "T100616", version: 3 }],
        planningVersions: [{ domain: "workspace", version: 7 }]
      };
    },
    async publishEvents(input) {
      sequence += input.events.length;
      const head = sampleHead({
        latestSequence: sequence,
        latestEventId: input.events.at(-1)?.eventId ?? null,
        backendRevision: `rev-${sequence}`
      });
      return {
        ok: true,
        head,
        publishedEvents: input.events.map((event, index) => ({
          ...event,
          sequence: head.latestSequence - input.events.length + index + 1
        })),
        attempts: 1
      };
    },
    async verify() {
      return { passed: true, findingCount: 0, findings: [] };
    },
    async compact() {
      return {
        ok: true,
        code: "compact-dry-run",
        message: "ok",
        dryRun: true,
        latestSequence: sequence,
        latestSnapshotId: "snap-genesis",
        retainedEventSegmentCount: 1
      };
    },
    async snapshot() {
      const head = await this.readHead();
      return {
        ok: true,
        code: "snapshot-dry-run",
        message: "ok",
        dryRun: true,
        snapshotId: "snap-test",
        throughSequence: head.latestSequence,
        throughEventId: head.latestEventId ?? "none",
        contentDigest: "abc",
        head
      };
    }
  };
}

describe("canonical-state-sync-backend contract", () => {
  it("assertCanonicalStateSyncBackend accepts a complete mock backend", async () => {
    const { assertCanonicalStateSyncBackend } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    const backend = createMockBackend();
    assert.doesNotThrow(() => assertCanonicalStateSyncBackend(backend));
    assert.equal(backend.backendId, "mock-local");
  });

  it("assertCanonicalStateSyncBackend rejects incomplete backends", async () => {
    const { assertCanonicalStateSyncBackend } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    assert.throws(() => assertCanonicalStateSyncBackend(null), /must be an object/);
    assert.throws(
      () => assertCanonicalStateSyncBackend({ backendId: "x", readHead: async () => ({}) }),
      /fetchEvents/
    );
  });

  it("generic head shape avoids git-specific top-level fields", async () => {
    const head = sampleHead();
    for (const key of GENERIC_HEAD_KEYS) {
      assert.ok(key in head, `missing generic head field ${key}`);
    }
    for (const key of GIT_SPECIFIC_TOP_LEVEL_KEYS) {
      assert.equal(key in head, false, `git-specific field leaked into head: ${key}`);
    }
  });

  it("mock backend readHead/fetchEvents/publishEvents/verify/compact/snapshot succeed", async () => {
    const { assertCanonicalStateSyncBackend } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    const backend = createMockBackend();
    assertCanonicalStateSyncBackend(backend);

    const head = await backend.readHead();
    assert.equal(head.latestSequence, 42);
    assert.equal(typeof head.backendRevision, "string");

    const fetched = await backend.fetchEvents({ afterSequence: 42, refresh: false });
    assert.equal(fetched.ok, true);
    assert.equal(fetched.taskVersions[0].taskId, "T100616");
    assert.equal(fetched.planningVersions[0].domain, "workspace");

    const published = await backend.publishEvents({
      events: [sampleEvent({ sequence: 0, eventId: "draft-1" })],
      expectedHead: { backendRevision: "rev-abc123", latestSequence: 42 },
      expectedTaskVersions: { T100616: 3 }
    });
    assert.equal(published.ok, true);
    assert.equal(published.publishedEvents.length, 1);

    const verified = await backend.verify();
    assert.equal(verified.passed, true);

    const compacted = await backend.compact({ dryRun: true });
    assert.equal(compacted.ok, true);

    const snapshotted = await backend.snapshot({ dryRun: true });
    assert.equal(snapshotted.ok, true);
    assert.equal(snapshotted.head.latestSequence, published.head.latestSequence);
  });

  it("toCanonicalStateEventEnvelope strips to contract envelope", async () => {
    const { toCanonicalStateEventEnvelope } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    const envelope = toCanonicalStateEventEnvelope({
      schemaVersion: 1,
      eventId: "evt-1",
      sequence: 1,
      parentEventId: null,
      recordedAt: "2026-05-30T00:00:00.000Z",
      kind: "task.created",
      actor: { id: "agent@test" },
      payload: { taskId: "T1", initialStatus: "ready", title: "x", type: "workspace-kit" }
    });
    assert.deepEqual(Object.keys(envelope).sort(), [
      "eventId",
      "kind",
      "parentEventId",
      "payload",
      "recordedAt",
      "schemaVersion",
      "sequence"
    ]);
    assert.equal(envelope.kind, "task.created");
  });

  it("git compat map covers all backend methods", async () => {
    const { GIT_EVENT_LOG_BACKEND_COMPAT } = await import(
      "../dist/modules/task-engine/sync-backends/git-method-compat.js"
    );
    const methods = new Set(GIT_EVENT_LOG_BACKEND_COMPAT.map((entry) => entry.backendMethod));
    for (const required of ["readHead", "fetchEvents", "publishEvents", "verify", "compact", "snapshot"]) {
      assert.ok(methods.has(required), `missing git compat entry for ${required}`);
    }
  });

  it("contract version constant is exported from contracts", async () => {
    const { CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION } = await import(
      "../dist/contracts/canonical-state-sync-backend.js"
    );
    assert.equal(CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION, 1);
  });
});
