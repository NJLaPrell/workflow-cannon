import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of `test/harness/user-simulation/`. */
export const HARNESS_ROOT = path.resolve(__dirname, "..");

export function getHarnessRoot() {
  return HARNESS_ROOT;
}

export function harnessPath(...segments) {
  return path.join(HARNESS_ROOT, ...segments);
}
