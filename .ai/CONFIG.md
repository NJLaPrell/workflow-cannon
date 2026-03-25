# Config reference (ai)

Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.

| Key | Type | Default | Scope | Module | Exposure | Sensitive | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| policy.extraSensitiveModuleCommands | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

| tasks.storeRelativePath | string | ".workspace-kit/tasks/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the task engine JSON state file.

