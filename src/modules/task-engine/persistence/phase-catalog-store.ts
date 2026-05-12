import type DatabaseCtor from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { inferTaskPhaseKey, parseKitPhaseNumberFromYaml, parseLeadingPhaseOrdinal } from "../phase-resolution.js";
import type { TaskEntity } from "../types.js";
import type { KitWorkspaceStatusPublic } from "./workspace-status-store.js";

export const KIT_PHASE_CATALOG_TABLE = "kit_phase_catalog";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

export function phaseCatalogTableAvailable(db: SqliteDb): boolean {
  try {
    const path = typeof db.name === "string" ? db.name : "";
    if (!path) {
      return tableExists(db, KIT_PHASE_CATALOG_TABLE);
    }
    const v = readKitSqliteUserVersion(path);
    return v >= 23 && tableExists(db, KIT_PHASE_CATALOG_TABLE);
  } catch {
    return tableExists(db, KIT_PHASE_CATALOG_TABLE);
  }
}

/** Same character class as assign-task-phase (max 64 chars of tail). */
const PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$/;

export function validatePhaseCatalogKey(raw: string): string | null {
  const t = raw.trim();
  if (!t || !PHASE_KEY_RE.test(t)) {
    return null;
  }
  return t;
}

const DESCRIPTION_MAX = 240;

export function normalizeCatalogShortDescription(
  raw: unknown
):
  | { ok: true; value: string | null; omit?: false }
  | { ok: true; omit: true }
  | { ok: false; message: string } {
  if (raw === undefined) {
    return { ok: true, omit: true };
  }
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: "shortDescription must be a string, null, or omitted" };
  }
  const t = raw.trim();
  if (t.length === 0) {
    return { ok: true, value: null };
  }
  if (t.length > DESCRIPTION_MAX || /[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) {
    return {
      ok: false,
      message: `shortDescription must be a single line up to ${DESCRIPTION_MAX} characters`
    };
  }
  return { ok: true, value: t };
}

export function comparePhaseCatalogKeys(a: string, b: string): number {
  const oa = parseLeadingPhaseOrdinal(a);
  const ob = parseLeadingPhaseOrdinal(b);
  if (oa !== null && ob !== null && oa !== ob) {
    return oa - ob;
  }
  if (oa !== null && ob === null) {
    return -1;
  }
  if (oa === null && ob !== null) {
    return 1;
  }
  return a.localeCompare(b);
}

export type PhaseCatalogRow = { phaseKey: string; shortDescription: string | null; updatedAt: string };

export function readPhaseCatalogRows(db: SqliteDb): PhaseCatalogRow[] {
  if (!phaseCatalogTableAvailable(db)) {
    return [];
  }
  const rows = db
    .prepare(`SELECT phase_key, short_description, updated_at FROM ${KIT_PHASE_CATALOG_TABLE} ORDER BY phase_key ASC`)
    .all() as Array<{ phase_key: string; short_description: string | null; updated_at: string }>;
  return rows.map((r) => ({
    phaseKey: r.phase_key,
    shortDescription: r.short_description,
    updatedAt: r.updated_at
  }));
}

export type PhaseCatalogListEntry = {
  phaseKey: string;
  shortDescription: string | null;
  /** Row exists in kit_phase_catalog (otherwise inferred from workspace status and/or tasks). */
  inCatalog: boolean;
};

/**
 * Phase keys inferred from the task store for roster / `list-phase-catalog` merge.
 * All non-archived tasks (including **completed** and **cancelled**); keys must pass {@link validatePhaseCatalogKey}.
 */
export function collectPhaseCatalogHintsFromTasks(tasks: readonly TaskEntity[]): string[] {
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.archived) {
      continue;
    }
    const inferred = inferTaskPhaseKey(t);
    if (!inferred) {
      continue;
    }
    const vk = validatePhaseCatalogKey(inferred);
    if (vk) {
      out.add(vk);
    }
  }
  return [...out];
}

function collectStatusPhaseKeys(row: KitWorkspaceStatusPublic | null): string[] {
  if (!row) {
    return [];
  }
  const keys: string[] = [];
  const cur = parseKitPhaseNumberFromYaml(row.currentKitPhase);
  const next = parseKitPhaseNumberFromYaml(row.nextKitPhase);
  if (cur) {
    keys.push(cur);
  }
  if (next) {
    keys.push(next);
  }
  return keys;
}

/**
 * Deterministic phase list: union of catalog rows, current/next workspace phase keys,
 * and optional task-store hints (non-archived tasks with inferable phase, all lifecycle statuses),
 * each with optional short description from the catalog.
 */
export function buildOrderedPhaseCatalogList(
  db: SqliteDb,
  workspaceStatus: KitWorkspaceStatusPublic | null,
  taskPhaseHints?: readonly string[] | null
): PhaseCatalogListEntry[] {
  const catalogRows = readPhaseCatalogRows(db);
  const byKey = new Map<string, { shortDescription: string | null; inCatalog: boolean }>();
  for (const r of catalogRows) {
    byKey.set(r.phaseKey, { shortDescription: r.shortDescription, inCatalog: true });
  }
  for (const k of collectStatusPhaseKeys(workspaceStatus)) {
    if (!byKey.has(k)) {
      byKey.set(k, { shortDescription: null, inCatalog: false });
    }
  }
  if (taskPhaseHints?.length) {
    for (const raw of taskPhaseHints) {
      const k = validatePhaseCatalogKey(typeof raw === "string" ? raw : "");
      if (!k || byKey.has(k)) {
        continue;
      }
      byKey.set(k, { shortDescription: null, inCatalog: false });
    }
  }
  const keys = [...byKey.keys()].sort(comparePhaseCatalogKeys);
  return keys.map((phaseKey) => {
    const meta = byKey.get(phaseKey)!;
    return { phaseKey, shortDescription: meta.shortDescription, inCatalog: meta.inCatalog };
  });
}

const DERIVED_PHASE_DESC_MAX = DESCRIPTION_MAX;
const DERIVED_TASK_TITLE_MAX = 96;
const DERIVED_TASKS_CONSIDERED = 2;

function collapseSingleLine(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) {
    return t;
  }
  if (maxLen < 2) {
    return t.slice(0, maxLen);
  }
  return `${t.slice(0, maxLen - 1)}…`;
}

function taskHeadline(t: TaskEntity): string {
  const title = typeof t.title === "string" ? t.title.trim() : "";
  if (title.length > 0) {
    return title;
  }
  const sum = typeof t.summary === "string" ? t.summary.trim() : "";
  return sum;
}

/**
 * When **`shortDescription`** is missing, fills a short title line from non-archived tasks in that
 * **future** phase (strictly after workspace **`current_kit_phase`** leading ordinal). Does not
 * change persisted catalog rows or overwrite non-empty descriptions. Deterministic: tasks ordered
 * by **`id`**, up to {@link DERIVED_TASKS_CONSIDERED} headlines joined with **` · `**, bounded by
 * {@link DERIVED_PHASE_DESC_MAX}.
 */
export function enrichFuturePhaseCatalogWithTaskSummaries(
  phases: readonly PhaseCatalogListEntry[],
  tasks: readonly TaskEntity[],
  workspaceCurrentKitPhase: string | null | undefined
): PhaseCatalogListEntry[] {
  const wsDigits = parseKitPhaseNumberFromYaml(workspaceCurrentKitPhase ?? null);
  const wsOrd = wsDigits !== null ? parseLeadingPhaseOrdinal(wsDigits) : null;
  if (wsOrd === null) {
    return [...phases];
  }

  const byPhase = new Map<string, TaskEntity[]>();
  for (const t of tasks) {
    if (t.archived) {
      continue;
    }
    const inferred = inferTaskPhaseKey(t);
    const vk = validatePhaseCatalogKey(inferred ?? "");
    if (!vk) {
      continue;
    }
    const arr = byPhase.get(vk);
    if (arr) {
      arr.push(t);
    } else {
      byPhase.set(vk, [t]);
    }
  }

  for (const arr of byPhase.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  }

  return phases.map((entry) => {
    if (entry.shortDescription != null && entry.shortDescription.trim().length > 0) {
      return { ...entry };
    }
    const ord = parseLeadingPhaseOrdinal(entry.phaseKey);
    if (ord === null || ord <= wsOrd) {
      return { ...entry };
    }
    const list = byPhase.get(entry.phaseKey) ?? [];
    const parts: string[] = [];
    for (const t of list) {
      const raw = taskHeadline(t);
      if (!raw) {
        continue;
      }
      parts.push(collapseSingleLine(raw, DERIVED_TASK_TITLE_MAX));
      if (parts.length >= DERIVED_TASKS_CONSIDERED) {
        break;
      }
    }
    if (parts.length === 0) {
      return { ...entry };
    }
    let line = parts.join(" · ");
    if (list.length > parts.length) {
      line = `${line} · …`;
    }
    line = collapseSingleLine(line, DERIVED_PHASE_DESC_MAX);
    return { ...entry, shortDescription: line };
  });
}

export function upsertPhaseCatalogRow(db: SqliteDb, phaseKey: string, shortDescription: string | null, nowIso: string): void {
  db.prepare(
    `INSERT INTO ${KIT_PHASE_CATALOG_TABLE} (phase_key, short_description, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(phase_key) DO UPDATE SET
       short_description = excluded.short_description,
       updated_at = excluded.updated_at`
  ).run(phaseKey, shortDescription, nowIso);
}

export function deletePhaseCatalogRow(db: SqliteDb, phaseKey: string): void {
  db.prepare(`DELETE FROM ${KIT_PHASE_CATALOG_TABLE} WHERE phase_key = ?`).run(phaseKey);
}
