REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pnpm run build && cd extensions/cursor-workflow-cannon && npm run compile && npx @vscode/vsce package --no-dependencies
cd "$REPO_ROOT"
./install-vsix.sh
