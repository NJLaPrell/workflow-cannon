import type { ConfigEditorKind, ConfigKeyRowInput } from "./render-config.js";
import { pickEditorKind } from "./render-config.js";

export type ConfigInputValidationResult =
  | { ok: true; value: unknown; serialized: string }
  | { ok: false; message: string };

function deepEqualLoose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function typeLabel(row: ConfigKeyRowInput): string {
  return (row.type || "string").toLowerCase();
}

function assertAllowedValue(row: ConfigKeyRowInput, value: unknown): string | null {
  const allowed = row.allowedValues;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return null;
  }
  if (!allowed.some((v) => deepEqualLoose(v, value))) {
    return `Value must be one of: ${allowed.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  return null;
}

function assertType(row: ConfigKeyRowInput, value: unknown): string | null {
  const t = typeLabel(row);
  if (t === "boolean") {
    return typeof value === "boolean" ? null : "Expected a boolean.";
  }
  if (t === "number" || t === "integer") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "Expected a number.";
    }
    if (t === "integer" && !Number.isInteger(value)) {
      return "Expected an integer.";
    }
    return null;
  }
  if (t === "string") {
    return typeof value === "string" ? null : "Expected a string.";
  }
  if (t === "array") {
    return Array.isArray(value) ? null : "Expected a JSON array.";
  }
  if (t === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return "Expected a JSON object.";
    }
    return null;
  }
  return null;
}

/**
 * Parse and validate a config row editor value before `workspace-kit config set`.
 */
export function validateConfigInputValue(
  row: ConfigKeyRowInput,
  rawValue: string,
  editorKind?: ConfigEditorKind
): ConfigInputValidationResult {
  const kind = editorKind ?? pickEditorKind(row);

  if (kind === "toggle") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return { ok: false, message: "Toggle value must be true or false." };
    }
    if (typeof parsed !== "boolean") {
      return { ok: false, message: "Expected a boolean." };
    }
    const typeErr = assertType(row, parsed);
    if (typeErr) return { ok: false, message: typeErr };
    const allowedErr = assertAllowedValue(row, parsed);
    if (allowedErr) return { ok: false, message: allowedErr };
    return { ok: true, value: parsed, serialized: JSON.stringify(parsed) };
  }

  if (kind === "select") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = rawValue;
    }
    const allowedErr = assertAllowedValue(row, parsed);
    if (allowedErr) return { ok: false, message: allowedErr };
    const typeErr = assertType(row, parsed);
    if (typeErr) return { ok: false, message: typeErr };
    return { ok: true, value: parsed, serialized: JSON.stringify(parsed) };
  }

  if (kind === "number") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return { ok: false, message: "Enter a number." };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, message: "Expected a finite number." };
    }
    const typeErr = assertType(row, n);
    if (typeErr) return { ok: false, message: typeErr };
    const allowedErr = assertAllowedValue(row, n);
    if (allowedErr) return { ok: false, message: allowedErr };
    return { ok: true, value: n, serialized: JSON.stringify(n) };
  }

  if (kind === "text") {
    let parsed: string;
    try {
      const j = JSON.parse(rawValue);
      if (typeof j === "string") {
        parsed = j;
      } else {
        parsed = rawValue;
      }
    } catch {
      parsed = rawValue;
    }
    const typeErr = assertType(row, parsed);
    if (typeErr) return { ok: false, message: typeErr };
    const allowedErr = assertAllowedValue(row, parsed);
    if (allowedErr) return { ok: false, message: allowedErr };
    return { ok: true, value: parsed, serialized: JSON.stringify(parsed) };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ok: false, message: "Value is required. Use Unset on layer to clear an override." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid JSON";
    return { ok: false, message: `Value must be valid JSON: ${msg}` };
  }
  const typeErr = assertType(row, parsed);
  if (typeErr) return { ok: false, message: typeErr };
  const allowedErr = assertAllowedValue(row, parsed);
  if (allowedErr) return { ok: false, message: allowedErr };
  return { ok: true, value: parsed, serialized: JSON.stringify(parsed) };
}
