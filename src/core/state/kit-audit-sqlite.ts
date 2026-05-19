import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "./kit-sqlite/planning-sqlite-kernel.js";

export const APPROVAL_DECISIONS_JSONL_REL = ".workspace-kit/approvals/decisions.jsonl";
export const SKILL_APPLY_AUDIT_JSONL_REL = ".workspace-kit/evidence/skill-apply-audit.jsonl";
export const AUDIT_JSONL_MIGRATED_SUFFIX = ".migrated";

export function openKitAuditDatabase(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Database.Database {
  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbPath = path.resolve(workspacePath, dbRel);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  return db;
}

function archiveJsonl(workspacePath: string, relativePath: string): void {
  const abs = path.join(workspacePath, relativePath);
  if (!fs.existsSync(abs)) {
    return;
  }
  const archived = `${abs}${AUDIT_JSONL_MIGRATED_SUFFIX}`;
  try {
    fs.renameSync(abs, archived);
  } catch {
    /* best-effort */
  }
}

export function importApprovalDecisionsJsonlIfNeeded(db: Database.Database, workspacePath: string): number {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM kit_approval_decisions").get() as { c: number }).c;
  if (count > 0) {
    return 0;
  }
  const abs = path.join(workspacePath, APPROVAL_DECISIONS_JSONL_REL);
  if (!fs.existsSync(abs)) {
    return 0;
  }
  const insert = db.prepare(
    `INSERT OR IGNORE INTO kit_approval_decisions
      (fingerprint, task_id, evidence_key, decision_verb, actor, recorded_at, edited_summary, policy_trace_json)
     VALUES (@fingerprint, @task_id, @evidence_key, @decision_verb, @actor, @recorded_at, @edited_summary, @policy_trace_json)`
  );
  let imported = 0;
  const raw = fs.readFileSync(abs, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t) as Record<string, unknown>;
      const fingerprint = typeof rec.fingerprint === "string" ? rec.fingerprint : "";
      if (!fingerprint) continue;
      insert.run({
        fingerprint,
        task_id: String(rec.taskId ?? ""),
        evidence_key: String(rec.evidenceKey ?? ""),
        decision_verb: String(rec.decisionVerb ?? ""),
        actor: String(rec.actor ?? ""),
        recorded_at: String(rec.timestamp ?? new Date().toISOString()),
        edited_summary: typeof rec.editedSummary === "string" ? rec.editedSummary : null,
        policy_trace_json:
          rec.policyTraceRef && typeof rec.policyTraceRef === "object"
            ? JSON.stringify(rec.policyTraceRef)
            : null
      });
      imported += 1;
    } catch {
      /* skip bad line */
    }
  }
  if (imported > 0) {
    archiveJsonl(workspacePath, APPROVAL_DECISIONS_JSONL_REL);
  }
  return imported;
}

export function importSkillApplyAuditJsonlIfNeeded(db: Database.Database, workspacePath: string): number {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM kit_skill_apply_audit").get() as { c: number }).c;
  if (count > 0) {
    return 0;
  }
  const abs = path.join(workspacePath, SKILL_APPLY_AUDIT_JSONL_REL);
  if (!fs.existsSync(abs)) {
    return 0;
  }
  const insert = db.prepare(
    `INSERT INTO kit_skill_apply_audit (recorded_at, skill_id, actor, dry_run, record_audit)
     VALUES (@recorded_at, @skill_id, @actor, @dry_run, @record_audit)`
  );
  let imported = 0;
  const raw = fs.readFileSync(abs, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t) as Record<string, unknown>;
      insert.run({
        recorded_at: String(rec.at ?? new Date().toISOString()),
        skill_id: String(rec.skillId ?? ""),
        actor: String(rec.actor ?? ""),
        dry_run: rec.dryRun === true ? 1 : 0,
        record_audit: rec.recordAudit === true ? 1 : 0
      });
      imported += 1;
    } catch {
      /* skip */
    }
  }
  if (imported > 0) {
    archiveJsonl(workspacePath, SKILL_APPLY_AUDIT_JSONL_REL);
  }
  return imported;
}
