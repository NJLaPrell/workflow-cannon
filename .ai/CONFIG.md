# Config reference (ai)

Generated from `src/core/config-metadata.ts`. Do not edit by hand; run `workspace-kit config generate-docs`.

|slot1= Key |slot2= Type |slot3= Default |slot4= Scope |slot5= Module |slot6= Exposure |slot7= Sensitive |slot8= Approval |slot9=
|slot1= --- |slot2= --- |slot3= --- |slot4= --- |slot5= --- |slot6= --- |slot7= --- |slot8= --- |slot9=
|slot1= improvement.cadence.maxRecommendationCandidatesPerRun |slot2= number |slot3= 500 |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Upper bound on new improvement tasks created per generate-recommendations run (safety cap; direct runs still respect dedupe).

|slot1= improvement.cadence.minIntervalMinutes |slot2= number |slot3= 15 |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Minimum minutes between one-shot ingest recommendation generation runs.

|slot1= improvement.cadence.skipIfNoNewTranscripts |slot2= boolean |slot3= true |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Skip recommendation generation when transcript sync copies no new files.

|slot1= improvement.hooks.afterTaskCompleted |slot2= string |slot3= "off" |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Optional background transcript sync after task-engine transition to completed: off (default), sync, or ingest (ingest requires WORKSPACE_KIT_POLICY_APPROVAL in env).

|slot1= improvement.transcripts.archivePath |slot2= string |slot3= "agent-transcripts" |slot4= project |slot5= improvement |slot6= public |slot7= false |slot8= false |slot9=

**Description:** Relative local archive path where synced transcript JSONL files are copied.

|slot1= improvement.transcripts.discoveryPaths |slot2= array |slot3= [] |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Ordered relative paths tried when improvement.transcripts.sourcePath is unset (first existing wins). After these, sync tries Cursor global ~/.cursor/projects/<slug>/agent-transcripts.

|slot1= improvement.transcripts.maxBytesPerFile |slot2= number |slot3= 50000000 |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Skip transcript files larger than this many bytes during sync.

|slot1= improvement.transcripts.maxFilesPerSync |slot2= number |slot3= 5000 |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Maximum JSONL transcript files processed per sync (deterministic order).

|slot1= improvement.transcripts.maxTotalScanBytes |slot2= number |slot3= 500000000 |slot4= project |slot5= improvement |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Approximate cap on total bytes read for hashing during one sync.

|slot1= improvement.transcripts.sourcePath |slot2= string |slot3= "" |slot4= project |slot5= improvement |slot6= public |slot7= false |slot8= false |slot9=

**Description:** Optional relative path to transcript JSONL source. When empty, sync uses discoveryPaths (repo-relative, then Cursor global ~/.cursor/projects/<slug>/agent-transcripts).

|slot1= policy.extraSensitiveModuleCommands |slot2= array |slot3= [] |slot4= project |slot5= workspace-kit |slot6= maintainer |slot7= true |slot8= true |slot9=

**Description:** Additional module command names (e.g. run subcommands) treated as sensitive for policy approval.

|slot1= responseTemplates.commandOverrides |slot2= object |slot3= {} |slot4= project |slot5= workspace-kit |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Map of module command name to builtin response template id.

|slot1= responseTemplates.defaultTemplateId |slot2= string |slot3= "default" |slot4= project |slot5= workspace-kit |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** Builtin response template id applied when a run does not specify one.

|slot1= responseTemplates.enforcementMode |slot2= string |slot3= "advisory" |slot4= project |slot5= workspace-kit |slot6= maintainer |slot7= false |slot8= false |slot9=

**Description:** `advisory`: unknown template ids, invalid default/override ids, and explicit-vs-directive template conflicts emit warnings only. `strict`: same conditions fail the command (`response-template-invalid` or `response-template-conflict`) after the module runs; use for CI governance.

|slot1= tasks.storeRelativePath |slot2= string |slot3= ".workspace-kit/tasks/state.json" |slot4= project |slot5= task-engine |slot6= public |slot7= false |slot8= false |slot9=

**Description:** Relative path (from workspace root) to the task engine JSON state file.

