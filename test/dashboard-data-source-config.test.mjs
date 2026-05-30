/**
 * dashboard.dataSource config resolution (T100594).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDashboardDataSourceAtServiceStart,
  DASHBOARD_DATA_SOURCE_CONFIG_KEY,
  DashboardDataSourceConfigError,
  resolveDashboardDataSource
} from "../dist/services/dashboard-service/resolve-data-source-config.js";

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
