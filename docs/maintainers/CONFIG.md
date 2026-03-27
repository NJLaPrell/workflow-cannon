# Config reference (human)

Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.

| Key | Type | Default | Scope | Module | Exposure | Sensitive | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| improvement.cadence.maxRecommendationCandidatesPerRun | number | 500 | project | improvement | maintainer | false | false |

**Description:** Upper bound on new improvement tasks created per generate-recommendations run (safety cap; direct runs still respect dedupe).

| improvement.cadence.minIntervalMinutes | number | 15 | project | improvement | maintainer | false | false |

**Description:** Minimum minutes between one-shot ingest recommendation generation runs.

| improvement.cadence.skipIfNoNewTranscripts | boolean | true | project | improvement | maintainer | false | false |

**Description:** Skip recommendation generation when transcript sync copies no new files.

| improvement.hooks.afterTaskCompleted | string | "off" | project | improvement | maintainer | false | false |

**Description:** Optional background transcript sync after task-engine transition to completed: off (default), sync, or ingest (ingest requires WORKSPACE_KIT_POLICY_APPROVAL in env).

| improvement.transcripts.archivePath | string | "agent-transcripts" | project | improvement | public | false | false |

**Description:** Relative local archive path where synced transcript JSONL files are copied.

| improvement.transcripts.discoveryPaths | array | [] | project | improvement | maintainer | false | false |

**Description:** Ordered relative paths tried when improvement.transcripts.sourcePath is unset (first existing wins). After these, sync tries Cursor global ~/.cursor/projects/<slug>/agent-transcripts.

| improvement.transcripts.maxBytesPerFile | number | 50000000 | project | improvement | maintainer | false | false |

**Description:** Skip transcript files larger than this many bytes during sync.

| improvement.transcripts.maxFilesPerSync | number | 5000 | project | improvement | maintainer | false | false |

**Description:** Maximum JSONL transcript files processed per sync (deterministic order).

| improvement.transcripts.maxTotalScanBytes | number | 500000000 | project | improvement | maintainer | false | false |

**Description:** Approximate cap on total bytes read for hashing during one sync.

| improvement.transcripts.sourcePath | string | "" | project | improvement | public | false | false |

**Description:** Optional relative path to transcript JSONL source. When empty, sync uses discoveryPaths (repo-relative, then Cursor global ~/.cursor/projects/<slug>/agent-transcripts).

| policy.extraSensitiveModuleCommands | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

| responseTemplates.commandOverrides | object | {} | project | workspace-kit | maintainer | false | false |

**Description:** Map of module command name to builtin response template id.

| responseTemplates.defaultTemplateId | string | "default" | project | workspace-kit | maintainer | false | false |

**Description:** Builtin response template id applied when a run does not specify one.

| responseTemplates.enforcementMode | string | "advisory" | project | workspace-kit | maintainer | false | false |

**Description:** `advisory`: unknown template ids, invalid default/override ids, and explicit-vs-directive template conflicts emit warnings only. `strict`: same conditions fail the command (`response-template-invalid` or `response-template-conflict`) after the module runs; use for CI governance.

| tasks.storeRelativePath | string | ".workspace-kit/tasks/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the task engine JSON state file.

