import { digestPayload } from "../mutation-utils.js";

/** SHA-256 hex digest of canonical JSON (stable key order). */
export function digestTaskStateCanonicalJson(value: unknown): string {
  return digestPayload(value);
}
