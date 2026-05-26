import fs from "node:fs";
import path from "node:path";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import { TASK_STATE_MANIFEST_RELATIVE, TASK_STATE_ROOT_DIR } from "./constants.js";
import { digestTaskStateCanonicalJson } from "./integrity.js";
import { resolveSnapshotContentRelativePath, resolveSnapshotMetaRelativePath } from "./layout.js";
import type { TaskStateGitSnapshotMetaV1 } from "./types.js";
import {
  computeManifestDigest,
  validateTaskStateGitManifest
} from "./validate-manifest.js";
import { validateTaskStateGitSnapshotMeta } from "./validate-snapshot-meta.js";

export type TaskStateVerifyFindingCode =
  | "manifest-missing"
  | "manifest-invalid"
  | "manifest-digest-mismatch"
  | "snapshot-meta-missing"
  | "snapshot-meta-invalid"
  | "snapshot-content-missing"
  | "snapshot-content-digest-mismatch"
  | "event-segment-missing"
  | "event-parse-failed"
  | "event-sequence-gap"
  | "event-parent-mismatch"
  | "event-head-sequence-mismatch"
  | "event-unsupported-schema-version"
  | "event-unknown-event-kind"
  | "event-schema-validation-failed"
  | "event-admission-rejected";

export type TaskStateVerifyFinding = {
  code: TaskStateVerifyFindingCode | string;
  message: string;
  path?: string;
};

export type TaskStateVerifyResult = {
  passed: boolean;
  findingCount: number;
  findings: TaskStateVerifyFinding[];
};

function readUtf8(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseJsonLines(text: string): { ok: true; values: unknown[] } | { ok: false; message: string } {
  const values: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    try {
      values.push(JSON.parse(trimmed) as unknown);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  return { ok: true, values };
}

function admissionCodeToFindingCode(code: string): TaskStateVerifyFindingCode {
  switch (code) {
    case "unsupported-schema-version":
      return "event-unsupported-schema-version";
    case "unknown-event-kind":
      return "event-unknown-event-kind";
    case "schema-validation-failed":
      return "event-schema-validation-failed";
    default:
      return "event-admission-rejected";
  }
}

function verifyEventChain(events: TaskStateEventV1[], findings: TaskStateVerifyFinding[]): void {
  if (events.length === 0) {
    return;
  }

  const bySequence = [...events].sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
  const maxSequence = bySequence.at(-1)?.sequence ?? 0;

  for (let expected = 0; expected <= maxSequence; expected++) {
    if (!bySequence.some((event) => event.sequence === expected)) {
      findings.push({
        code: "event-sequence-gap",
        message: `Missing event for sequence ${expected} (max sequence ${maxSequence})`
      });
    }
  }

  const eventsBySequence = new Map<number, TaskStateEventV1>();
  for (const event of bySequence) {
    eventsBySequence.set(event.sequence, event);
  }

  for (const event of bySequence) {
    if (event.sequence === 0) {
      if (event.parentEventId !== null) {
        findings.push({
          code: "event-parent-mismatch",
          message: `Sequence 0 event ${event.eventId} must have parentEventId null, got ${String(event.parentEventId)}`
        });
      }
      continue;
    }
    const parent = eventsBySequence.get(event.sequence - 1);
    const expectedParentId = parent?.eventId ?? null;
    if (event.parentEventId !== expectedParentId) {
      findings.push({
        code: "event-parent-mismatch",
        message: `Event ${event.eventId} (sequence ${event.sequence}) parentEventId ${String(event.parentEventId)} expected ${String(expectedParentId)}`
      });
    }
  }
}

function verifySnapshot(
  layoutRoot: string,
  snapshotId: string,
  findings: TaskStateVerifyFinding[]
): void {
  const metaRel = resolveSnapshotMetaRelativePath(snapshotId);
  const metaAbs = path.join(layoutRoot, metaRel);
  const metaText = readUtf8(metaAbs);
  if (!metaText) {
    findings.push({
      code: "snapshot-meta-missing",
      message: `Missing snapshot metadata at ${metaRel}`,
      path: metaRel
    });
    return;
  }
  let metaParsed: unknown;
  try {
    metaParsed = JSON.parse(metaText) as unknown;
  } catch {
    findings.push({
      code: "snapshot-meta-invalid",
      message: `Snapshot metadata is not valid JSON at ${metaRel}`,
      path: metaRel
    });
    return;
  }
  const metaValidated = validateTaskStateGitSnapshotMeta(metaParsed);
  if (!metaValidated.ok) {
    findings.push({
      code: "snapshot-meta-invalid",
      message: metaValidated.errors.join("; "),
      path: metaRel
    });
    return;
  }
  const meta = metaValidated.data as TaskStateGitSnapshotMetaV1;
  const contentRel = meta.contentPath.startsWith(`${TASK_STATE_ROOT_DIR}/`)
    ? meta.contentPath
    : path.posix.join(TASK_STATE_ROOT_DIR, meta.contentPath);
  const contentAbs = path.join(layoutRoot, contentRel);
  const contentText = readUtf8(contentAbs);
  if (!contentText) {
    findings.push({
      code: "snapshot-content-missing",
      message: `Missing snapshot content at ${contentRel}`,
      path: contentRel
    });
    return;
  }
  let contentParsed: unknown;
  try {
    contentParsed = JSON.parse(contentText) as unknown;
  } catch {
    findings.push({
      code: "snapshot-content-digest-mismatch",
      message: `Snapshot content is not valid JSON at ${contentRel}`,
      path: contentRel
    });
    return;
  }
  const digest = digestTaskStateCanonicalJson(contentParsed);
  if (digest !== meta.contentDigest) {
    findings.push({
      code: "snapshot-content-digest-mismatch",
      message: `Snapshot ${snapshotId} contentDigest mismatch: expected ${meta.contentDigest}, computed ${digest}`,
      path: contentRel
    });
  }
}

/** Verify on-disk layout under `<workspace>/task-state/` (or explicit layout root). */
export function verifyTaskStateLayoutOnDisk(layoutRoot: string): TaskStateVerifyResult {
  const findings: TaskStateVerifyFinding[] = [];
  const manifestAbs = path.join(layoutRoot, TASK_STATE_MANIFEST_RELATIVE);
  const manifestText = readUtf8(manifestAbs);
  if (!manifestText) {
    findings.push({
      code: "manifest-missing",
      message: `Missing ${TASK_STATE_MANIFEST_RELATIVE}`,
      path: TASK_STATE_MANIFEST_RELATIVE
    });
    return finalize(findings);
  }

  let manifestParsed: unknown;
  try {
    manifestParsed = JSON.parse(manifestText) as unknown;
  } catch {
    findings.push({
      code: "manifest-invalid",
      message: "Manifest is not valid JSON",
      path: TASK_STATE_MANIFEST_RELATIVE
    });
    return finalize(findings);
  }

  const manifestResult = validateTaskStateGitManifest(manifestParsed);
  if (!manifestResult.ok) {
    findings.push({
      code: "manifest-invalid",
      message: manifestResult.errors.join("; "),
      path: TASK_STATE_MANIFEST_RELATIVE
    });
    return finalize(findings);
  }

  const manifest = manifestResult.data;
  if (manifest.manifestDigest) {
    const expected = computeManifestDigest(manifest);
    if (manifest.manifestDigest !== expected) {
      findings.push({
        code: "manifest-digest-mismatch",
        message: `manifestDigest mismatch: expected ${expected}, got ${manifest.manifestDigest}`,
        path: TASK_STATE_MANIFEST_RELATIVE
      });
    }
  }

  const eventsDir = path.join(layoutRoot, TASK_STATE_ROOT_DIR, "events");
  const eventPaths: string[] = [];
  if (fs.existsSync(eventsDir)) {
    for (const name of fs.readdirSync(eventsDir).sort()) {
      if (name.endsWith(".jsonl")) {
        eventPaths.push(path.join(eventsDir, name));
      }
    }
  }

  const rawEvents: unknown[] = [];
  for (const segmentAbs of eventPaths) {
    const segmentRel = path.relative(layoutRoot, segmentAbs).split(path.sep).join("/");
    const text = readUtf8(segmentAbs);
    if (text === null) {
      findings.push({
        code: "event-segment-missing",
        message: `Missing segment ${segmentRel}`,
        path: segmentRel
      });
      continue;
    }
    const lines = parseJsonLines(text);
    if (!lines.ok) {
      findings.push({
        code: "event-parse-failed",
        message: `Failed to parse JSONL in ${segmentRel}: ${lines.message}`,
        path: segmentRel
      });
      continue;
    }
    rawEvents.push(...lines.values);
  }

  let parsedEvents: TaskStateEventV1[] = [];
  const admitted = admitTaskStateEventStream(rawEvents);
  if (!admitted.ok) {
    findings.push({
      code: admissionCodeToFindingCode(admitted.error.code),
      message: admitted.error.message,
      path: admitted.error.details?.join("; ")
    });
  } else {
    parsedEvents = admitted.events;
    verifyEventChain(parsedEvents, findings);
  }

  const maxSequence =
    parsedEvents.length > 0 ? Math.max(...parsedEvents.map((event) => event.sequence)) : 0;
  if (manifest.head.latestSequence !== maxSequence) {
    findings.push({
      code: "event-head-sequence-mismatch",
      message: `Manifest head.latestSequence ${manifest.head.latestSequence} does not match event tail ${maxSequence}`
    });
  }

  const snapshotId = manifest.head.latestSnapshotId;
  if (snapshotId) {
    verifySnapshot(layoutRoot, snapshotId, findings);
  }

  return finalize(findings);
}

/** Verify `<workspacePath>/task-state/**` layout. */
export function verifyTaskStateLayoutInWorkspace(workspacePath: string): TaskStateVerifyResult {
  return verifyTaskStateLayoutOnDisk(workspacePath);
}

function finalize(findings: TaskStateVerifyFinding[]): TaskStateVerifyResult {
  return {
    passed: findings.length === 0,
    findingCount: findings.length,
    findings
  };
}
