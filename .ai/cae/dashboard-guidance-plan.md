# CAE Dashboard Guidance Plan

## Current execution state

This plan is now an execution tracker for the **Guidance** dashboard surface,
not a greenfield proposal.

Implemented first slice:

- `cae-dashboard-summary` — Tier C aggregate for health, registry validation,
  recent traces, acknowledgement rows, and shadow feedback summary.
- `cae-recent-traces` — Tier C durable trace list from kit SQLite.
- `cae-guidance-preview` — Tier C friendly task/workflow preview that builds
  bounded CAE context server-side and returns grouped Guidance cards.
- Cursor extension tab `workflowCannon.guidance` with summary, preview, trace
  explain, acknowledgement, and feedback message handlers.
- Schemas, request fixtures, command manifest rows, instruction files, CLI map
  copy-paste examples, renderer tests, and golden smoke coverage.

Validated evidence:

- `pnpm run build`
- `pnpm --filter cursor-workflow-cannon run compile`
- `node --test test/cae-dashboard-summary.test.mjs test/cae-golden-smoke.test.mjs`
- `node --test test/cae-cli-read-only-schema.test.mjs test/cae-golden-smoke.test.mjs`
- `pnpm --filter cursor-workflow-cannon run test`
- `pnpm run test`
- `node scripts/check-agent-cli-map-coverage.mjs`
- `node scripts/check-builtin-command-manifest.mjs`
- Phase 71 smoke (2026-04-26): `pnpm run build`,
  `pnpm --filter cursor-workflow-cannon run test`,
  `workspace-kit run cae-dashboard-summary`,
  `workspace-kit run cae-guidance-preview` for `T941` + `get-next-actions`
  with structured `commandArgs`, `workspace-kit run cae-explain` for the
  persisted preview trace, and a package/static check confirming
  `workflowCannon.guidance` is contributed while registry editing commands are
  absent from the Guidance UI.

## Product framing

The user-facing dashboard surface is **Guidance**. The technical engine remains
**Context Activation Engine (CAE)** in advanced details, command names, schemas,
and operator recovery output.

Guidance answers:

1. Is the guidance system healthy?
2. What guidance applies to my current task or workflow?
3. Why did that guidance appear?
4. Does anything need acknowledgement or feedback?

## User-facing labels

| CAE term | Guidance label | Use |
| --- | --- | --- |
| CAE | Guidance system | Default UI copy |
| activation | Guidance item | Cards and lists |
| artifact | Source rule or playbook | Advanced source detail |
| bundle | Guidance result | Evaluation output summary |
| trace | Why this appeared | Explainability surface |
| shadow mode | Preview mode | Default non-mutating check |
| live mode | Applies now | Advanced evaluation mode |
| enforcement | Hard stop | Rare blocking lane copy |
| acknowledgement | I read this guidance | CAE acknowledgement only |
| policyApproval | Permission for a sensitive command | Tier A/B command policy |

## Dashboard tab

The **Guidance** tab lives in the Workflow Cannon Cursor extension alongside
Dashboard and Config. The view id is `workflowCannon.guidance`; the header says
**Context Guidance powered by CAE**.

The first screen should stay read-first:

- Guidance status
- Active guidance version
- Persistence and recent activity
- Recent checks
- Acknowledgement summary
- Shadow feedback summary
- Advanced details

Registry editing is out of scope for the first UI. Registry mutation stays in
governed CLI / git / PR workflows.

## Current UI gaps

The first slice works, but these gaps should be closed before calling Guidance
polished:

1. **Picker UX:** task id, command name, and module id are currently typed
   manually. Add recent/ready task selection and a curated workflow picker so
   users do not need to memorize command names.
2. **Trace detail:** `Explain` currently renders the raw `cae-explain` response
   in the status area. Add a dedicated trace detail panel with summary first,
   matched guidance, storage source, retention note, and raw JSON behind
   Advanced details.
3. **Preview inputs:** `argvSummary` is text-only. Add optional JSON
   `commandArgs` input with validation so policy sensitivity and context
   matching can use structured args.
4. **Feedback ergonomics:** Useful/Noisy buttons exist on cards, but the UI
   should offer an optional note field and show post-write confirmation in a
   friendly format instead of dumping JSON.
5. **Acknowledgement ergonomics:** Acknowledge buttons exist for pending
   acknowledgement rows, but actor entry is free-form. Prefer resolved actor
   defaults and only prompt when missing.
6. **Degraded states:** render health/registry/persistence failures as
   plain-language recovery cards, with raw `code` and remediation paths in
   Advanced details.
7. **Extension refresh:** the Guidance view refreshes on kit-state events and
   manual reload, but CAE trace/feedback state does not yet have a dedicated
   watcher. Keep manual refresh visible until watcher coverage is extended.

## Command contract

The dashboard tab should avoid stitching together raw command payloads in the
extension. Use these Tier C read-only commands as the UI contract:

- `cae-dashboard-summary` — aggregate health, validation, trace, acknowledgement,
  and feedback state for initial render.
- `cae-recent-traces` — list recent durable trace summaries from kit SQLite.
- `cae-guidance-preview` — accept friendly task / command inputs, build bounded
  CAE evaluation context, evaluate, and return grouped Guidance cards.

Existing commands remain the drill-down and mutation surfaces:

- `cae-explain` for human-readable trace detail.
- `cae-get-trace` for raw trace retrieval.
- `cae-list-acks` for acknowledgement inspection.
- `cae-shadow-feedback-report` for feedback inspection.
- `cae-satisfy-ack` and `cae-record-shadow-feedback` for explicit,
  policy-aware UI actions.

Contract hardening still needed:

- Add focused tests for degraded `cae-dashboard-summary` states: missing SQLite
  DB, no active registry version, persistence disabled, and registry validation
  failure.
- Persist task/workflow labels and summary counts with durable trace rows, then
  make `cae-recent-traces` prefer that summary over best-effort extraction.
- Keep schema additions additive. Do not break existing CAE read-only payloads
  now that the extension depends on them.

## UI behavior

Default evaluation mode is `shadow`, rendered as **Preview mode**. The UI should
say “would apply” for preview results and reserve “applies now” for live mode.

Guidance cards are grouped as:

- **Rules to follow** (`policy`)
- **Things to consider** (`think`)
- **Suggested steps** (`do`)
- **Review checks** (`review`)
- **Acknowledgement needed** (`pendingAcknowledgements`)
- **Possible guidance conflict** (`conflictShadowSummary`)

Raw CAE ids, trace ids, and artifact ids are visible in advanced details and
copyable, but they should not be required for the happy path.

## Execution phases from here

### Phase A — Ship the MVP safely

Goal: make the current implementation releasable without over-expanding scope.

Tasks:

- Verify the Guidance tab in the extension host manually, including missing CAE
  registry and persistence-disabled states.
- Add degraded-state tests for `cae-dashboard-summary`.
- Add renderer coverage for empty, unhealthy, and persistence-disabled states.
- Confirm packaged extension metadata exposes the Guidance view as expected.
- Keep registry editing out of the UI.

Exit criteria:

- A maintainer can open Guidance, reload status, run a preview, explain a trace,
  and see ack/feedback summaries without reading CAE command docs.

### Phase B — Make preview genuinely easy

Goal: remove command-name and task-id memorization from the happy path.

Tasks:

- Add a task picker fed by existing task commands (`get-ready-queue`,
  `list-tasks`, or dashboard summary data).
- Add a workflow picker seeded from high-value commands and the builtin command
  manifest.
- Add optional structured `commandArgs` JSON input with validation and clear
  errors.
- Show the built bounded context in Advanced details only.

Exit criteria:

- The common path is pick task, pick workflow, preview guidance.

### Phase C — Improve explainability

Goal: make “why did this appear?” understandable without raw JSON.

Tasks:

- Replace status-area JSON for `cae-explain` with a trace detail panel.
- Show matched guidance by family, pending acknowledgements, conflict count,
  storage source, and retention note.
- Keep raw trace and raw explain JSON behind Advanced details or an
  open-document action.

Exit criteria:

- Users can understand a trace result without reading `cae-get-trace`.

### Phase D — Close the tuning loop

Goal: make acknowledgement and feedback useful without blurring policy.

Tasks:

- Improve acknowledgement copy and actor defaulting.
- Add optional feedback notes.
- Show post-action success/failure as friendly UI cards.
- Keep JSON `policyApproval` in every sensitive CAE mutation command payload.

Exit criteria:

- Users can mark guidance read/useful/noisy with confidence, and maintainers can
  inspect the resulting data.

## Mutation guardrails

CAE acknowledgement is not Tier A/B `policyApproval`. UI copy must keep those
separate:

- **Acknowledgement** means “I read this guidance.”
- **Policy approval** means “I am allowed to run this sensitive command.”

Any Guidance UI action that calls a sensitive `cae-*` command must collect an
explicit confirmation and pass JSON `policyApproval` in the command payload.

## Decisions

1. **Ship sensitive actions enabled.** `Acknowledge`, `Useful`, and `Noisy`
   buttons ship enabled in the first Guidance release, guarded by explicit UI
   confirmation and JSON `policyApproval` for the sensitive `cae-*` mutation
   commands.
2. **Persist trace summaries.** Durable trace writes should persist a
   UI-friendly summary (`taskId`, task title when available, command name,
   family counts, acknowledgement count, conflict count, eval mode, storage
   source) so `cae-recent-traces` does not rely on fragile best-effort
   extraction from bundle/trace JSON forever.
3. **Use a hybrid workflow picker.** The happy path should show curated
   high-value workflows first, with an advanced manifest-backed search for
   complete command coverage.

## Implementation task status

- `CAE-UI-01`: Done — Guidance product language and command contracts.
- `CAE-UI-02`: Done — `cae-dashboard-summary` read-only command and schema.
- `CAE-UI-03`: Done — recent trace listing support.
- `CAE-UI-04`: Done — friendly guidance preview command backed by bounded
  context.
- `CAE-UI-05`: Done — Guidance sidebar view skeleton in the Cursor extension.
- `CAE-UI-06`: Done — health, registry, recent traces, acks, and feedback
  summaries render.
- `CAE-UI-07`: Done — Check current context flow includes task/workflow
  pickers, manifest-backed workflow search, structured command args, and
  grouped cards.
- `CAE-UI-08`: Done — explain action renders a dedicated trace detail panel
  with summary first and raw JSON behind details.
- `CAE-UI-09`: Done — policy-aware acknowledgement and feedback actions render
  friendly result cards, actor defaults, and optional feedback notes.
- `CAE-UI-10`: Done — schema, golden smoke, renderer tests, and degraded-state
  coverage exist.

Phase 71 task rows:

- `CAE-UI-11`: Done — Guidance degraded-state coverage and recovery cards
  (`T934`).
- `CAE-UI-12`: Done — task and workflow pickers for Guidance preview (`T935`).
- `CAE-UI-13`: Done — persisted trace summary metadata and
  `cae-recent-traces` summary preference (`T936`).
- `CAE-UI-14`: Done — dedicated trace detail panel for `cae-explain` (`T937`).
- `CAE-UI-15`: Done — structured `commandArgs` input and validation (`T938`).
- `CAE-UI-16`: Done — acknowledgement and feedback UX polish with actor
  defaults and optional notes (`T939`).
- `CAE-UI-17`: Done — Guidance conflict and match-reason UI (`T940`).
- `CAE-UI-18`: Done — Guidance MVP smoke and release-readiness verification
  before Phase 71 closeout (`T941`).

## Phase 71 release-readiness smoke

Date: 2026-04-26.

Evidence:

- Build/test: `pnpm run build`; `pnpm --filter cursor-workflow-cannon run test`
  (64 extension tests passing).
- Status reload contract: `workspace-kit run cae-dashboard-summary
  '{"schemaVersion":1}'` returned `cae-dashboard-summary-ok`, healthy registry,
  persistence enabled, recent durable traces, acknowledgement summary, and
  feedback summary.
- Task/workflow preview: `workspace-kit run cae-guidance-preview` with
  `taskId:"T941"`, `commandName:"get-next-actions"`, `evalMode:"shadow"`, and
  structured `commandArgs:{"phaseKey":"71"}` returned
  `cae-guidance-preview-ok`, durable trace
  `cae.trace.3e7cadc906c9f411c7df211ccb3192e35062a45b`, grouped Guidance
  cards, and bounded evaluation context.
- Trace explain: `workspace-kit run cae-explain` for that trace returned
  `cae-explain-ok`, storage `sqlite`, and summary
  `matched policy=0, think=0, do=1, review=0`.
- Package metadata: `extensions/cursor-workflow-cannon/package.json`
  contributes `workflowCannon.guidance` as a webview named `Guidance` beside the
  existing Workflow Cannon views.
- Registry editing absence: static Guidance provider check confirmed registry
  mutation commands such as `cae-create-artifact`, `cae-update-artifact`,
  `cae-create-activation`, `cae-update-activation`, and
  `cae-import-json-registry` are absent from the UI.

Manual-host note: this evidence is CLI/static smoke plus extension renderer
coverage in the local workspace. No interactive VS Code Extension Host window
was opened in this run; no MVP blocker was found in the executable smoke.

## Acceptance

A maintainer who has never used CAE can open **Guidance** and, within one
minute, see health, preview applicable guidance for a task/workflow, understand
why a guidance item appeared, inspect acknowledgement and feedback state, and
avoid confusing CAE acknowledgement with command policy approval.
