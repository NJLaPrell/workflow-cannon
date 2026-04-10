import { countCaeAckRows, countCaeTraceRows, openKitSqliteReadWrite } from "../core/cae/cae-kit-sqlite.js";
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
  const lines = [
    `CAE: enabled=${enabled} persistence=${persistence} shadowPreflight=${shadow} enforcement=${enforce}`
  ];
  if (persistence) {
    const db = openKitSqliteReadWrite(cwd, e);
    if (db) {
      try {
        lines.push(`CAE SQLite: trace_rows=${countCaeTraceRows(db)} ack_rows=${countCaeAckRows(db)}`);
      } finally {
        db.close();
      }
    } else {
      lines.push("CAE SQLite: planning DB not found (CAE tables apply after kit SQLite v11 migration).");
    }
  }
  return lines;
}
