#!/usr/bin/env node
/**
 * Assembles a non-certification "what we won't do" boundary doc from existing sources.
 * Output: artifacts/kit-trust-boundary.md (gitignored dir ok; copy into release notes if needed)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(ROOT, "artifacts");
const out = path.join(outDir, "kit-trust-boundary.md");

const principles = fs.readFileSync(path.join(ROOT, ".ai", "PRINCIPLES.md"), "utf8").split("\n").slice(0, 40).join("\n");
const modulesReadme = fs.existsSync(path.join(ROOT, "src", "modules", "README.md"))
  ? fs.readFileSync(path.join(ROOT, "src", "modules", "README.md"), "utf8").split("\n").slice(0, 60).join("\n")
  : "(no src/modules/README.md)";

const body = `# Kit trust boundary (generated)

**Not a certification.** This file is an automated excerpt for maintainers — not a security guarantee.

## Principles excerpt

\`\`\`
${principles}
\`\`\`

## Modules README excerpt

\`\`\`
${modulesReadme}
\`\`\`

## Non-goals (summary)

- No silent bypass of policy-governed \`workspace-kit run\` without JSON \`policyApproval\`, session grant, or interactive approval.
- No task lifecycle ownership by Git merge events (\`run-transition\` remains authoritative).
- No LSP or IDE-specific core dependency — editors integrate via CLI subprocesses (see \`docs/maintainers/runbooks/ide-kit-status-protocol.md\`).

Regenerate: \`pnpm run generate-kit-trust-boundary\`
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, body, "utf8");
process.stdout.write(out + "\n");
