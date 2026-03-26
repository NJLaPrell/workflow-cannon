# Config reference (ai)

Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.

| Key | Type | Default | Scope | Module | Exposure | Sensitive | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| improvement.cadence.minIntervalMinutes | number | 15 | project | improvement | maintainer | false | false |

**Description:** Minimum minutes between one-shot ingest recommendation generation runs.

| improvement.cadence.skipIfNoNewTranscripts | boolean | true | project | improvement | maintainer | false | false |

**Description:** Skip recommendation generation when transcript sync copies no new files.

| improvement.transcripts.archivePath | string | "agent-transcripts" | project | improvement | public | false | false |

**Description:** Relative local archive path where synced transcript JSONL files are copied.

| improvement.transcripts.sourcePath | string | ".cursor/agent-transcripts" | project | improvement | public | false | false |

**Description:** Relative path to transcript JSONL source files for sync operations.

| policy.extraSensitiveModuleCommands | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

| tasks.storeRelativePath | string | ".workspace-kit/tasks/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the task engine JSON state file.

