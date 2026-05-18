import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type MemoryRecordStatus = "draft" | "approved" | "pruned";

export type MemoryRecord = {
  id: string;
  category: string;
  body: string;
  status: MemoryRecordStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  prunedAt?: string;
  pruneAuditNote?: string;
};

export type MemoryStoreDocument = {
  schemaVersion: 1;
  records: MemoryRecord[];
};

const REL_PATH = path.join(".workspace-kit", "memory", "records.json");

export function memoryStorePath(workspacePath: string): string {
  return path.join(workspacePath, REL_PATH);
}

function emptyDoc(): MemoryStoreDocument {
  return { schemaVersion: 1, records: [] };
}

export function readMemoryStore(workspacePath: string): MemoryStoreDocument {
  const abs = memoryStorePath(workspacePath);
  if (!fs.existsSync(abs)) {
    return emptyDoc();
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as MemoryStoreDocument;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.records)) {
    throw new Error(`Invalid memory store at ${REL_PATH}`);
  }
  return raw;
}

export function writeMemoryStore(workspacePath: string, doc: MemoryStoreDocument): void {
  const abs = memoryStorePath(workspacePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

export function listMemoryRecords(
  workspacePath: string,
  filter?: { status?: MemoryRecordStatus; category?: string }
): MemoryRecord[] {
  const doc = readMemoryStore(workspacePath);
  return doc.records.filter((r) => {
    if (filter?.status && r.status !== filter.status) return false;
    if (filter?.category && r.category !== filter.category) return false;
    return true;
  });
}

export function upsertMemoryDraft(
  workspacePath: string,
  input: { id?: string; category: string; body: string }
): MemoryRecord {
  const doc = readMemoryStore(workspacePath);
  const now = new Date().toISOString();
  const id = input.id?.trim() || `mem_${randomUUID()}`;
  const existing = doc.records.find((r) => r.id === id);
  if (existing && existing.status === "pruned") {
    throw new Error(`Memory record '${id}' is pruned; create a new id`);
  }
  const next: MemoryRecord = existing
    ? {
        ...existing,
        category: input.category,
        body: input.body,
        status: "draft",
        updatedAt: now,
        approvedAt: undefined
      }
    : {
        id,
        category: input.category,
        body: input.body,
        status: "draft",
        createdAt: now,
        updatedAt: now
      };
  const records = existing
    ? doc.records.map((r) => (r.id === id ? next : r))
    : [...doc.records, next];
  writeMemoryStore(workspacePath, { schemaVersion: 1, records });
  return next;
}

export function approveMemoryRecord(workspacePath: string, id: string): MemoryRecord {
  const doc = readMemoryStore(workspacePath);
  const rec = doc.records.find((r) => r.id === id);
  if (!rec) throw new Error(`Memory record '${id}' not found`);
  if (rec.status === "pruned") throw new Error(`Memory record '${id}' is pruned`);
  const now = new Date().toISOString();
  const next: MemoryRecord = { ...rec, status: "approved", updatedAt: now, approvedAt: now };
  writeMemoryStore(workspacePath, {
    schemaVersion: 1,
    records: doc.records.map((r) => (r.id === id ? next : r))
  });
  return next;
}

export function pruneMemoryRecord(
  workspacePath: string,
  id: string,
  auditNote: string
): MemoryRecord {
  const doc = readMemoryStore(workspacePath);
  const rec = doc.records.find((r) => r.id === id);
  if (!rec) throw new Error(`Memory record '${id}' not found`);
  const now = new Date().toISOString();
  const next: MemoryRecord = {
    ...rec,
    status: "pruned",
    updatedAt: now,
    prunedAt: now,
    pruneAuditNote: auditNote
  };
  writeMemoryStore(workspacePath, {
    schemaVersion: 1,
    records: doc.records.map((r) => (r.id === id ? next : r))
  });
  return next;
}
