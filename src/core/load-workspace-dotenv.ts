import { existsSync } from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

/**
 * Load the first `.env` found walking up from `startDir` (inclusive).
 * Does not override keys already present in `process.env` (shell wins).
 */
export function loadWorkspaceDotenv(startDir: string): void {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  for (;;) {
    const envPath = path.join(dir, ".env");
    if (existsSync(envPath)) {
      dotenvConfig({ path: envPath, override: false, quiet: true });
      return;
    }
    if (dir === root) return;
    dir = path.dirname(dir);
  }
}
