import {
  importSkillApplyAuditJsonlIfNeeded,
  openKitAuditDatabase
} from "../../core/state/kit-audit-sqlite.js";

export type SkillApplyAuditLine = {
  schemaVersion: 1;
  at: string;
  skillId: string;
  actor: string;
  dryRun: boolean;
  recordAudit: boolean;
};

export function appendSkillApplyAudit(
  workspacePath: string,
  line: SkillApplyAuditLine,
  effectiveConfig?: Record<string, unknown>
): void {
  const db = openKitAuditDatabase(workspacePath, effectiveConfig);
  try {
    importSkillApplyAuditJsonlIfNeeded(db, workspacePath);
    db.prepare(
      `INSERT INTO kit_skill_apply_audit (recorded_at, skill_id, actor, dry_run, record_audit)
       VALUES (@recorded_at, @skill_id, @actor, @dry_run, @record_audit)`
    ).run({
      recorded_at: line.at,
      skill_id: line.skillId,
      actor: line.actor,
      dry_run: line.dryRun ? 1 : 0,
      record_audit: line.recordAudit ? 1 : 0
    });
  } finally {
    db.close();
  }
}
