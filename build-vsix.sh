pnpm run build && cd extensions/cursor-workflow-cannon && npm run compile && npx @vscode/vsce package --no-dependencies
./install-vsix.sh
