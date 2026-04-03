export { BUILTIN_PROFILES, DEFAULT_BUILTIN_PROFILE_ID } from "./builtins.js";
export { validateBehaviorProfile, mergeDimensions } from "./validate.js";

import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  advisoryModulationForProfile,
  explanationVerbosityRank,
  resolveAgentGuidanceFromEffectiveConfig
} from "../../core/agent-guidance-catalog.js";
import { BUILTIN_PROFILES, DEFAULT_BUILTIN_PROFILE_ID } from "./builtins.js";
import { diffProfiles, summarizeProfileMarkdown } from "./explain.js";
import {
  buildDraftProfileFromInterview,
  INTERVIEW_QUESTIONS,
  dimensionsFromAnswers
} from "./interview.js";
import {
  clearBehaviorInterviewSession,
  persistBehaviorInterviewSession,
  readBehaviorInterviewSession
} from "./interview-session-file.js";
import { loadBehaviorWorkspaceState, saveBehaviorWorkspaceState } from "./persistence.js";
import { BehaviorProfileStore, materializeCustomFromBase } from "./store.js";
import type { BehaviorProfile } from "./types.js";
import { mergeDimensions, validateBehaviorProfile } from "./validate.js";

async function withStore(
  ctx: Parameters<NonNullable<WorkflowModule["onCommand"]>>[1],
  fn: (store: BehaviorProfileStore) => Promise<{ ok: boolean; code: string; message?: string; data?: Record<string, unknown> }>
): Promise<{ ok: boolean; code: string; message?: string; data?: Record<string, unknown> }> {
  const raw = await loadBehaviorWorkspaceState(ctx);
  const store = new BehaviorProfileStore(raw);
  const result = await fn(store);
  if (result.ok) {
    await saveBehaviorWorkspaceState(ctx, store.getState());
  }
  return result;
}

export const agentBehaviorModule: WorkflowModule = {
  registration: {
    id: "agent-behavior",
    version: "0.2.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["agent-behavior"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/agent-behavior/config.md",
      format: "md",
      description: "Advisory agent interaction profiles (soft layer; subordinate to PRINCIPLES and policy)."
    },
    instructions: {
      directory: "src/modules/agent-behavior/instructions",
      entries: builtinInstructionEntriesForModule("agent-behavior")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const name = command.name;

    if (name === "list-behavior-profiles") {
      const raw = await loadBehaviorWorkspaceState(ctx);
      const store = new BehaviorProfileStore(raw);
      return {
        ok: true,
        code: "behavior-profiles-listed",
        data: { profiles: store.listIds(), scope: "agent-behavior" }
      };
    }

    if (name === "get-behavior-profile") {
      const profileId = typeof args.profileId === "string" ? args.profileId.trim() : "";
      if (!profileId) {
        return { ok: false, code: "invalid-args", message: "get-behavior-profile requires profileId" };
      }
      const raw = await loadBehaviorWorkspaceState(ctx);
      const store = new BehaviorProfileStore(raw);
      const resolved = store.resolveProfile(profileId);
      if (!resolved) {
        return { ok: false, code: "profile-not-found", message: `Profile '${profileId}' not found` };
      }
      return {
        ok: true,
        code: "behavior-profile-retrieved",
        data: { profile: resolved }
      };
    }

    if (name === "resolve-behavior-profile") {
      const raw = await loadBehaviorWorkspaceState(ctx);
      const store = new BehaviorProfileStore(raw);
      const { effective, provenance } = store.resolveEffectiveWithProvenance();
      const effCfg =
        ctx.effectiveConfig && typeof ctx.effectiveConfig === "object" && !Array.isArray(ctx.effectiveConfig)
          ? (ctx.effectiveConfig as Record<string, unknown>)
          : {};
      const guidance = resolveAgentGuidanceFromEffectiveConfig(effCfg);
      const evRank = explanationVerbosityRank(effective.dimensions?.explanationVerbosity);
      const advisoryModulation = advisoryModulationForProfile(guidance, evRank);
      return {
        ok: true,
        code: "behavior-profile-resolved",
        data: {
          effective,
          provenance,
          schemaVersion: 1,
          agentGuidance: {
            schemaVersion: 1,
            profileSetId: guidance.profileSetId,
            tier: guidance.tier,
            displayLabel: guidance.displayLabel,
            usingDefaultTier: guidance.usingDefaultTier,
            advisoryModulation
          }
        }
      };
    }

    if (name === "set-active-behavior-profile") {
      return withStore(ctx, async (store) => {
        const clear = args.clear === true;
        const profileId = typeof args.profileId === "string" ? args.profileId.trim() : "";
        if (!clear && !profileId) {
          return {
            ok: false,
            code: "invalid-args",
            message: "Provide profileId or clear:true"
          };
        }
        if (clear) {
          store.setActiveProfileId(null);
          return {
            ok: true,
            code: "behavior-active-cleared",
            message: "Active behavior profile cleared (fallback to default)",
            data: { activeProfileId: null }
          };
        }
        const resolved = store.resolveProfile(profileId);
        if (!resolved) {
          return {
            ok: false,
            code: "profile-not-found",
            message: `Profile '${profileId}' not found`
          };
        }
        store.setActiveProfileId(profileId);
        return {
          ok: true,
          code: "behavior-active-set",
          message: `Active behavior profile set to '${profileId}'`,
          data: { activeProfileId: profileId }
        };
      });
    }

    if (name === "create-behavior-profile") {
      return withStore(ctx, async (store) => {
        const newId = typeof args.id === "string" ? args.id.trim() : "";
        if (!newId.startsWith("custom:") || newId.length < 9) {
          return {
            ok: false,
            code: "invalid-args",
            message: "create-behavior-profile requires id custom:<slug>"
          };
        }
        if (store.getRawProfile(newId)) {
          return { ok: false, code: "duplicate-profile-id", message: `Profile '${newId}' already exists` };
        }
        const baseId =
          typeof args.baseProfileId === "string" && args.baseProfileId.trim().length > 0
            ? args.baseProfileId.trim()
            : DEFAULT_BUILTIN_PROFILE_ID;
        const dims =
          typeof args.dimensions === "object" && args.dimensions !== null && !Array.isArray(args.dimensions)
            ? (args.dimensions as Record<string, string>)
            : undefined;
        const partialDims = dims
          ? {
              deliberationDepth: dims.deliberationDepth as BehaviorProfile["dimensions"]["deliberationDepth"],
              changeAppetite: dims.changeAppetite as BehaviorProfile["dimensions"]["changeAppetite"],
              checkInFrequency: dims.checkInFrequency as BehaviorProfile["dimensions"]["checkInFrequency"],
              explanationVerbosity: dims.explanationVerbosity as BehaviorProfile["dimensions"]["explanationVerbosity"],
              explorationStyle: dims.explorationStyle as BehaviorProfile["dimensions"]["explorationStyle"],
              ambiguityHandling: dims.ambiguityHandling as BehaviorProfile["dimensions"]["ambiguityHandling"]
            }
          : undefined;
        const mat = materializeCustomFromBase(baseId, store, newId, {
          label: typeof args.label === "string" ? args.label : undefined,
          summary: typeof args.summary === "string" ? args.summary : undefined,
          dimensions: partialDims,
          interactionNotes: typeof args.interactionNotes === "string" ? args.interactionNotes : undefined
        });
        if (!mat.ok) {
          return { ok: false, code: "invalid-profile", message: mat.message };
        }
        store.putCustomProfile(mat.profile);
        return {
          ok: true,
          code: "behavior-profile-created",
          data: { profile: mat.profile }
        };
      });
    }

    if (name === "update-behavior-profile") {
      return withStore(ctx, async (store) => {
        const profileId = typeof args.profileId === "string" ? args.profileId.trim() : "";
        if (!profileId.startsWith("custom:")) {
          return { ok: false, code: "invalid-args", message: "update-behavior-profile requires custom profileId" };
        }
        const existing = store.getRawProfile(profileId);
        if (!existing || BUILTIN_PROFILES[profileId]) {
          return { ok: false, code: "profile-not-found", message: `Custom profile '${profileId}' not found` };
        }
        const updates = typeof args.updates === "object" && args.updates !== null ? args.updates as Record<string, unknown> : {};
        const next = { ...existing } as BehaviorProfile;
        if (typeof updates.label === "string") next.label = updates.label.trim();
        if (typeof updates.summary === "string") next.summary = updates.summary.trim();
        if (updates.dimensions && typeof updates.dimensions === "object" && !Array.isArray(updates.dimensions)) {
          next.dimensions = mergeDimensions(
            existing.dimensions,
            updates.dimensions as Partial<BehaviorProfile["dimensions"]>
          );
        }
        if (updates.interactionNotes !== undefined) {
          next.interactionNotes =
            typeof updates.interactionNotes === "string" ? updates.interactionNotes.trim() : undefined;
        }
        next.metadata = {
          ...(existing.metadata ?? {}),
          updatedAt: new Date().toISOString()
        };
        const v = validateBehaviorProfile(next);
        if (!v.ok) {
          return { ok: false, code: "invalid-profile", message: v.message };
        }
        store.putCustomProfile(v.profile);
        return { ok: true, code: "behavior-profile-updated", data: { profile: v.profile } };
      });
    }

    if (name === "delete-behavior-profile") {
      return withStore(ctx, async (store) => {
        const profileId = typeof args.profileId === "string" ? args.profileId.trim() : "";
        if (!profileId.startsWith("custom:")) {
          return { ok: false, code: "invalid-args", message: "delete-behavior-profile requires custom profileId" };
        }
        if (BUILTIN_PROFILES[profileId]) {
          return { ok: false, code: "invalid-args", message: "Cannot delete builtin profile" };
        }
        if (!store.getRawProfile(profileId)) {
          return { ok: false, code: "profile-not-found", message: `Profile '${profileId}' not found` };
        }
        if (store.getActiveProfileId() === profileId) {
          return {
            ok: false,
            code: "profile-active",
            message: `Profile '${profileId}' is active; clear or change active before delete`
          };
        }
        store.deleteCustomProfile(profileId);
        return { ok: true, code: "behavior-profile-deleted", data: { profileId } };
      });
    }

    if (name === "diff-behavior-profiles") {
      const a = typeof args.profileIdA === "string" ? args.profileIdA.trim() : "";
      const b = typeof args.profileIdB === "string" ? args.profileIdB.trim() : "";
      if (!a || !b) {
        return { ok: false, code: "invalid-args", message: "diff-behavior-profiles requires profileIdA and profileIdB" };
      }
      const raw = await loadBehaviorWorkspaceState(ctx);
      const store = new BehaviorProfileStore(raw);
      const pa = store.resolveProfile(a);
      const pb = store.resolveProfile(b);
      if (!pa || !pb) {
        return { ok: false, code: "profile-not-found", message: "One or both profiles not found" };
      }
      return {
        ok: true,
        code: "behavior-profiles-diffed",
        data: { diff: diffProfiles(pa, pb), profileIdA: a, profileIdB: b }
      };
    }

    if (name === "explain-behavior-profiles") {
      const mode = typeof args.mode === "string" ? args.mode : "summarize";
      const raw = await loadBehaviorWorkspaceState(ctx);
      const store = new BehaviorProfileStore(raw);
      if (mode === "compare") {
        const ids = Array.isArray(args.profileIds) ? args.profileIds.filter((x) => typeof x === "string") : [];
        if (ids.length < 2) {
          return {
            ok: false,
            code: "invalid-args",
            message: "compare mode requires profileIds array with at least two ids"
          };
        }
        const sections: string[] = [];
        for (const id of ids) {
          const p = store.resolveProfile(id as string);
          if (!p) {
            return { ok: false, code: "profile-not-found", message: `Profile '${id}' not found` };
          }
          sections.push(summarizeProfileMarkdown(p));
        }
        return {
          ok: true,
          code: "behavior-profiles-explained",
          data: { mode: "compare", markdown: sections.join("\n\n---\n\n") }
        };
      }
      const profileId =
        typeof args.profileId === "string" && args.profileId.trim().length > 0
          ? args.profileId.trim()
          : DEFAULT_BUILTIN_PROFILE_ID;
      const p = store.resolveProfile(profileId);
      if (!p) {
        return { ok: false, code: "profile-not-found", message: `Profile '${profileId}' not found` };
      }
      return {
        ok: true,
        code: "behavior-profiles-explained",
        data: { mode: "summarize", markdown: summarizeProfileMarkdown(p) }
      };
    }

    if (name === "interview-behavior-profile") {
      const action = typeof args.action === "string" ? args.action : "";
      const ws = ctx.workspacePath;

      if (action === "discard") {
        await clearBehaviorInterviewSession(ws);
        return { ok: true, code: "behavior-interview-discarded", data: {} };
      }

      if (action === "start") {
        await persistBehaviorInterviewSession(ws, { stepIndex: 0, answers: {} });
        const q = INTERVIEW_QUESTIONS[0]!;
        return {
          ok: true,
          code: "behavior-interview-started",
          data: {
            stepIndex: 0,
            totalSteps: INTERVIEW_QUESTIONS.length,
            question: q,
            resumeCli: `workspace-kit run interview-behavior-profile '{"action":"answer","value":"<option>"}'`
          }
        };
      }

      let session = await readBehaviorInterviewSession(ws);
      if (!session && action === "answer") {
        return {
          ok: false,
          code: "invalid-args",
          message: "No interview session; run action:start first"
        };
      }

      if (action === "back") {
        if (!session) {
          return { ok: false, code: "invalid-args", message: "No interview session" };
        }
        if (session.stepIndex <= 0) {
          return { ok: true, code: "behavior-interview-back", data: { stepIndex: 0, atStart: true } };
        }
        const prevIndex = session.stepIndex - 1;
        const prevQ = INTERVIEW_QUESTIONS[prevIndex]!;
        const nextAnswers = { ...session.answers };
        delete nextAnswers[INTERVIEW_QUESTIONS[session.stepIndex - 1]!.id];
        await persistBehaviorInterviewSession(ws, { stepIndex: prevIndex, answers: nextAnswers });
        return {
          ok: true,
          code: "behavior-interview-back",
          data: {
            stepIndex: prevIndex,
            question: prevQ
          }
        };
      }

      if (action === "answer") {
        session = session ?? { schemaVersion: 1, updatedAt: "", stepIndex: 0, answers: {} };
        const value = typeof args.value === "string" ? args.value.trim() : "";
        const q = INTERVIEW_QUESTIONS[session.stepIndex];
        if (!q) {
          return { ok: false, code: "invalid-state", message: "Interview already complete; use finalize" };
        }
        const allowed = new Set(q.options.map((o) => o.value));
        if (!allowed.has(value)) {
          return {
            ok: false,
            code: "invalid-args",
            message: `Invalid value for step ${session.stepIndex}; choose one of: ${[...allowed].join(", ")}`
          };
        }
        const answers = { ...session.answers, [q.id]: value };
        const nextIndex = session.stepIndex + 1;
        await persistBehaviorInterviewSession(ws, { stepIndex: nextIndex, answers });
        if (nextIndex >= INTERVIEW_QUESTIONS.length) {
          return {
            ok: true,
            code: "behavior-interview-complete",
            data: {
              stepIndex: nextIndex,
              complete: true,
              answers,
              next: "Run action:finalize with custom id and optional apply:true"
            }
          };
        }
        const nq = INTERVIEW_QUESTIONS[nextIndex]!;
        return {
          ok: true,
          code: "behavior-interview-progress",
          data: {
            stepIndex: nextIndex,
            totalSteps: INTERVIEW_QUESTIONS.length,
            question: nq,
            answers
          }
        };
      }

      if (action === "finalize") {
        session = await readBehaviorInterviewSession(ws);
        if (!session || session.stepIndex < INTERVIEW_QUESTIONS.length) {
          return {
            ok: false,
            code: "invalid-state",
            message: "Interview not complete; answer all questions first"
          };
        }
        const customId = typeof args.customId === "string" ? args.customId.trim() : "";
        if (!customId.startsWith("custom:")) {
          return {
            ok: false,
            code: "invalid-args",
            message: "finalize requires customId (custom:<slug>)"
          };
        }
        const dims = dimensionsFromAnswers(session.answers);
        if (!dims) {
          return { ok: false, code: "invalid-state", message: "Missing answers" };
        }
        let built: ReturnType<typeof buildDraftProfileFromInterview>;
        try {
          built = buildDraftProfileFromInterview(
            session.answers,
            customId,
            typeof args.label === "string" ? args.label : undefined
          );
        } catch (e) {
          return { ok: false, code: "invalid-profile", message: (e as Error).message };
        }
        const vr = validateBehaviorProfile(built);
        if (!vr.ok) {
          return { ok: false, code: "invalid-profile", message: vr.message };
        }
        const draft = vr.profile;
        const apply = args.apply === true;
        if (apply) {
          const persist = await withStore(ctx, async (store) => {
            if (store.getRawProfile(customId)) {
              return {
                ok: false,
                code: "duplicate-profile-id",
                message: `Profile '${customId}' already exists`
              };
            }
            store.putCustomProfile(draft);
            store.setActiveProfileId(customId);
            return { ok: true, code: "ok", data: { profile: draft, activeProfileId: customId } };
          });
          if (!persist.ok) {
            return persist;
          }
          await clearBehaviorInterviewSession(ws);
          return {
            ok: true,
            code: "behavior-interview-finalized",
            data: persist.data
          };
        }
        await clearBehaviorInterviewSession(ws);
        return {
          ok: true,
          code: "behavior-interview-draft",
          data: { profile: draft, apply: false }
        };
      }

      return {
        ok: false,
        code: "invalid-args",
        message: "interview-behavior-profile requires action: start | answer | back | finalize | discard"
      };
    }

    return {
      ok: false,
      code: "unknown-command",
      message: `agent-behavior: unknown command '${name}'`
    };
  }
};
