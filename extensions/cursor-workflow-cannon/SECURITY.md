# Extension security notes

## Threat model summary

- The extension is a thin client over `workspace-kit` CLI.
- It must not write task/config state directly.
- All sensitive mutations must pass through CLI policy controls.

## Data flow

1. UI action -> extension command handler.
2. Handler invokes `CommandClient`.
3. `CommandClient` executes `workspace-kit` (`dist/cli.js` or package install path).
4. JSON response is rendered in webview/tree with sanitization.

## Guardrails

- No direct writes to `.workspace-kit/tasks/state.json` or `.workspace-kit/config.json`.
- Policy-denied responses are surfaced to users as explicit errors.
- Webview content security policy blocks remote resource loads.
- Task/dashboard/config views consume command output rather than scraping files for aggregate state.

## Review checklist

- [ ] Commands that mutate state use `run-transition` or `workspace-kit config` only.
- [ ] Webview message handlers validate `type` and expected payload shape.
- [ ] No secret-bearing environment values are logged.
- [ ] UI strings that include command output are escaped/sanitized before rendering.
