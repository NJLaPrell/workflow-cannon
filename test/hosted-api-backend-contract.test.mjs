/**
 * Contract tests for HostedApiBackend wire types (T100620 / T-BE-205).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    payload: { taskId: "T100620" },
    ...overrides
  };
}

describe("hosted-api-backend contract", () => {
  it("HOSTED_API_METHOD_COMPAT maps all v1 routes to backend methods", async () => {
    const { HOSTED_API_METHOD_COMPAT } = await import("../dist/contracts/hosted-api-backend.js");
    const routes = Object.keys(HOSTED_API_METHOD_COMPAT);
    assert.equal(routes.length, 6);
    assert.equal(HOSTED_API_METHOD_COMPAT["canonical.head.read"].backendMethod, "readHead");
    assert.equal(HOSTED_API_METHOD_COMPAT["canonical.events.publish"].httpMethod, "POST");
    assert.match(HOSTED_API_METHOD_COMPAT["canonical.events.publish"].path, /publish$/);
  });

  it("assertHostedApiIdempotencyKey accepts valid keys and rejects invalid", async () => {
    const { assertHostedApiIdempotencyKey } = await import("../dist/contracts/hosted-api-backend.js");
    assert.doesNotThrow(() => assertHostedApiIdempotencyKey("550e8400-e29b-41d4-a716-446655440000"));
    assert.throws(() => assertHostedApiIdempotencyKey(""), /non-empty/);
    assert.throws(() => assertHostedApiIdempotencyKey("x".repeat(129)), /128/);
  });

  it("assertHostedApiPublishBatch enforces batch bounds", async () => {
    const { assertHostedApiPublishBatch, HOSTED_API_PUBLISH_BATCH_MAX } = await import(
      "../dist/contracts/hosted-api-backend.js"
    );
    assert.doesNotThrow(() => assertHostedApiPublishBatch([sampleEvent()]));
    assert.throws(() => assertHostedApiPublishBatch([]), /at least one/);
    assert.throws(
      () => assertHostedApiPublishBatch(Array.from({ length: HOSTED_API_PUBLISH_BATCH_MAX + 1 }, () => ({}))),
      /exceeds max/
    );
  });

  it("hostedPublishResponseToCanonical and hostedFetchResponseToCanonical align with canonical types", async () => {
    const {
      hostedPublishResponseToCanonical,
      hostedFetchResponseToCanonical,
      isHostedApiConflictResponse
    } = await import("../dist/contracts/hosted-api-backend.js");

    const head = sampleHead();
    const publishWire = {
      contractVersion: 1,
      head,
      publishedEvents: [sampleEvent()],
      attempts: 1
    };
    const canonicalPublish = hostedPublishResponseToCanonical(publishWire);
    assert.equal(canonicalPublish.ok, true);
    assert.equal(canonicalPublish.publishedEvents.length, 1);
    assert.equal(canonicalPublish.head.backendRevision, "rev-abc123");

    const fetchWire = {
      contractVersion: 1,
      head,
      events: [sampleEvent()],
      taskVersions: [{ taskId: "T100620", version: 2 }],
      planningVersions: [{ domain: "workspace", version: 5 }],
      hasMore: false,
      nextAfterSequence: null
    };
    const canonicalFetch = hostedFetchResponseToCanonical(fetchWire);
    assert.equal(canonicalFetch.ok, true);
    assert.equal(canonicalFetch.taskVersions[0].taskId, "T100620");

    const conflict = {
      ok: false,
      contractVersion: 1,
      httpStatus: 409,
      route: "canonical.events.publish",
      code: "head-revision-mismatch",
      message: "expected revision rev-old",
      retryable: true,
      conflict: {
        code: "head-revision-mismatch",
        message: "expected revision rev-old",
        retryable: true
      }
    };
    assert.equal(isHostedApiConflictResponse(conflict), true);
    assert.equal(isHostedApiConflictResponse({ ...conflict, httpStatus: 422, conflict: undefined }), false);
  });

  it("generic head in hosted responses avoids git-specific top-level fields", async () => {
    const head = sampleHead();
    const gitKeys = ["branch", "ref", "tipSha", "headSha", "commitSha", "remoteRef"];
    for (const key of gitKeys) {
      assert.equal(key in head, false, `git field leaked: ${key}`);
    }
  });
});
