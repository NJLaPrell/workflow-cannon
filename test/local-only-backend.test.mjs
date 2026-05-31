/**
 * LocalOnlyBackend tests (T100619 / T-BE-204).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function sampleTaskCreatedEvent(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "evt-create-1",
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-30T12:00:00.000Z",
    actor: { id: "test@example.com", source: "explicit" },
    command: { name: "create-task", moduleId: "task-engine" },
    kind: "task.created",
    payload: {
      taskId: "T100619",
      initialStatus: "ready",
      title: "Add LocalOnlyBackend",
      type: "workspace-kit"
    },
    ...overrides
  };
}

describe("LocalOnlyBackend", () => {
  it("assertCanonicalStateSyncBackend accepts createLocalOnlyBackend()", async () => {
    const { assertCanonicalStateSyncBackend } = await import(
      "../dist/modules/task-engine/sync-backends/canonical-state-sync-backend.js"
    );
    const { createLocalOnlyBackend, LOCAL_ONLY_BACKEND_ID } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const backend = createLocalOnlyBackend();
    assert.doesNotThrow(() => assertCanonicalStateSyncBackend(backend));
    assert.equal(backend.backendId, LOCAL_ONLY_BACKEND_ID);
  });

  it("readHead returns genesis head without git fields", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const backend = createLocalOnlyBackend();
    const head = await backend.readHead();
    assert.equal(head.latestSequence, 0);
    assert.equal(head.latestEventId, null);
    assert.equal(head.backendRevision, "local-genesis");
    assert.equal("branch" in head, false);
    assert.equal("tipSha" in head, false);
  });

  it("publishEvents assigns sequences and fetchEvents returns them", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const backend = createLocalOnlyBackend();
    const head = await backend.readHead();

    const published = await backend.publishEvents({
      events: [sampleTaskCreatedEvent()],
      expectedHead: {
        backendRevision: head.backendRevision,
        latestSequence: head.latestSequence
      },
      expectedTaskVersions: { T100619: 0 }
    });
    assert.equal(published.ok, true);
    if (!published.ok) {
      return;
    }
    assert.equal(published.publishedEvents.length, 1);
    assert.equal(published.publishedEvents[0].sequence, 1);

    const fetched = await backend.fetchEvents({ afterSequence: 0 });
    assert.equal(fetched.ok, true);
    if (!fetched.ok) {
      return;
    }
    assert.equal(fetched.events.length, 1);
    assert.equal(fetched.events[0].kind, "task.created");
    assert.equal(fetched.taskVersions.find((row) => row.taskId === "T100619")?.version, 1);
  });

  it("publishEvents rejects stale expectedHead", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const backend = createLocalOnlyBackend();
    const result = await backend.publishEvents({
      events: [sampleTaskCreatedEvent()],
      expectedHead: { backendRevision: "stale-rev", latestSequence: 99 },
      expectedTaskVersions: { T100619: 0 }
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.code, "head-conflict");
    assert.equal(result.retryable, true);
  });

  it("verify passes on consistent local log", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const backend = createLocalOnlyBackend();
    const head = await backend.readHead();
    await backend.publishEvents({
      events: [sampleTaskCreatedEvent()],
      expectedHead: {
        backendRevision: head.backendRevision,
        latestSequence: head.latestSequence
      },
      expectedTaskVersions: { T100619: 0 }
    });
    const verified = await backend.verify?.();
    assert.ok(verified);
    assert.equal(verified.passed, true);
    assert.equal(verified.diagnostics?.mode, "local-only");
  });

  it("buildLocalOnlySyncStatus reports syncState local-only", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const { buildLocalOnlySyncStatus } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-status.js"
    );
    const backend = createLocalOnlyBackend();
    const status = await buildLocalOnlySyncStatus(backend, 0);
    assert.equal(status.syncState, "local-only");
    assert.equal(status.mode, "local-only");
    assert.equal(status.gitRequired, false);
    assert.equal(status.remotePublication, false);
    assert.match(status.message, /locally only/i);
  });

  it("assessLocalOnlyCloseoutWarning warns when git-event-log authority expected", async () => {
    const { assessLocalOnlyCloseoutWarning, LOCAL_ONLY_CLOSEOUT_WARNING_CODE } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-closeout.js"
    );
    const warning = assessLocalOnlyCloseoutWarning({
      effectiveConfig: { tasks: { canonicalAuthority: "git-event-log" } },
      backendId: "local-only"
    });
    assert.ok(warning);
    assert.equal(warning.code, LOCAL_ONLY_CLOSEOUT_WARNING_CODE);
    assert.equal(warning.severity, "warning");
    assert.match(warning.message, /local-only/i);
  });

  it("assessLocalOnlyCloseoutWarning is silent for sqlite authority", async () => {
    const { assessLocalOnlyCloseoutWarning } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-closeout.js"
    );
    const warning = assessLocalOnlyCloseoutWarning({
      effectiveConfig: { tasks: { canonicalAuthority: "sqlite" } },
      backendId: "local-only"
    });
    assert.equal(warning, null);
  });

  it("works without a git repository (in-memory store only)", async () => {
    const { createLocalOnlyBackend } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-backend.js"
    );
    const { createLocalOnlyEventStore } = await import(
      "../dist/modules/task-engine/sync-backends/local-only-event-store.js"
    );
    const store = createLocalOnlyEventStore("2026-05-30T00:00:00.000Z");
    const backend = createLocalOnlyBackend({ store });
    const head = await backend.readHead();
    assert.equal(head.recordedAt, "2026-05-30T00:00:00.000Z");
    const compacted = await backend.compact?.({ dryRun: true });
    assert.equal(compacted?.ok, true);
    const snapshotted = await backend.snapshot?.({ dryRun: true });
    assert.equal(snapshotted?.ok, true);
  });
});
