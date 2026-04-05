import type Database from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";

export const PLUGIN_KIT_MIN_USER_VERSION = 8;

const DDL = `
CREATE TABLE IF NOT EXISTS kit_plugin_state (
  plugin_name TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  root_relative_path TEXT NOT NULL,
  installed_via TEXT NOT NULL CHECK(installed_via IN ('scan','copy-install')),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_plugin_state_enabled ON kit_plugin_state(enabled);
`;

export function assertPluginKitSchema(dbPathAbs: string): { ok: true } | { ok: false; message: string } {
  const uv = readKitSqliteUserVersion(dbPathAbs);
  if (uv < PLUGIN_KIT_MIN_USER_VERSION) {
    return {
      ok: false,
      message: `plugin commands that touch kit SQLite require user_version >= ${PLUGIN_KIT_MIN_USER_VERSION} (current ${uv}); open the workspace DB once with a current workspace-kit to migrate`
    };
  }
  return { ok: true };
}

export function ensurePluginDdl(db: Database.Database): void {
  db.exec(DDL);
}

export type PluginStateRow = {
  pluginName: string;
  enabled: boolean;
  rootRelativePath: string;
  installedVia: "scan" | "copy-install";
  updatedAt: string;
};

function rowToState(r: Record<string, unknown>): PluginStateRow {
  return {
    pluginName: String(r.plugin_name ?? ""),
    enabled: Number(r.enabled) === 1,
    rootRelativePath: String(r.root_relative_path ?? ""),
    installedVia: String(r.installed_via) === "copy-install" ? "copy-install" : "scan",
    updatedAt: String(r.updated_at ?? "")
  };
}

export function listPluginState(db: Database.Database): PluginStateRow[] {
  ensurePluginDdl(db);
  const rows = db.prepare("SELECT * FROM kit_plugin_state ORDER BY plugin_name ASC").all() as Record<
    string,
    unknown
  >[];
  return rows.map(rowToState);
}

export function getPluginState(db: Database.Database, pluginName: string): PluginStateRow | undefined {
  ensurePluginDdl(db);
  const r = db.prepare("SELECT * FROM kit_plugin_state WHERE plugin_name = ?").get(pluginName) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToState(r) : undefined;
}

/** Effective enabled when absent from DB defaults to true (discovered plugins). */
export function isPluginEnabledInDb(db: Database.Database, pluginName: string): boolean {
  const row = getPluginState(db, pluginName);
  if (!row) return true;
  return row.enabled;
}

export function upsertPluginState(
  db: Database.Database,
  row: {
    pluginName: string;
    enabled: boolean;
    rootRelativePath: string;
    installedVia: "scan" | "copy-install";
    updatedAt: string;
  }
): void {
  ensurePluginDdl(db);
  db.prepare(
    `INSERT INTO kit_plugin_state (plugin_name, enabled, root_relative_path, installed_via, updated_at)
     VALUES (@pluginName, @enabled, @rootRelativePath, @installedVia, @updatedAt)
     ON CONFLICT(plugin_name) DO UPDATE SET
       enabled = excluded.enabled,
       root_relative_path = excluded.root_relative_path,
       installed_via = excluded.installed_via,
       updated_at = excluded.updated_at`
  ).run({
    pluginName: row.pluginName,
    enabled: row.enabled ? 1 : 0,
    rootRelativePath: row.rootRelativePath,
    installedVia: row.installedVia,
    updatedAt: row.updatedAt
  });
}
