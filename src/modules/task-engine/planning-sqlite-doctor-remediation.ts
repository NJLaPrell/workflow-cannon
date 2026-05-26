/** Copy-paste hints appended when doctor detects planning SQLite risk (Phase 114 S0.3). */

export const PLANNING_SQLITE_RECOVERY_COMMANDS =
  "pnpm exec wk run backup-planning-sqlite '{\"outputPath\":\".workspace-kit/backups/planning-pre-repair.db\"}' ; pnpm exec wk run task-persistence-readiness '{}'";

export const PLANNING_SQLITE_RECOVERY_HINT = `Before risky task-store operations: ${PLANNING_SQLITE_RECOVERY_COMMANDS} — docs/maintainers/runbooks/task-persistence-operator.md`;

export function withPlanningSqliteRecoveryHint(reason: string): string {
  if (reason.includes("backup-planning-sqlite") || reason.includes(PLANNING_SQLITE_RECOVERY_COMMANDS)) {
    return reason;
  }
  return `${reason} — ${PLANNING_SQLITE_RECOVERY_HINT}`;
}
