import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("canonical-backend-config", () => {
  it("derives git backend from git-event-log authority only", async () => {
    const { resolveCanonicalBackend, readTasksCanonicalAuthority } = await import(
      "../dist/modules/task-engine/persistence/canonical-backend-config.js"
    );
    const config = { tasks: { canonicalAuthority: "git-event-log" } };
    const resolved = resolveCanonicalBackend(config);
    assert.equal(resolved.type, "git");
    assert.equal(resolved.backendId, "git-event-log");
    assert.equal(resolved.configSource, "canonicalAuthority");
    assert.equal(readTasksCanonicalAuthority(config), "git-event-log");
  });

  it("derives local-only from sqlite authority only", async () => {
    const { resolveCanonicalBackend, readTasksCanonicalAuthority } = await import(
      "../dist/modules/task-engine/persistence/canonical-backend-config.js"
    );
    const config = { tasks: { canonicalAuthority: "sqlite" } };
    const resolved = resolveCanonicalBackend(config);
    assert.equal(resolved.type, "local-only");
    assert.equal(resolved.backendId, "local-only");
    assert.equal(resolved.configSource, "canonicalAuthority");
    assert.equal(readTasksCanonicalAuthority(config), "sqlite");
  });

  it("canonicalBackend.type overrides legacy authority mapping", async () => {
    const { resolveCanonicalBackend } = await import(
      "../dist/modules/task-engine/persistence/canonical-backend-config.js"
    );
    const resolved = resolveCanonicalBackend({
      tasks: {
        canonicalAuthority: "sqlite",
        canonicalBackend: { type: "git" }
      }
    });
    assert.equal(resolved.type, "git");
    assert.equal(resolved.canonicalAuthority, "git-event-log");
    assert.equal(resolved.configSource, "canonicalBackend");
    assert.equal(resolved.configConflict, true);
  });

  it("formatResolvedCanonicalBackendLine includes active backend", async () => {
    const { formatResolvedCanonicalBackendLine, resolveCanonicalBackend } = await import(
      "../dist/modules/task-engine/persistence/canonical-backend-config.js"
    );
    const line = formatResolvedCanonicalBackendLine(
      resolveCanonicalBackend({ tasks: { canonicalAuthority: "git-event-log" } })
    );
    assert.match(line, /Active canonical backend: git/);
    assert.match(line, /backendId=git-event-log/);
  });

  it("createCanonicalSyncBackendFromContext returns git backend", async () => {
    const { createCanonicalSyncBackendFromContext } = await import(
      "../dist/modules/task-engine/persistence/canonical-sync-backend-factory.js"
    );
    const { GIT_EVENT_LOG_BACKEND_ID } = await import(
      "../dist/modules/task-engine/sync-backends/git-event-log-backend.js"
    );
    const backend = createCanonicalSyncBackendFromContext({
      workspacePath: process.cwd(),
      effectiveConfig: { tasks: { canonicalAuthority: "git-event-log" } },
      runtimeVersion: "test"
    });
    assert.equal(backend.backendId, GIT_EVENT_LOG_BACKEND_ID);
  });

  it("collectDoctorCanonicalBackendConfigIssues flags hosted", async () => {
    const { collectDoctorCanonicalBackendConfigIssues } = await import("../dist/cli/doctor-planning-issues.js");
    const issues = collectDoctorCanonicalBackendConfigIssues({
      tasks: { canonicalBackend: { type: "hosted", baseUrl: "https://example.test" } }
    });
    assert.ok(issues.some((i) => i.reason === "canonical-backend-hosted-not-implemented"));
  });
});
