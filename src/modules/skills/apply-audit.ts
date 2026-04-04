import fs from "node:fs";
import path from "node:path";

const AUDIT_REL = path.join(".workspace-kit", "evidence", "skill-apply-audit.jsonl");

export type SkillApplyAuditLine = {
  schemaVersion: 1;
  at: string;
  skillId: string;
  actor: string;
  dryRun: boolean;
  recordAudit: boolean;
};

export function appendSkillApplyAudit(workspacePath: string, line: SkillApplyAuditLine): void {
  const abs = path.join(workspacePath, AUDIT_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, `${JSON.stringify(line)}\n`, "utf8");
}
