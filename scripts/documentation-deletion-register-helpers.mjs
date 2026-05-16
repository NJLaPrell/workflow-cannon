/**
 * Validates docs/maintainers/data/documentation-deletion-register.v1.json (T100200).
 * Keep in sync with the JSON schema implied by check-documentation-deletion-register.mjs.
 */

import fs from "node:fs";
import path from "node:path";

const DISPOSITIONS = new Set(["deleted", "archived"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {string} p
 */
function isSafeRepoRelativePath(p) {
  if (!p || typeof p !== "string") return false;
  const n = p.trim();
  if (!n || n.startsWith("/") || n.startsWith("\\")) return false;
  if (n.includes("\0")) return false;
  const parts = n.split(/[/\\]/);
  return !parts.some((seg) => seg === ".." || seg === "");
}

/**
 * @param {unknown} register
 * @param {string} rootAbs
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateDeletionRegister(register, rootAbs) {
  const errors = [];
  const warnings = [];

  if (!isRecord(register)) {
    errors.push("register root must be an object");
    return { errors, warnings };
  }
  if (register.schemaVersion !== 1) {
    errors.push(`register.schemaVersion must be 1 (got ${String(register.schemaVersion)})`);
  }
  if (typeof register.title !== "string" || !register.title.trim()) {
    errors.push("register.title must be a non-empty string");
  }
  if (typeof register.updatedAt !== "string" || !register.updatedAt.trim()) {
    errors.push("register.updatedAt must be a non-empty ISO-ish timestamp string");
  } else if (Number.isNaN(Date.parse(register.updatedAt))) {
    errors.push("register.updatedAt must be parseable as a date");
  }

  const entries = register.entries;
  if (!Array.isArray(entries)) {
    errors.push("register.entries must be an array");
    return { errors, warnings };
  }

  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const px = `entries[${i}]`;
    if (!isRecord(e)) {
      errors.push(`${px} must be an object`);
      continue;
    }
    const p = e.path;
    if (!isSafeRepoRelativePath(p)) {
      errors.push(`${px}.path must be a safe repo-relative path (no .. segments)`);
      continue;
    }
    if (seen.has(p)) errors.push(`duplicate register path: ${p}`);
    seen.add(p);

    const disposition = e.disposition;
    if (!DISPOSITIONS.has(disposition)) {
      errors.push(`${px}.disposition must be deleted or archived`);
    }
    const confidence = e.confidence;
    if (!CONFIDENCES.has(confidence)) {
      errors.push(`${px}.confidence must be high, medium, or low`);
    } else if (confidence === "medium" && disposition === "deleted") {
      warnings.push(`${p}: medium-confidence row uses disposition deleted — prefer archive-first unless policy says otherwise`);
    }

    if (typeof e.rationale !== "string" || !e.rationale.trim()) {
      errors.push(`${px}.rationale must be a non-empty string`);
    }
    if (typeof e.replacement !== "string") {
      errors.push(`${px}.replacement must be a string (use empty string when none)`);
    }
    if (!Array.isArray(e.inboundLinks)) {
      errors.push(`${px}.inboundLinks must be an array (empty when none)`);
    }
    if (!Array.isArray(e.taskRefs)) {
      errors.push(`${px}.taskRefs must be an array`);
    }
    if (!Array.isArray(e.releaseRefs)) {
      errors.push(`${px}.releaseRefs must be an array`);
    }
    if (typeof e.packageImpact !== "string" || !e.packageImpact.trim()) {
      errors.push(`${px}.packageImpact must be a non-empty string`);
    }
    if (!isRecord(e.evidence)) {
      errors.push(`${px}.evidence must be an object`);
    } else if (Object.keys(e.evidence).length === 0) {
      errors.push(`${px}.evidence must include at least one evidence field`);
    }

    const abs = path.join(rootAbs, p);
    if (disposition === "deleted") {
      if (fs.existsSync(abs)) {
        errors.push(`path marked deleted still exists on disk: ${p}`);
      }
    } else if (disposition === "archived") {
      if (!p.replaceAll("\\", "/").startsWith("docs/maintainers/archive/")) {
        errors.push(`archived path must live under docs/maintainers/archive/: ${p}`);
      }
      if (!fs.existsSync(abs)) {
        errors.push(`path marked archived is missing on disk: ${p}`);
      }
    }
  }

  return { errors, warnings };
}
