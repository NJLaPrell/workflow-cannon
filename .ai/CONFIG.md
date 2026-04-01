# Config reference (ai)

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

| kit.currentPhaseLabel | string | "" | project | workspace-kit | maintainer | false | false |

**Description:** Optional human-readable phase label (for explain-config / operator context); does not replace task.phase strings.

| kit.currentPhaseNumber | number | 0 | project | workspace-kit | maintainer | false | false |

**Description:** Optional positive integer marking the maintainer’s current kit phase number. When set, queue-health and phase hints prefer this over parsing docs/maintainers/data/workspace-kit-status.yaml. Must agree with that YAML when both are set (workspace-kit doctor warns on mismatch).

| modules.disabled | array | [] | project | workspace-kit | maintainer | false | false |

**Description:** Module ids to disable after computing the candidate enabled set (default-by-flag or modules.enabled whitelist).

| modules.enabled | array | [] | project | workspace-kit | maintainer | false | false |

**Description:** When non-empty, only these module ids are enabled (whitelist); then modules.disabled subtracts. When empty, all modules use registration.enabledByDefault.

| planning.adaptiveFinalizePolicy | string | "off" | project | planning | maintainer | false | false |

**Description:** Controls finalize handling for unresolved adaptive follow-up questions: off (ignore), warn (allow finalize with warnings), block (deny finalize).

| planning.defaultQuestionDepth | string | "adaptive" | project | planning | maintainer | false | false |

**Description:** Planning interview depth mode: minimal (critical only), guided (critical + static follow-ups), or adaptive (context-driven follow-ups).

| planning.hardBlockCriticalUnknowns | boolean | true | project | planning | maintainer | false | false |

**Description:** When true, planning finalize requests fail until critical unknown questions are answered.

| planning.rulePacks | object | {} | project | planning | maintainer | false | false |

**Description:** Optional object overrides for planning rule packs by workflow type (`baseQuestions` and `adaptiveQuestions`).

| policy.extraSensitiveModuleCommands | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

| responseTemplates.commandOverrides | object | {} | project | workspace-kit | maintainer | false | false |

**Description:** Map of module command name to builtin response template id.

| responseTemplates.defaultTemplateId | string | "default" | project | workspace-kit | maintainer | false | false |

**Description:** Builtin response template id applied when a run does not specify one.

| responseTemplates.enforcementMode | string | "advisory" | project | workspace-kit | maintainer | false | false |

**Description:** `advisory`: unknown template ids, invalid default/override ids, and explicit-vs-directive template conflicts emit warnings only. `strict`: same conditions fail the command (`response-template-invalid` or `response-template-conflict`) after the module runs; use for CI governance.

| tasks.persistenceBackend | string | "sqlite" | project | task-engine | public | false | false |

**Description:** Task + wishlist persistence: sqlite (default) or json (opt-out for legacy workflows).

| tasks.sqliteDatabaseRelativePath | string | ".workspace-kit/tasks/workspace-kit.db" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the SQLite file when persistenceBackend is sqlite.

| tasks.storeRelativePath | string | ".workspace-kit/tasks/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the task engine JSON state file.

| tasks.strictValidation | boolean | false | project | task-engine | public | false | false |

**Description:** When true, task mutations validate the full active task set before persistence and fail on invalid task records.

| tasks.wishlistStoreRelativePath | string | ".workspace-kit/wishlist/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the Wishlist JSON store when persistenceBackend is json.

