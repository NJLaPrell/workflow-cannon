---
name: cursor-workflow-cannon extension build quirk
description: root pnpm build does not recompile the extension's dist/ output; must build the extension package directly
---
Running `pnpm run build` from the workspace root only builds the root `workspace-kit` package (tsc), NOT `extensions/cursor-workflow-cannon`. Its `dist/` can silently stay stale after source edits.

**Why:** Wasted a build/verify cycle believing edits weren't taking effect (dist file mtime was hours old) when actually the wrong package had been compiled.

**How to apply:** After editing files under `extensions/cursor-workflow-cannon/src`, rebuild with `cd extensions/cursor-workflow-cannon && npx tsc -p tsconfig.json` (or the package's own build script) before regenerating any preview/repro, and verify via `dist/.../*.js` mtime or grep for the new code.
