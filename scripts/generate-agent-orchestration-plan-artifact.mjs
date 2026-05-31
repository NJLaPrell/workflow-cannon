#!/usr/bin/env node
/**
 * Generate PlanArtifact v1 JSON for AGENT_ORCHESTRATION_FOUNDATION.md + AGENT_ORCHESTRATION_TASKS.md
 * Usage: node scripts/generate-agent-orchestration-plan-artifact.mjs [--out path]
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const PHASE_1 = '126';
const PHASE_2 = '127';
const PHASE_3 = '128';

/** @type {Record<string, { wbsId: string; phase: string; wp: string; title: string; type: string; priority: string; approach: string; technicalScope: string[]; acceptanceCriteria: string[]; testingVerification: string[]; dependsOn: string[]; produces?: string; requires?: string[]; goalMapping: string[] }>} */
const TASKS = {
  'T-AO-000': {
    wbsId: 'WBS-AO-000',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Inventory current orchestration surfaces',
    type: 'research',
    priority: 'P0',
    approach:
      'Inventory subagent registry, Team Execution, agent activity store, task/blocker paths, policy surfaces, dashboard summary touch points, agent docs, and test coverage; produce A-INV.',
    technicalScope: [
      'src/modules/task-engine/**/subagent*',
      'src/modules/task-engine/**/team-execution*',
      'src/modules/task-engine/**/agent-activity*',
      '.ai/runbooks/subagent-registry.md',
      'AGENT_ORCHESTRATION_FOUNDATION.md',
    ],
    acceptanceCriteria: [
      'A-INV lists all relevant modules, commands, schemas, and docs',
      'A-INV identifies reusable pieces versus missing pieces',
      'A-INV identifies breaking-change risks',
      'A-INV includes recommended reuse strategy',
    ],
    testingVerification: ['Code references included', 'Search terms and inspected files recorded'],
    dependsOn: [],
    produces: 'A-INV',
    goalMapping: ['Phase 1 — Contracts & Design Gates'],
  },
  'T-AO-010': {
    wbsId: 'WBS-AO-010',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft orchestration architecture decision document',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Create AGENT_ORCHESTRATION_ARCHITECTURE.md covering three-layer separation, AgentDefinition/AgentSession storage strategy, TeamAssignment bridge, compatibility, persistence, migration, dashboard boundary, and v1 non-goals.',
    technicalScope: [
      'AGENT_ORCHESTRATION_ARCHITECTURE.md',
      'AGENT_ORCHESTRATION_FOUNDATION.md',
      'src/modules/task-engine/**',
    ],
    acceptanceCriteria: [
      'Architecture references AGENT_ORCHESTRATION_FOUNDATION.md decisions',
      'Storage/module strategy is explicit',
      'Existing subagent/team execution compatibility is preserved',
      'Human approval recorded before dependent implementation',
    ],
    testingVerification: ['Peer review against foundation doc', 'No implementation code in this task'],
    dependsOn: ['WBS-AO-000'],
    produces: 'A-ARCH',
    requires: ['A-INV'],
    goalMapping: ['Agent Registry vs Assignment vs Activity ownership'],
  },
  'T-AO-020': {
    wbsId: 'WBS-AO-020',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft orchestration schema and contract pack',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Create AGENT_ORCHESTRATION_CONTRACTS.md with AgentDefinition v1, AgentSession v1, assignment metadata v1, AgentActivity v1, Handoff v2 schemas, enums, examples, and malformed-field behavior.',
    technicalScope: [
      'AGENT_ORCHESTRATION_CONTRACTS.md',
      'schemas/**',
      'fixtures/agent-orchestration/**',
    ],
    acceptanceCriteria: [
      'Schemas match the foundation document',
      'Examples exist for Orchestration Agent and Task Work Agent',
      'Assignment metadata includes resource ownership and profile references',
      'Handoff v2 has examples for completed, blocked, partial, failed, and needs_review',
    ],
    testingVerification: ['JSON examples validate against draft JSON Schema', 'Review against A-ARCH'],
    dependsOn: ['WBS-AO-010'],
    produces: 'A-SCHEMA',
    requires: ['A-ARCH'],
    goalMapping: ['AgentDefinition v1', 'AgentSession v1', 'Handoff v2', 'AgentActivity v1'],
  },
  'T-AO-030': {
    wbsId: 'WBS-AO-030',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft orchestration command contract pack',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Define command extensions and new commands for agent definitions, sessions, assignments, Handoff v2, blocker/bug paths, Activity v1, and orchestration status reads with policy/idempotency/dry-run semantics.',
    technicalScope: [
      'src/modules/task-engine/instructions/**',
      '.ai/AGENT-CLI-MAP.md',
      'AGENT_ORCHESTRATION_COMMANDS.md',
    ],
    acceptanceCriteria: [
      'Existing commands to reuse/extend are identified',
      'New commands proposed only where current commands are insufficient',
      'Orchestrator and worker flows are both represented',
      'Policy surfaces are flagged for A-POLICY',
    ],
    testingVerification: ['Command matrix reviewed', 'Tier A/B/C policy hints documented'],
    dependsOn: ['WBS-AO-010', 'WBS-AO-020'],
    produces: 'A-COMMANDS',
    requires: ['A-ARCH', 'A-SCHEMA'],
    goalMapping: ['Orchestration command support'],
  },
  'T-AO-040': {
    wbsId: 'WBS-AO-040',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft mutation authority and policy map',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Document orchestrator vs worker mutation authority, blocker/bug rules, task transitions, reconcile/cancel/unblock rules, policyApproval surfaces, and forbidden manual DB edits.',
    technicalScope: [
      '.ai/POLICY-APPROVAL.md',
      'AGENT_ORCHESTRATION_POLICY.md',
      'src/modules/task-engine/**/policy*',
    ],
    acceptanceCriteria: [
      'Tiered mutation authority is explicit',
      'Worker blocker flow is supported and bounded',
      'No path lets worker self-reconcile or self-unblock',
      'Policy approval requirements are clear',
    ],
    testingVerification: ['Policy map cross-checked with A-COMMANDS', 'Forbidden mutation list complete'],
    dependsOn: ['WBS-AO-030', 'WBS-AO-020'],
    produces: 'A-POLICY',
    requires: ['A-COMMANDS', 'A-SCHEMA'],
    goalMapping: ['Task DB mutation authority', 'Worker blocker flow'],
  },
  'T-AO-050': {
    wbsId: 'WBS-AO-050',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft profile catalog',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Define orchestrator_access_v1, task_worker_strict_v1, context profiles, model/cost tiers, host capability vocabulary, and resource ownership metadata rules.',
    technicalScope: [
      'AGENT_ORCHESTRATION_PROFILES.md',
      'AGENT_ORCHESTRATION_FOUNDATION.md',
    ],
    acceptanceCriteria: [
      'Profiles match foundation doc decisions',
      'Profiles are reusable by AgentDefinition records',
      'Profiles do not grant workers broad permissions',
      'Model tier rubric is usable by an Orchestration Agent',
    ],
    testingVerification: ['Profile examples map to AgentDefinition samples', 'Review against A-POLICY'],
    dependsOn: ['WBS-AO-040', 'WBS-AO-020'],
    produces: 'A-PROFILES',
    requires: ['A-SCHEMA', 'A-POLICY'],
    goalMapping: ['Context profiles', 'Access profiles', 'Model/cost tiers'],
  },
  'T-AO-060': {
    wbsId: 'WBS-AO-060',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft Handoff v2 examples and validation rubric',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Create Handoff v2 examples and validation rules for completed, blocked, partial, failed, needs_review with evidence, compactness, and next-action requirements.',
    technicalScope: [
      'fixtures/agent-orchestration/handoff-v2/**',
      'AGENT_ORCHESTRATION_HANDOFF.md',
    ],
    acceptanceCriteria: [
      'Orchestrator can reconcile using handoff without reading full transcript',
      'Handoff examples are machine-readable JSON',
      'Compactness guidance prevents transcript dumps',
    ],
    testingVerification: ['Fixture JSON review', 'Rubric checklist for each status'],
    dependsOn: ['WBS-AO-020'],
    produces: 'A-HANDOFF',
    requires: ['A-SCHEMA'],
    goalMapping: ['Handoff v2 contract'],
  },
  'T-AO-070': {
    wbsId: 'WBS-AO-070',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft Activity v1 lifecycle spec',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Document Activity v1 fields, lifecycle, heartbeat/TTL, fresh/aging/stale/expired rules, activity kinds, clear vs expire behavior, and future command-boundary hook candidates.',
    technicalScope: [
      'AGENT_ORCHESTRATION_ACTIVITY.md',
      'src/modules/task-engine/**/agent-activity*',
    ],
    acceptanceCriteria: [
      'Lifecycle supports dashboard visibility goal',
      'Activity remains live-state, not assignment/handoff source of truth',
      'Stale/expired rules are unambiguous',
    ],
    testingVerification: ['Timing table reviewed', 'Lifecycle diagram included'],
    dependsOn: ['WBS-AO-020', 'WBS-AO-040'],
    produces: 'A-ACTIVITY',
    requires: ['A-SCHEMA', 'A-POLICY'],
    goalMapping: ['Activity v1 contract and lifecycle rules'],
  },
  'T-AO-080': {
    wbsId: 'WBS-AO-080',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft dashboard projection source contract',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Define DashboardAgentActivitySummary source contract: merge keys, precedence, confidence, stale/blocked derivation, no-dashboard-mutation rule, AGENT_CARD_PLAN compatibility.',
    technicalScope: [
      'AGENT_ORCHESTRATION_PROJECTION.md',
      'AGENT_CARD_PLAN.md',
      'src/modules/task-engine/dashboard/**',
    ],
    acceptanceCriteria: [
      'Projection contract can feed DashboardAgentActivitySummary',
      'Dashboard remains read-only for orchestration state',
      'Duplicate source rows can be collapsed',
    ],
    testingVerification: ['Projection merge examples documented', 'Cross-review with Agent Card plan'],
    dependsOn: ['WBS-AO-070', 'WBS-AO-020'],
    produces: 'A-PROJECTION',
    requires: ['A-SCHEMA', 'A-ACTIVITY'],
    goalMapping: ['Dashboard orchestration projection source contract'],
  },
  'T-AO-090': {
    wbsId: 'WBS-AO-090',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft orchestration test strategy',
    type: 'improvement',
    priority: 'P0',
    approach:
      'Define unit, contract, command, integration, dashboard-projection, and E2E test scope with fixture matrix for happy, blocked, malformed, and compatibility cases.',
    technicalScope: [
      'AGENT_ORCHESTRATION_TEST_STRATEGY.md',
      'test/**',
      'fixtures/agent-orchestration/**',
    ],
    acceptanceCriteria: [
      'Fixture matrix covers happy path, blocked path, malformed payloads, and compatibility cases',
      'E2E operator checklist exists',
      'Required CI/test commands are identified',
    ],
    testingVerification: ['Test matrix peer review', 'CI command list validated'],
    dependsOn: ['WBS-AO-020', 'WBS-AO-030'],
    produces: 'A-TEST',
    requires: ['A-SCHEMA', 'A-COMMANDS'],
    goalMapping: ['Test strategy and fixture matrix'],
  },
  'T-AO-100': {
    wbsId: 'WBS-AO-100',
    wp: 'WP-A',
    phase: PHASE_1,
    title: 'Draft compatibility and migration note',
    type: 'improvement',
    priority: 'P1',
    approach:
      'Document supported subagent registry and Team Execution behavior, additive metadata bridge, optional new fields, deprecation wording, and fallback when metadata absent.',
    technicalScope: [
      'AGENT_ORCHESTRATION_COMPAT.md',
      '.ai/runbooks/subagent-registry.md',
    ],
    acceptanceCriteria: [
      'Existing workflows remain valid',
      'New orchestration metadata is additive where possible',
      'Fallback behavior is explicit',
    ],
    testingVerification: ['Compatibility checklist reviewed', 'No silent breaking changes listed'],
    dependsOn: ['WBS-AO-000', 'WBS-AO-010'],
    produces: 'A-COMPAT',
    requires: ['A-INV', 'A-ARCH'],
    goalMapping: ['Compatibility / migration note'],
  },
  'T-AO-110': {
    wbsId: 'WBS-AO-110',
    wp: 'WP-1',
    phase: PHASE_2,
    title: 'Add shared orchestration contract types',
    type: 'improvement',
    priority: 'P0',
    approach: 'Add TypeScript types for AgentDefinition, AgentSession, AgentAssignmentMetadata, AgentActivity, Handoff v2, and profile refs in src/contracts.',
    technicalScope: [
      'src/contracts/agent-orchestration.ts',
      'src/contracts/agent-session*.ts',
      'src/contracts/agent-activity*.ts',
      'src/contracts/team-execution*.ts',
    ],
    acceptanceCriteria: [
      'Types compile',
      'Existing command types remain compatible',
      'No runtime behavior changes yet',
    ],
    testingVerification: ['pnpm run build typecheck', 'Existing tests pass'],
    dependsOn: ['WBS-AO-020', 'WBS-AO-010'],
    requires: ['A-SCHEMA', 'A-ARCH'],
    goalMapping: ['Phase 2 — Core Orchestration Implementation'],
  },
  'T-AO-120': {
    wbsId: 'WBS-AO-120',
    wp: 'WP-1',
    phase: PHASE_2,
    title: 'Add runtime validators for orchestration contracts',
    type: 'improvement',
    priority: 'P0',
    approach: 'Add runtime validation for AgentDefinition, AgentSession, assignment metadata, AgentActivity, and Handoff v2 with agent-readable errors.',
    technicalScope: ['src/core/validation/agent-orchestration/**', 'test/agent-orchestration/**'],
    acceptanceCriteria: [
      'Valid examples pass',
      'Missing required fields fail clearly',
      'Unknown metadata handled per A-SCHEMA',
      'Error messages are agent-readable',
    ],
    testingVerification: ['Unit tests for each validator', 'Malformed fixture tests', 'pnpm run check'],
    dependsOn: ['WBS-AO-110'],
    requires: ['A-TEST'],
    goalMapping: ['Contract validators'],
  },
  'T-AO-130': {
    wbsId: 'WBS-AO-130',
    wp: 'WP-1',
    phase: PHASE_2,
    title: 'Add canonical example fixtures',
    type: 'improvement',
    priority: 'P1',
    approach: 'Add fixture JSON for agent definitions, sessions, assignment metadata, activity, Handoff v2, and blocked-worker examples.',
    technicalScope: ['fixtures/agent-orchestration/**', 'test/agent-orchestration/**'],
    acceptanceCriteria: [
      'Fixtures are valid under validators',
      'Fixtures are referenced by docs or tests',
    ],
    testingVerification: ['Fixture validation test suite', 'Docs reference fixtures'],
    dependsOn: ['WBS-AO-120'],
    goalMapping: ['Canonical example fixtures'],
  },
  'T-AO-210': {
    wbsId: 'WBS-AO-210',
    wp: 'WP-2',
    phase: PHASE_2,
    title: 'Implement AgentDefinition v1 storage bridge',
    type: 'improvement',
    priority: 'P0',
    approach: 'Implement approved A-ARCH AgentDefinition storage: register/update/list/get, retired/version, profile and host/capability fields.',
    technicalScope: ['src/modules/task-engine/**', 'src/core/state/**'],
    acceptanceCriteria: [
      'Orchestration Agent and Task Work Agent definitions can be represented',
      'Existing subagent definitions remain compatible',
      'Invalid definitions are rejected',
    ],
    testingVerification: ['Unit tests for CRUD', 'Compatibility tests with subagent registry'],
    dependsOn: ['WBS-AO-120', 'WBS-AO-010', 'WBS-AO-100'],
    requires: ['A-ARCH', 'A-COMPAT'],
    goalMapping: ['AgentDefinition v1 storage bridge'],
  },
  'T-AO-220': {
    wbsId: 'WBS-AO-220',
    wp: 'WP-2',
    phase: PHASE_2,
    title: 'Implement AgentSession v1 record path',
    type: 'improvement',
    priority: 'P0',
    approach: 'Implement session open/update/list/get/close with hostHint, modelTier, and current assignment/task/activity pointers without owning assignment or activity state.',
    technicalScope: ['src/modules/task-engine/**', 'src/core/state/**'],
    acceptanceCriteria: [
      'Sessions can be recorded for cursor/vscode/cli/manual hosts',
      'Existing subagent sessions can be represented or bridged',
      'Session does not own assignment or live activity state',
    ],
    testingVerification: ['Session lifecycle unit tests', 'Bridge compatibility tests'],
    dependsOn: ['WBS-AO-120', 'WBS-AO-010', 'WBS-AO-100'],
    requires: ['A-ARCH', 'A-COMPAT'],
    goalMapping: ['AgentSession v1 record path'],
  },
  'T-AO-230': {
    wbsId: 'WBS-AO-230',
    wp: 'WP-2',
    phase: PHASE_2,
    title: 'Add agent registry/session dashboard read summaries',
    type: 'improvement',
    priority: 'P1',
    approach: 'Add read-only summaries for agent definitions, active sessions, host/capability availability, and assignment/activity pointers for projection consumption.',
    technicalScope: ['src/modules/task-engine/dashboard/**', 'src/modules/task-engine/commands/**'],
    acceptanceCriteria: [
      'Summary is read-only',
      'Missing DB/version support returns safe unavailable summary',
      'Projection source contract can consume it',
    ],
    testingVerification: ['Read summary unit tests', 'Empty-store first-run returns safe unavailable summary'],
    dependsOn: ['WBS-AO-210', 'WBS-AO-220'],
    goalMapping: ['Agent registry/session read summaries'],
  },
  'T-AO-310': {
    wbsId: 'WBS-AO-310',
    wp: 'WP-3',
    phase: PHASE_2,
    title: 'Add structured assignment metadata validation to Team Execution',
    type: 'improvement',
    priority: 'P0',
    approach: 'Validate optional structured assignment metadata on register/update: profiles, resource ownership, blockingPolicy, agentDefinitionId, agentSessionId.',
    technicalScope: ['src/modules/task-engine/**/team-execution*', 'test/**'],
    acceptanceCriteria: [
      'Existing assignments without metadata still work',
      'Metadata is validated when present',
      'Invalid path/resource/profile metadata fails clearly',
      'Tests cover old and new assignment rows',
    ],
    testingVerification: ['Assignment metadata validator tests', 'Legacy row compatibility tests'],
    dependsOn: ['WBS-AO-120', 'WBS-AO-040'],
    requires: ['A-SCHEMA', 'A-POLICY'],
    goalMapping: ['TeamAssignment-as-AgentAssignment bridge'],
  },
  'T-AO-320': {
    wbsId: 'WBS-AO-320',
    wp: 'WP-3',
    phase: PHASE_2,
    title: 'Extend register-assignment flow for orchestration metadata',
    type: 'improvement',
    priority: 'P0',
    approach: 'Extend register-assignment to accept structured metadata, agent/session/profile/resource info with policy and idempotency per A-COMMANDS.',
    technicalScope: ['src/modules/task-engine/instructions/register-assignment.md', 'src/modules/task-engine/commands/**'],
    acceptanceCriteria: [
      'Orchestrator can register a bounded assignment with metadata',
      'Response includes assignment id, task id, worker id, metadata summary',
      'Policy approval behavior matches A-POLICY',
      'Idempotency behavior is defined if applicable',
    ],
    testingVerification: ['Command contract tests', 'Policy approval integration tests'],
    dependsOn: ['WBS-AO-310', 'WBS-AO-030'],
    requires: ['A-COMMANDS'],
    goalMapping: ['Assignment registration with orchestration metadata'],
  },
  'T-AO-330': {
    wbsId: 'WBS-AO-330',
    wp: 'WP-3',
    phase: PHASE_2,
    title: 'Add worker blocker/bug creation path',
    type: 'improvement',
    priority: 'P0',
    approach: 'Implement command path for Task Work Agent to create linked blocking task or bug report tied to assignment, then report/block assignment.',
    technicalScope: ['src/modules/task-engine/commands/**', 'src/modules/task-engine/instructions/**'],
    acceptanceCriteria: [
      'Worker can create only linked blocker/bug tasks',
      'Created task has provenance back to assignment and worker',
      'Worker cannot create broad unrelated feature tasks through this path',
      'Orchestrator remains responsible for unblocking/continuation',
    ],
    testingVerification: ['Blocker creation command tests', 'Forbidden broad task creation tests'],
    dependsOn: ['WBS-AO-040', 'WBS-AO-030'],
    requires: ['A-COMMANDS', 'A-POLICY'],
    goalMapping: ['Worker blocker flow'],
  },
  'T-AO-340': {
    wbsId: 'WBS-AO-340',
    wp: 'WP-3',
    phase: PHASE_2,
    title: 'Harden assignment lifecycle authority',
    type: 'improvement',
    priority: 'P0',
    approach: 'Enforce orchestrator vs worker mutation boundaries on submit handoff, block, reconcile, cancel, and unblock paths with policy checks.',
    technicalScope: ['src/modules/task-engine/**', 'test/**'],
    acceptanceCriteria: [
      'Unauthorized mutations fail clearly',
      'Tests cover worker allowed/forbidden actions',
      'Orchestrator actions require expected policy approval where appropriate',
    ],
    testingVerification: ['Authority matrix tests', 'Policy denial tests'],
    dependsOn: ['WBS-AO-310', 'WBS-AO-040'],
    requires: ['A-POLICY'],
    goalMapping: ['Assignment lifecycle authority'],
  },
  'T-AO-410': {
    wbsId: 'WBS-AO-410',
    wp: 'WP-4',
    phase: PHASE_2,
    title: 'Implement Handoff v2 submission support',
    type: 'improvement',
    priority: 'P0',
    approach: 'Extend submit-assignment-handoff to accept Handoff v2 with v1 compatibility bridge and persist evidence, filesChanged, commandsRun, risks, blockers.',
    technicalScope: ['src/modules/task-engine/commands/**', 'src/core/state/**'],
    acceptanceCriteria: [
      'Completed, blocked, partial, failed, and needs_review handoffs validate',
      'Handoff v1 compatibility is preserved or explicitly bridged',
      'Handoff response is suitable for Orchestrator reconciliation',
      'Evidence refs, commandsRun, filesChanged, risks, blockers, and nextRecommendedAction are persisted or safely stored',
    ],
    testingVerification: ['Handoff v2 submission unit tests', 'v1 compatibility tests'],
    dependsOn: ['WBS-AO-120', 'WBS-AO-340', 'WBS-AO-060'],
    requires: ['A-HANDOFF'],
    goalMapping: ['Handoff v2 submission'],
  },
  'T-AO-420': {
    wbsId: 'WBS-AO-420',
    wp: 'WP-4',
    phase: PHASE_2,
    title: 'Update reconcile flow to consume Handoff v2',
    type: 'improvement',
    priority: 'P1',
    approach: 'Update reconcile/summary paths to surface Handoff v2 fields and support reconcile, rework, blocker, review, cancel/supersede decisions.',
    technicalScope: ['src/modules/task-engine/commands/**', 'test/**'],
    acceptanceCriteria: [
      'Orchestrator can inspect structured handoff data',
      'Reconcile checkpoint can summarize Handoff v2',
      'Tests cover blocked/partial/needs_review handling',
    ],
    testingVerification: ['Reconcile flow integration tests', 'Handoff v2 summary tests'],
    dependsOn: ['WBS-AO-410', 'WBS-AO-040'],
    requires: ['A-POLICY'],
    goalMapping: ['Orchestrator reconcile with Handoff v2'],
  },
  'T-AO-430': {
    wbsId: 'WBS-AO-430',
    wp: 'WP-4',
    phase: PHASE_2,
    title: 'Implement Activity v1 command compatibility',
    type: 'improvement',
    priority: 'P0',
    approach: 'Extend set-agent-activity/activity store for Activity v1 fields, TTL, stale/expired behavior, and assignment/session/task linkage.',
    technicalScope: ['src/modules/task-engine/**/agent-activity*', 'test/**'],
    acceptanceCriteria: [
      'Existing activity calls still work',
      'Activity v1 examples validate',
      'Stale/expired behavior matches A-ACTIVITY',
      'Activity can be linked to assignment/session/task',
    ],
    testingVerification: ['Activity v1 command tests', 'Stale/expired lifecycle tests'],
    dependsOn: ['WBS-AO-120', 'WBS-AO-070'],
    requires: ['A-ACTIVITY'],
    goalMapping: ['Activity v1 command compatibility'],
  },
  'T-AO-440': {
    wbsId: 'WBS-AO-440',
    wp: 'WP-5',
    phase: PHASE_3,
    title: 'Add activity lifecycle docs/snippets for agents',
    type: 'improvement',
    priority: 'P1',
    approach: 'Document agent activity lifecycle requirements with copyable command examples for orchestrator and task worker prompts.',
    technicalScope: ['.ai/runbooks/agent-orchestration-activity.md', '.ai/AGENT-CLI-MAP.md'],
    acceptanceCriteria: [
      'Agent-facing docs include copyable command examples',
      'Orchestrator and Task Work Agent prompts reference lifecycle',
    ],
    testingVerification: ['Docs lint/review', 'Snippet generation if applicable'],
    dependsOn: ['WBS-AO-430', 'WBS-AO-070'],
    requires: ['A-ACTIVITY'],
    goalMapping: ['Phase 3 — Projection, Docs & Hardening'],
  },
  'T-AO-510': {
    wbsId: 'WBS-AO-510',
    wp: 'WP-5',
    phase: PHASE_3,
    title: 'Add Orchestration Agent prompt/contract',
    type: 'improvement',
    priority: 'P0',
    approach: 'Create orchestrator agent-facing prompt/contract covering authority, profiles, model rubric, assignment rules, blocker handling, reconciliation, and forbidden implementation behavior.',
    technicalScope: ['.ai/prompts/orchestration-agent.md', '.cursor/rules/**'],
    acceptanceCriteria: [
      'Prompt reflects foundation decisions',
      'Prompt tells orchestrator not to code unless assigned as worker',
      'Prompt includes model/cost selection expectations',
      'Prompt includes structured assignment output guidance',
    ],
    testingVerification: ['Prompt review checklist', 'Cross-reference with A-PROFILES and A-POLICY'],
    dependsOn: ['WBS-AO-050', 'WBS-AO-030', 'WBS-AO-040'],
    requires: ['A-PROFILES', 'A-COMMANDS', 'A-POLICY'],
    goalMapping: ['Orchestration Agent prompt/contract'],
  },
  'T-AO-520': {
    wbsId: 'WBS-AO-520',
    wp: 'WP-5',
    phase: PHASE_3,
    title: 'Add Task Work Agent prompt/contract',
    type: 'improvement',
    priority: 'P0',
    approach: 'Create task worker prompt/contract for bounded scope, path rules, activity lifecycle, blocker/bug creation, Handoff v2, escalation, and forbidden self-reconcile/unblock.',
    technicalScope: ['.ai/prompts/task-work-agent.md', '.cursor/rules/**'],
    acceptanceCriteria: [
      'Prompt reflects foundation decisions',
      'Prompt emphasizes scope discipline',
      'Prompt includes blocked/partial/completed handoff examples',
      'Prompt gives clear stop/escalate conditions',
    ],
    testingVerification: ['Prompt review checklist', 'Handoff examples referenced'],
    dependsOn: ['WBS-AO-050', 'WBS-AO-060', 'WBS-AO-070', 'WBS-AO-040'],
    requires: ['A-PROFILES', 'A-HANDOFF', 'A-ACTIVITY', 'A-POLICY'],
    goalMapping: ['Task Work Agent prompt/contract'],
  },
  'T-AO-530': {
    wbsId: 'WBS-AO-530',
    wp: 'WP-5',
    phase: PHASE_3,
    title: 'Add profile catalog docs',
    type: 'improvement',
    priority: 'P1',
    approach: 'Document access profiles, context profiles, model tiers, host capabilities, resource ownership metadata, and AgentDefinition assignment examples.',
    technicalScope: ['.ai/runbooks/agent-orchestration-profiles.md', 'AGENT_ORCHESTRATION_PROFILES.md'],
    acceptanceCriteria: [
      'Agents can understand which profile applies',
      'Examples match schemas and validators',
    ],
    testingVerification: ['Docs cross-check with A-PROFILES fixtures'],
    dependsOn: ['WBS-AO-050'],
    requires: ['A-PROFILES'],
    goalMapping: ['Profile catalog docs'],
  },
  'T-AO-610': {
    wbsId: 'WBS-AO-610',
    wp: 'WP-6',
    phase: PHASE_3,
    title: 'Add orchestration projection source builder',
    type: 'improvement',
    priority: 'P1',
    approach: 'Build projection builder consuming definitions, sessions, assignments, activities, subagent sessions, handoffs, resource/model/host metadata for DashboardAgentActivitySummary.',
    technicalScope: [
      'src/modules/task-engine/dashboard/build-dashboard-agent-activity-summary.ts',
      'src/contracts/dashboard-summary-run.ts',
    ],
    acceptanceCriteria: [
      'Projection builder does not mutate orchestration state',
      'Missing metadata falls back safely',
      'Duplicate sources can be merged/collapsed',
      'Projection includes enough data for the Agent Activity Dashboard UX plan',
    ],
    testingVerification: ['Projection builder unit tests', 'Empty-store first-run projection test'],
    dependsOn: ['WBS-AO-210', 'WBS-AO-220', 'WBS-AO-310', 'WBS-AO-430', 'WBS-AO-080'],
    requires: ['A-PROJECTION'],
    goalMapping: ['DashboardAgentActivitySummary projection bridge'],
  },
  'T-AO-620': {
    wbsId: 'WBS-AO-620',
    wp: 'WP-6',
    phase: PHASE_3,
    title: 'Add projection tests for orchestration sources',
    type: 'improvement',
    priority: 'P1',
    approach: 'Test projection merge cases: live activity + assignment + session, subagent fallback, missing activity, stale/blocked, completed handoff, malformed metadata, legacy rows.',
    technicalScope: ['test/dashboard-agent-activity-summary.test.mjs', 'fixtures/agent-orchestration/**'],
    acceptanceCriteria: [
      'Tests prove dashboard can consume stable projection data',
      'Existing dashboard summary behavior is not broken',
    ],
    testingVerification: ['pnpm test -- dashboard-agent-activity-summary', 'Regression on dashboard-summary tests'],
    dependsOn: ['WBS-AO-610', 'WBS-AO-090'],
    requires: ['A-TEST'],
    goalMapping: ['Projection source tests'],
  },
  'T-AO-710': {
    wbsId: 'WBS-AO-710',
    wp: 'WP-7',
    phase: PHASE_3,
    title: 'Add compatibility tests for existing subagent and team execution flows',
    type: 'improvement',
    priority: 'P0',
    approach: 'Test existing subagent registry, session, assignment, handoff, reconcile/cancel/block flows remain compatible with additive orchestration metadata.',
    technicalScope: ['test/subagent-registry*.test.mjs', 'test/team-execution*.test.mjs'],
    acceptanceCriteria: [
      'Existing behavior remains compatible',
      'Additive fields do not force migration unless approved',
    ],
    testingVerification: ['Compatibility test suite in CI', 'pnpm run check'],
    dependsOn: ['WBS-AO-210', 'WBS-AO-220', 'WBS-AO-310', 'WBS-AO-410', 'WBS-AO-100', 'WBS-AO-090'],
    requires: ['A-COMPAT', 'A-TEST'],
    goalMapping: ['Compatibility tests'],
  },
  'T-AO-720': {
    wbsId: 'WBS-AO-720',
    wp: 'WP-7',
    phase: PHASE_3,
    title: 'Add orchestration happy-path E2E fixture',
    type: 'improvement',
    priority: 'P1',
    approach: 'E2E: register agents, open session, register assignment with metadata, set activity, submit Handoff v2, reconcile, project dashboard source.',
    technicalScope: ['test/agent-orchestration-happy-path.e2e.test.mjs', 'fixtures/agent-orchestration/**'],
    acceptanceCriteria: [
      'E2E fixture passes through CLI/test runner',
      'Evidence shows assignment and activity are linked',
      'Handoff v2 is usable for reconciliation',
    ],
    testingVerification: ['E2E test in CI', 'Manual CLI replay documented'],
    dependsOn: ['WBS-AO-410', 'WBS-AO-320', 'WBS-AO-430', 'WBS-AO-610'],
    requires: ['A-TEST'],
    goalMapping: ['Happy-path E2E fixture'],
  },
  'T-AO-730': {
    wbsId: 'WBS-AO-730',
    wp: 'WP-7',
    phase: PHASE_3,
    title: 'Add blocked-worker E2E fixture',
    type: 'improvement',
    priority: 'P1',
    approach: 'E2E: worker starts, discovers blocker, creates linked blocker task, blocks assignment, orchestrator resolves; worker cannot self-unblock.',
    technicalScope: ['test/agent-orchestration-blocked-worker.e2e.test.mjs', 'fixtures/agent-orchestration/**'],
    acceptanceCriteria: [
      'Worker cannot self-unblock',
      'Blocker task is linked to original assignment/task',
      'Dashboard projection can show blocked state',
    ],
    testingVerification: ['Blocked-worker E2E in CI', 'Projection blocked-state assertion'],
    dependsOn: ['WBS-AO-330', 'WBS-AO-430', 'WBS-AO-610'],
    requires: ['A-TEST'],
    goalMapping: ['Blocked-worker E2E fixture'],
  },
  'T-AO-740': {
    wbsId: 'WBS-AO-740',
    wp: 'WP-7',
    phase: PHASE_3,
    title: 'Add release readiness checklist',
    type: 'improvement',
    priority: 'P2',
    approach: 'Create maintainer release checklist for schemas, commands, docs, compatibility, E2E paths, projection bridge, and known limitations/future-work buckets.',
    technicalScope: ['.ai/runbooks/agent-orchestration-release-checklist.md', '.ai/RELEASING.md'],
    acceptanceCriteria: [
      'Checklist can be used by a maintainer before enabling plan-driven orchestration work',
    ],
    testingVerification: ['Checklist walkthrough dry-run', 'Links to A-TEST and A-COMPAT artifacts'],
    dependsOn: ['WBS-AO-710', 'WBS-AO-720', 'WBS-AO-730', 'WBS-AO-090', 'WBS-AO-100'],
    requires: ['A-TEST', 'A-COMPAT'],
    goalMapping: ['Release readiness checklist'],
  },
};

const WP_PATH = {
  'WP-A': '1',
  'WP-1': '2',
  'WP-2': '3',
  'WP-3': '4',
  'WP-4': '5',
  'WP-5': '6',
  'WP-6': '7',
  'WP-7': '8',
};

/** Align generated task payloads with ux-cae-pre-persist batch heuristics (finalize dry-run). */
function augmentAcceptanceCriteria(t, acceptanceCriteria) {
  let ac = [...acceptanceCriteria];

  if (t.wbsId === 'WBS-AO-740') {
    ac = ac.filter((c) => !/^Checklist can be used/i.test(c));
    ac.push(
      'Release checklist enumerates schema, command, docs, compatibility, E2E, and projection gates with pass/fail evidence columns',
      'Maintainer can walk the checklist before enabling orchestration-driven delivery without undocumented gaps',
    );
  }

  const blob = [t.approach, ...ac].join('\n').toLowerCase();
  if (
    (t.wbsId === 'WBS-AO-080' || t.wbsId === 'WBS-AO-610' || t.wbsId === 'WBS-AO-230') &&
    !/\b(empty|first-run|first run|initial|blank|no data|fresh workspace)\b/.test(blob)
  ) {
    ac.push(
      'Documents empty-store and first-run dashboard behavior when no orchestration activity rows exist',
    );
  }
  if (
    t.wbsId === 'WBS-AO-100' &&
    !/\b(rollback|revert|activation|activate|toggle|flag|disable|fallback)\b/.test(blob)
  ) {
    ac.push('Documents fallback and disable behavior when orchestration metadata is absent');
  }
  if (!/\b(test|tests|verify|verification|validation|check|coverage|e2e|unit)\b/.test(blob)) {
    ac.push('Verification evidence is recorded in the deliverable with explicit operator review sign-off');
  }

  return ac;
}

function buildWbs() {
  const byWp = {};
  for (const [taskId, t] of Object.entries(TASKS)) {
    if (!byWp[t.wp]) byWp[t.wp] = [];
    byWp[t.wp].push({ taskId, ...t });
  }

  const PHASE_GOALS = {
    'WP-A': 'Phase 1: human-approved A-* contract artifacts before implementation',
    'WP-1': 'Phase 2: validators, registry/session bridge, assignment metadata, handoff/activity commands',
    'WP-2': 'Phase 2: validators, registry/session bridge, assignment metadata, handoff/activity commands',
    'WP-3': 'Phase 2: validators, registry/session bridge, assignment metadata, handoff/activity commands',
    'WP-4': 'Phase 2: validators, registry/session bridge, assignment metadata, handoff/activity commands',
    'WP-5': 'Phase 3: prompts, projection bridge, compatibility and E2E hardening',
    'WP-6': 'Phase 3: prompts, projection bridge, compatibility and E2E hardening',
    'WP-7': 'Phase 3: prompts, projection bridge, compatibility and E2E hardening',
  };

  const wbs = [];
  for (const wp of ['WP-A', 'WP-1', 'WP-2', 'WP-3', 'WP-4', 'WP-5', 'WP-6', 'WP-7']) {
    const items = byWp[wp];
    items.forEach((t, idx) => {
      const path = `${WP_PATH[t.wp]}.${idx + 1}`;
      const phaseLabel = `Phase ${t.phase}`;
      const acceptanceCriteria = augmentAcceptanceCriteria(t, t.acceptanceCriteria);
      wbs.push({
        wbsId: t.wbsId,
        path,
        title: t.title,
        goalMapping: [
          ...t.goalMapping,
          PHASE_GOALS[t.wp],
          'Make multi-agent software work observable, bounded, cost-aware, host-agnostic, and trustworthy',
          'Separate Agent Registry, Assignment/Orchestration, and Activity/Visibility layers',
          'Enable Orchestration Agent to plan, assign, monitor, reconcile without direct host control in v1',
          'Enable Task Work Agent bounded execution with Handoff v2 and blocker reporting',
          'Provide dashboard projection source without dashboard owning orchestration state',
        ].filter((v, i, a) => a.indexOf(v) === i),
        suggestedTaskTitle: t.title,
        approach: t.approach,
        technicalScope: t.technicalScope,
        acceptanceCriteria,
        testingVerification: t.testingVerification.map((line) =>
          /unit|integration|e2e|test|pnpm run check/i.test(line) ? line : `integration test: ${line}`,
        ),
        dependsOn: t.dependsOn,
        recommendedPhase: t.phase,
        sizingConfidence: t.priority === 'P0' ? 'high' : t.priority === 'P1' ? 'medium' : 'low',
        doneMeans: `${t.taskId} complete when acceptance criteria pass, verification runs green, and ${t.produces ? `artifact ${t.produces} has explicit human approval` : 'operator confirms deliverable matches AGENT_ORCHESTRATION_TASKS.md scope'}`,
        riskNotes: t.requires?.length ? `Requires approved artifacts: ${t.requires.join(', ')}` : undefined,
        generatedTaskPayload: {
          title: t.title,
          type: t.type === 'research' ? 'research' : 'workspace-kit',
          priority: t.priority === 'P0' ? 'P1' : t.priority,
          phaseKey: t.phase,
          phase: phaseLabel,
          approach: t.approach,
          technicalScope: t.technicalScope,
          acceptanceCriteria,
          dependsOn: [],
          status: 'proposed',
        },
      });
    });
  }

  // Strip undefined riskNotes
  for (const row of wbs) {
    if (row.riskNotes === undefined) delete row.riskNotes;
  }

  return wbs;
}

function buildArtifact() {
  const planId = randomUUID();
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    planId,
    version: 1,
    planRef: `plan-artifact:${planId}`,
    status: 'draft',
    identity: {
      title: 'Agent Orchestration Foundation v1',
      planningType: 'sprint-phase',
      summary:
        'Host-agnostic agent orchestration foundation: AgentDefinition, AgentSession, TeamAssignment metadata bridge, Activity v1, Handoff v2, profiles, and dashboard projection — operationalized from AGENT_ORCHESTRATION_FOUNDATION.md and AGENT_ORCHESTRATION_TASKS.md.',
      tags: [
        'agent-orchestration',
        'subagents',
        'team-execution',
        'agent-activity',
        'handoff-v2',
        'activity-v1',
        'host-agnostic',
        'model-cost',
        'resource-ownership',
        'dashboard-projection',
      ],
    },
    goals: [
      'Make multi-agent software work observable, bounded, cost-aware, host-agnostic, and trustworthy',
      'Separate Agent Registry, Assignment/Orchestration, and Activity/Visibility layers',
      'Enable Orchestration Agent to plan, assign, monitor, reconcile without direct host control in v1',
      'Enable Task Work Agent bounded execution with Handoff v2 and blocker reporting',
      'Provide dashboard projection source without dashboard owning orchestration state',
      'Phase 1: human-approved A-* contract artifacts before implementation',
      'Phase 2: validators, registry/session bridge, assignment metadata, handoff/activity commands',
      'Phase 3: prompts, projection bridge, compatibility and E2E hardening',
    ],
    nonGoals: [
      'Automatic Cursor/VS Code agent launching',
      'Cross-host process control',
      'Full model/provider routing and cost telemetry',
      'Enforced resource locks or hard runtime sandboxing',
      'Event-stream runtime service for activity projection',
      'Dashboard owns orchestration state',
      'Replace Team Execution module immediately',
    ],
    userStories: [
      {
        id: 'US-1',
        asA: 'Workflow Cannon operator',
        iWant: 'see who is working, on what task, and whether they are active or blocked',
        soThat: 'I never guess whether an agent is stuck',
        priority: 'must',
      },
      {
        id: 'US-2',
        asA: 'Workflow Cannon operator',
        iWant: 'delegate a phase outcome to an Orchestration Agent with bounded assignments',
        soThat: 'I delegate outcomes instead of babysitting every step',
        priority: 'must',
      },
      {
        id: 'US-3',
        asA: 'Orchestration Agent',
        iWant: 'receive compact Handoff v2 from workers',
        soThat: 'I can reconcile without rereading full transcripts',
        priority: 'must',
      },
      {
        id: 'US-4',
        asA: 'Task Work Agent',
        iWant: 'clear owned/forbidden path rules and blocker escalation',
        soThat: 'I stay in scope and stop safely when blocked',
        priority: 'must',
      },
    ],
    valueAssessment: {
      impact: 'High — unlocks multi-agent command center and Agent Activity Dashboard UX',
      confidence: 'high',
      rationale:
        'Foundation and WBS are human-authored; builds on existing subagent registry and Team Execution with additive metadata bridge.',
    },
    riskAssessment: [
      {
        id: 'R1',
        description: 'Breaking existing subagent/team execution flows',
        severity: 'high',
        mitigation: 'A-COMPAT artifact, additive metadata, compatibility test suite T-AO-710',
      },
      {
        id: 'R2',
        description: 'Worker overreach mutating task DB or self-reconciling',
        severity: 'high',
        mitigation: 'A-POLICY + T-AO-340 authority hardening',
      },
      {
        id: 'R3',
        description: 'Dashboard becomes orchestration source of truth',
        severity: 'medium',
        mitigation: 'A-PROJECTION boundary + read-only projection builder T-AO-610',
      },
      {
        id: 'R4',
        description: 'Implementation starts before A-* artifacts approved',
        severity: 'high',
        mitigation: 'Phase 1 gate: all WP-A tasks produce approved artifacts before Phase 2 WBS',
      },
    ],
    technicalImpact: {
      systemsTouched: [
        'src/modules/task-engine',
        'src/contracts',
        'src/core/validation',
        'src/core/state',
        'extensions/cursor-workflow-cannon',
        '.ai/runbooks',
        'AGENT_ORCHESTRATION_FOUNDATION.md',
        'AGENT_ORCHESTRATION_TASKS.md',
        'AGENT_CARD_PLAN.md',
      ],
      compatibilityNotes:
        'TeamAssignment remains storage bridge; subagent registry extended or bridged per A-ARCH; additive metadata only until approved migration.',
      migrationImpact: 'Phased: contracts (126) → implementation (127) → projection/docs (128)',
    },
    architecture: {
      overview:
        'Three-layer model: AgentDefinition (registry) + TeamAssignment metadata (orchestration) + AgentActivity (visibility). Handoff v2 for evidence. DashboardAgentActivitySummary as read-only projection.',
      decisions: [
        {
          id: 'D1',
          decision: 'Strict separation of registry, assignment, and activity layers',
          rationale: 'AGENT_ORCHESTRATION_FOUNDATION.md core design principle',
        },
        {
          id: 'D2',
          decision: 'TeamAssignment as AgentAssignment bridge via structured metadata v1',
          rationale: 'Avoid new AgentAssignment module in v1',
        },
        {
          id: 'D3',
          decision: 'Orchestrator coordinates via commands; does not launch hosts in v1',
          rationale: 'Host-agnostic foundation before host adapters',
        },
        {
          id: 'D4',
          decision: 'Human-approved A-* artifacts gate Phase 2 implementation',
          rationale: 'AGENT_ORCHESTRATION_TASKS.md Requires rule',
        },
      ],
      diagrams: [
        {
          title: 'Three-layer orchestration model',
          mermaid:
            'flowchart TD\n  AD[AgentDefinition Registry] --> AS[AgentSession]\n  AS --> TA[TeamAssignment + metadata]\n  TA --> AA[AgentActivity]\n  TA --> H2[Handoff v2]\n  AA --> DAS[DashboardAgentActivitySummary projection]\n  H2 --> OA[Orchestration Agent reconcile]',
        },
      ],
    },
    uiUxDirection: {
      hasUiChanges: true,
      summary:
        'Dashboard consumes DashboardAgentActivitySummary projection; detailed UX in AGENT_CARD_PLAN.md — this plan owns orchestration source contracts only.',
      mockupRefs: ['AGENT_CARD_PLAN.md'],
    },
    testingStrategy: {
      layers: ['unit', 'contract', 'integration', 'dashboard-projection', 'e2e-cli'],
      criticalPaths: [
        'A-* artifact approval before Phase 2 code',
        'Validator + assignment metadata happy path',
        'Handoff v2 submit and reconcile',
        'Activity v1 stale/expired lifecycle',
        'Worker blocker flow without self-unblock',
        'Projection merge with empty-store first-run',
        'Legacy subagent/team execution compatibility',
      ],
      outOfScopeTesting: ['Full host adapter routing', 'Real-time event stream load tests'],
    },
    implementationGuidance: [
      'Source design: AGENT_ORCHESTRATION_FOUNDATION.md; WBS: AGENT_ORCHESTRATION_TASKS.md',
      'Do not start Phase 2 tasks until relevant A-* artifacts have explicit human approval',
      'Follow maintainer delivery loop: branch from release/phase-N, run-transition start/complete',
      'Use workspace-kit commands for all task/assignment mutations — no hand-edited SQLite',
      'One WBS item = one focused agent session; split if module boundaries blur',
    ],
    whatNotToDo: [
      'Do not launch Cursor/VS Code agents from Workflow Cannon in v1',
      'Do not let dashboard mutate orchestration state',
      'Do not let workers self-reconcile or self-unblock',
      'Do not skip A-* artifact approval gates',
      'Do not replace Team Execution with a parallel assignment store in v1',
    ],
    assumptions: [
      'Phases 126–128 registered in kit_phase_catalog when kickoff runs',
      'AGENT_CARD_PLAN.md remains separate UX consumer of this foundation',
      'Existing subagent registry and team execution commands remain supported',
      'All 11 A-* artifacts (A-INV through A-COMPAT) produced in Phase 126 before Phase 127 coding',
    ],
    openQuestions: [
      'Extend subagent registry vs new agent-orchestration module for AgentDefinition/AgentSession? (blocks WBS-AO-010 / A-ARCH)',
      'Strict accept on plan-artifact review warnings during phase finalize?',
    ],
    wbs: buildWbs(),
    phaseRecommendations: [
      {
        phaseKey: PHASE_1,
        label: 'Phase 126',
        rationale: 'Phase 1 — Contracts & Design Gates (A-* artifacts, WP-A)',
        isPrimary: true,
      },
      {
        phaseKey: PHASE_2,
        label: 'Phase 127',
        rationale: 'Phase 2 — Core Orchestration Implementation (WP-1 through WP-4)',
        isPrimary: false,
      },
      {
        phaseKey: PHASE_3,
        label: 'Phase 128',
        rationale: 'Phase 3 — Projection, Docs & Hardening (WP-5 through WP-7)',
        isPrimary: false,
      },
    ],
    provenance: {
      createdAt: now,
      updatedAt: now,
      createdBy: 'agent@workflow-cannon',
      source: 'draft-plan-artifact',
      chatSessionRef: 'agent-orchestration-foundation-tasks-import',
    },
  };
}

const patchIdx = process.argv.indexOf('--patch-plan');
if (patchIdx >= 0) {
  const planId = process.argv[patchIdx + 1];
  if (!planId) {
    console.error('Usage: --patch-plan <planId>');
    process.exit(1);
  }
  const dir = `.workspace-kit/planning/plan-artifacts/${planId}`;
  const versions = readdirSync(dir)
    .map((f) => /^artifact\.v(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const latest = Math.max(...versions);
  const prior = JSON.parse(readFileSync(`${dir}/artifact.v${latest}.json`, 'utf8'));
  const nextVersion = latest + 1;
  const now = new Date().toISOString();
  const artifact = {
    ...prior,
    version: nextVersion,
    status: 'draft',
    wbs: buildWbs(),
    approvalRecord: undefined,
    provenance: {
      ...prior.provenance,
      updatedAt: now,
      source: 'draft-plan-artifact',
      chatSessionRef: 'agent-orchestration-batch-review-fix',
    },
  };
  delete artifact.approvalRecord;
  const outPath = `${dir}/artifact.v${nextVersion}.json`;
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      { ok: true, planId, priorVersion: latest, version: nextVersion, wbsCount: artifact.wbs.length, outPath },
      null,
      2,
    ),
  );
  process.exit(0);
}

const artifact = buildArtifact();
const outArg = process.argv.indexOf('--out');
const outPath =
  outArg >= 0 ? process.argv[outArg + 1] : '.workspace-kit/planning/agent-orchestration-foundation.draft.v1.json';

writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, planId: artifact.planId, wbsCount: artifact.wbs.length, outPath }, null, 2));
