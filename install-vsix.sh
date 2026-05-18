#!/usr/bin/env bash
# Install the most recently built cursor-workflow-cannon VSIX into Cursor (or VS Code).
#
# Usage:
#   ./install-vsix.sh              # auto-pick newest VSIX, prefer `cursor`, fall back to `code`
#   ./install-vsix.sh path/to.vsix # install a specific VSIX
#   EDITOR_CLI=code ./install-vsix.sh  # force a specific CLI
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_DIR="$REPO_ROOT/extensions/cursor-workflow-cannon"

if [[ $# -ge 1 ]]; then
  VSIX="$1"
else
  VSIX="$(ls -t "$VSIX_DIR"/cursor-workflow-cannon-*.vsix 2>/dev/null | head -1 || true)"
fi

if [[ -z "${VSIX:-}" || ! -f "$VSIX" ]]; then
  echo "error: no VSIX found in $VSIX_DIR — run ./build-vsix.sh first" >&2
  exit 1
fi

# Pick CLI: respect $EDITOR_CLI, else prefer cursor, else code.
CLI="${EDITOR_CLI:-}"
if [[ -z "$CLI" ]]; then
  if command -v cursor >/dev/null 2>&1; then
    CLI="cursor"
  elif command -v code >/dev/null 2>&1; then
    CLI="code"
  else
    echo "error: neither 'cursor' nor 'code' is on PATH; set EDITOR_CLI=<command>" >&2
    exit 1
  fi
fi

echo "Installing $(basename "$VSIX") via $CLI..."
"$CLI" --install-extension "$VSIX" --force
echo "Done. Reload your editor window (Developer: Reload Window) to pick up the new webview."
