import {
  caeRegistryTablesReady,
  countCaeAckRows,
  countCaeRegistryMutationAuditRows,
  countCaeTraceRows,
  getActiveCaeRegistryVersionId,
  listCaeRegistryVersionsWithCounts,
  openKitSqliteReadWrite
} from "../core/cae/cae-kit-sqlite.js";
import { loadCaeRegistryFromSqliteDb } from "../core/cae/cae-registry-sqlite.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { getAtPath } from "../core/workspace-kit-config.js";
import { defaultRegistryModules } from "../modules/index.js";

/** One-line CAE posture after `doctor` contract checks pass (Phase 70). */
export async function collectCaeDoctorSummaryLines(cwd: string): Promise<string[]> {
  const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules, {});
  const e = effective as Record<string, unknown>;
  const enabled = getAtPath(e, "kit.cae.enabled") === true;
  const persistence = getAtPath(e, "kit.cae.persistence") === true;
  const shadow = getAtPath(e, "kit.cae.runtime.shadowPreflight") === true;
  const enforce = getAtPath(e, "kit.cae.enforcement.enabled") === true;
  const registryStore = getAtPath(e, "kit.cae.registryStore");
  const wantRegistrySummary = registryStore === "sqlite";
  const lines = [
    `CAE: enabled=${enabled} persistence=${persistence} shadowPreflight=${shadow} enforcement=${enforce}`
  ];
  const db = openKitSqliteReadWrite(cwd, e);
  if (db) {
    try {
      if (persistence) {
        lines.push(`CAE SQLite: trace_rows=${countCaeTraceRows(db)} ack_rows=${countCaeAckRows(db)}`);
      }
      if (wantRegistrySummary && caeRegistryTablesReady(db)) {
        const headers = listCaeRegistryVersionsWithCounts(db);
        const activeVid = getActiveCaeRegistryVersionId(db);
        const auditRows = countCaeRegistryMutationAuditRows(db);
        lines.push(
          `CAE registry SQLite: version_headers=${headers.length} active_version_id=${activeVid ?? "none"} audit_rows=${auditRows}`
        );
        const loaded = loadCaeRegistryFromSqliteDb(db, cwd, { verifyArtifactPaths: false });
        if (loaded.ok) {
          const d = loaded.value.registryDigest;
          lines.push(`CAE registry digest: sha256=${d.slice(0, 12)}…`);
        } else {
          lines.push(`CAE registry load: code=${loaded.code}`);
        }
      }
    } finally {
      db.close();
    }
  } else {
    if (persistence) {
      lines.push("CAE SQLite: planning DB not found (CAE tables apply after kit SQLite v11 migration).");
    }
    if (wantRegistrySummary) {
      lines.push(
        "CAE registry SQLite: planning DB not found (registry metadata requires kit SQLite; run workspace-kit init / upgrade)."
      );
    }
  }
  return lines;
}
