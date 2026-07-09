/**
 * dashboard.dataSource config resolution (T100594).
 * dashboard.postPaintPromote resolution (T100848) — extension mirror.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDashboardDataSourceAtServiceStart,
  DASHBOARD_DATA_SOURCE_CONFIG_KEY,
  DashboardDataSourceConfigError,
  resolveDashboardDataSource
} from "../dist/services/dashboard-service/resolve-data-source-config.js";
import {
  DASHBOARD_POST_PAINT_PROMOTE_CONFIG_KEY,
  resolveDashboardPostPaintPromote
} from "../extensions/cursor-workflow-cannon/dist/views/dashboard/resolve-dashboard-data-source-mode.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("resolveDashboardDataSource", () => {
  it("defaults to auto when dashboard.dataSource is unset", () => {
    assert.equal(resolveDashboardDataSource({}), "auto");
    assert.equal(resolveDashboardDataSource({ dashboard: {} }), "auto");
  });

  it("accepts cli-polling, service, and auto", () => {
    for (const mode of ["cli-polling", "service", "auto"]) {
      assert.equal(resolveDashboardDataSource({ dashboard: { dataSource: mode } }), mode);
    }
  });

  it("throws on invalid values (service start gate)", () => {
    assert.throws(
      () => resolveDashboardDataSource({ dashboard: { dataSource: "websocket" } }),
      (err) => {
        assert.ok(err instanceof DashboardDataSourceConfigError);
        assert.match(err.message, /cli-polling, service, auto/);
        return true;
      }
    );
    assert.throws(() => assertDashboardDataSourceAtServiceStart({ dashboard: { dataSource: 42 } }));
  });

  it("documents the registry config key", () => {
    assert.equal(DASHBOARD_DATA_SOURCE_CONFIG_KEY, "dashboard.dataSource");
  });
});

describe("resolveDashboardPostPaintPromote (T100848)", () => {
  it("defaults to true when unset", () => {
    assert.equal(resolveDashboardPostPaintPromote({}), true);
    assert.equal(resolveDashboardPostPaintPromote({ dashboard: {} }), true);
  });

  it("honors explicit false without changing dataSource semantics", () => {
    assert.equal(
      resolveDashboardPostPaintPromote({ dashboard: { postPaintPromote: false } }),
      false
    );
    assert.equal(
      resolveDashboardDataSource({
        dashboard: { dataSource: "auto", postPaintPromote: false }
      }),
      "auto"
    );
  });

  it("is registered in config-registry.json", () => {
    assert.equal(DASHBOARD_POST_PAINT_PROMOTE_CONFIG_KEY, "dashboard.postPaintPromote");
    const registry = JSON.parse(
      readFileSync(path.join(root, "src/core/config-registry.json"), "utf8")
    );
    assert.equal(registry["dashboard.postPaintPromote"]?.default, true);
    assert.equal(registry["dashboard.postPaintPromote"]?.type, "boolean");
  });
});
