# Config reference (ai)

Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.

| Key | Type | Default | Scope | Module | Exposure | Sensitive | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agentBehavior.activeProfileId | string | "" | project | agent-behavior | maintainer | false | false |

**Description:** Active behavior profile id (e.g. builtin:balanced, custom:slug). Empty string means fall back to builtin default. Mirrored with SQLite module state when present.

| agentBehavior.customProfiles | object | {} | project | agent-behavior | maintainer | false | false |

**Description:** Custom behavior profiles keyed by custom:<slug>; merged with builtins at resolve time. Mirrored with SQLite when using unified DB.

| improvement.cadence.maxRecommendationCandidatesPerRun | number | 500 | project | improvement | maintainer | false | false |

**Description:** Upper bound on new improvement tasks created per generate-recommendations run (safety cap; direct runs still respect dedupe).

| improvement.cadence.minIntervalMinutes | number | 15 | project | improvement | maintainer | false | false |

**Description:** Minimum minutes between one-shot ingest recommendation generation runs.

| improvement.cadence.skipIfNoNewTranscripts | boolean | true | project | improvement | maintainer | false | false |

**Description:** When true, skip the ingest-time recommendation generation step if transcript sync copied no new files; set false to still score policy/diff/task-transition evidence on a cadence.

| improvement.hooks.afterTaskCompleted | string | "off" | project | improvement | maintainer | false | false |

**Description:** Optional background transcript sync after task-engine transition to completed: off (default), sync, or ingest (ingest requires WORKSPACE_KIT_POLICY_APPROVAL in env).

| improvement.recommendations.heuristicVersion | number | 1 | project | improvement | maintainer | false | false |

**Description:** Improvement ingest admission heuristic: 1 (default, max-of-signals) or 2 (mean-of-signals with alternate threshold).

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

| kit.agentGuidance.displayLabel | string | "" | project | workspace-kit | maintainer | false | true |

**Description:** Optional echo of the user-facing label chosen during onboarding (e.g. Bard); does not drive validation — tier is authoritative.

| kit.agentGuidance.profileSetId | string | "rpg_party_v1" | project | workspace-kit | maintainer | false | true |

**Description:** Agent guidance catalog id. v1: rpg_party_v1 (RPG party tier labels). Advisory only — subordinate to PRINCIPLES and policy.

| kit.agentGuidance.tier | number | 2 | project | workspace-kit | maintainer | false | true |

**Description:** Interaction difficulty tier 1–5 (NPC → BBEG) for advisory agent guidance; see ADR-agent-guidance-profile-rpg-party-v1.md.

| kit.autoCheckpoint.beforeCommands | array | ["run-transition"] | project | workspace-kit | maintainer | true | true |

**Description:** `workspace-kit run` subcommand names that trigger an auto-checkpoint when kit.autoCheckpoint.enabled is true (default includes run-transition).

| kit.autoCheckpoint.enabled | boolean | false | project | workspace-kit | maintainer | true | true |

**Description:** When true, workspace-kit run may create a checkpoint before commands listed in kit.autoCheckpoint.beforeCommands (fail-closed on errors; see ADR-task-linked-checkpoints-v1.md).

| kit.autoCheckpoint.stashWhenDirty | boolean | true | project | workspace-kit | maintainer | true | true |

**Description:** When true (default), dirty worktrees use git stash for auto-checkpoints; when false, dirty worktrees fail auto-checkpoint until clean.

| kit.currentPhaseLabel | string | "" | project | workspace-kit | maintainer | false | false |

**Description:** Optional human-readable phase label (for explain-config / operator context); does not replace task.phase strings.

| kit.currentPhaseNumber | number | 0 | project | workspace-kit | maintainer | false | false |

**Description:** Optional positive integer for operator UX / bootstrap when SQLite workspace status is absent. When **`kit_workspace_status`** exists (**`user_version` ≥ 10**), readers use the DB row first; this key does not override it. Doctor may note config vs DB drift without failing.

| kit.githubInvocation.allowedRepositories | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Full repository names (owner/repo) permitted for GitHub-native invocation. Empty = deny all remote runs.

| kit.githubInvocation.commentDebounceSeconds | number | 0 | project | workspace-kit | maintainer | false | true |

**Description:** Minimum seconds between automated runner actions for the same issue/PR thread (in-process only; multi-replica setups need external coordination). 0 disables debounce.

| kit.githubInvocation.enabled | boolean | false | project | workspace-kit | maintainer | true | true |

**Description:** When true, the reference GitHub delivery runner may spawn workspace-kit for allowed repositories (still requires allowlist + signature or trusted Actions context). Default false: no remote invocation.

| kit.githubInvocation.eventPlaybookMap | object | {} | project | workspace-kit | maintainer | true | true |

**Description:** Maps GitHub event name (e.g. issue_comment, pull_request_review) to route kind: plan, implement, review, fix-review, or none. Slash commands in the comment body override this map. See ADR-github-native-invocation.md.

| kit.githubInvocation.planOnlyRunCommands | array | ["get-next-actions","list-tasks","get-task"] | project | workspace-kit | maintainer | true | true |

**Description:** workspace-kit run subcommand names allowed for plan route (e.g. get-next-actions, list-tasks, get-task). Runner rejects plan invocations outside this list.

| kit.githubInvocation.rateLimitEventsPerHour | number | 0 | project | workspace-kit | maintainer | false | false |

**Description:** Placeholder for future rate limiting: max automated invocations per rolling hour per repo (0 = not enforced by reference runner).

| kit.githubInvocation.sensitiveRunCommands | array | ["run-transition"] | project | workspace-kit | maintainer | true | true |

**Description:** workspace-kit run subcommand names permitted for implement/review routes when WORKSPACE_KIT_GITHUB_RUN_ARGS_JSON + WORKSPACE_KIT_GITHUB_RUN_POLICY_APPROVAL are supplied (maintainer-controlled JSON).

| kit.lifecycleHooks.enabled | boolean | false | project | workspace-kit | maintainer | true | true |

**Description:** When true, registered kit.lifecycleHooks.handlers may run for configured lifecycle events (see ADR-agent-task-lifecycle-hooks-v1.md).

| kit.lifecycleHooks.mode | string | "off" | project | workspace-kit | maintainer | true | true |

**Description:** Hook posture: off (disabled), observe (handlers run; deny/modify logged only), enforce (deny stops work; modify merges allowed patches).

| kit.lifecycleHooks.traceRelativePath | string | ".workspace-kit/kit/lifecycle-hook-traces.jsonl" | project | workspace-kit | maintainer | false | false |

**Description:** Workspace-relative append-only JSONL trace path for hook invocations (no secrets; see lifecycle hooks runbook).

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

| plugins.discoveryRoots | array | [".claude/plugins"] | project | plugins | maintainer | false | false |

**Description:** Workspace-relative directories scanned for Claude Code–layout plugins: <root>/<plugin>/.claude-plugin/plugin.json.

| policy.extraSensitiveModuleCommands | array | [] | project | workspace-kit | maintainer | true | true |

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

| responseTemplates.commandOverrides | object | {} | project | workspace-kit | maintainer | false | false |

**Description:** Map of module command name to builtin response template id.

| responseTemplates.defaultTemplateId | string | "default" | project | workspace-kit | maintainer | false | false |

**Description:** Builtin response template id applied when a run does not specify one.

| responseTemplates.enforcementMode | string | "advisory" | project | workspace-kit | maintainer | false | false |

**Description:** `advisory`: unknown template ids, invalid default/override ids, and explicit-vs-directive template conflicts emit warnings only. `strict`: same conditions fail the command (`response-template-invalid` or `response-template-conflict`) after the module runs; use for CI governance.

| skills.discoveryRoots | array | [".claude/skills"] | project | skills | maintainer | false | false |

**Description:** Workspace-relative directories scanned for skill packs (Claude-shaped: <root>/<skill-id>/SKILL.md).

| tasks.persistenceBackend | string | "sqlite" | project | task-engine | public | false | false |

**Description:** Task + wishlist runtime persistence: sqlite only (unified planning DB).

| tasks.planningGenerationPolicy | string | "off" | project | task-engine | public | false | false |

**Description:** How strictly mutating task-engine / planning-store commands must pass expectedPlanningGeneration for SQLite optimistic concurrency: off (optional token, last-writer-wins when omitted), warn (omit allowed but response may include planningGenerationPolicyWarnings), require (omit fails with planning-generation-required). Published default is off; maintainer repos often set require.

| tasks.sqliteDatabaseRelativePath | string | ".workspace-kit/tasks/workspace-kit.db" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to the SQLite file when persistenceBackend is sqlite.

| tasks.storeRelativePath | string | ".workspace-kit/tasks/state.json" | project | task-engine | public | false | false |

**Description:** Relative path (from workspace root) to legacy task JSON used only by migrate-task-persistence when importing old files.

| tasks.strictValidation | boolean | false | project | task-engine | public | false | false |

**Description:** When true, task mutations validate the full active task set before persistence and fail on invalid task records.

