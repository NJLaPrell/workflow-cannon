/**
 * Build `draftRule` payloads for `cae-guidance-preview` from the Guidance authoring wizard.
 * Keep aligned with `src/core/cae/guidance-draft-impact-preview.ts` coerceDraftGuidanceRuleInput.
 */

export type WizardScopePreset = "workflow" | "always" | "phase" | "task" | "completing_task";

/** Map UI strength presets to Guidance families CAE recognizes. */
export function draftStrengthToFamily(strengthRaw: string): "policy" | "think" | "do" | "review" {
  const k = strengthRaw.trim().toLowerCase();
  if (k === "required" || k === "critical" || k === "blocking") return "policy";
  if (k === "verify" || k === "checklist" || k === "audit") return "review";
  if (k === "steps" || k === "step" || k === "workflow" || k === "runner") return "do";
  if (k === "policy" || k === "think" || k === "do" || k === "review") {
    return k;
  }
  return "think";
}

const ACK_OPTS = ["surface", "recommend", "ack_required", "satisfy_required"] as const;
type AckOption = (typeof ACK_OPTS)[number];

function coerceAckStrength(raw: string | undefined): AckOption | undefined {
  const k = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!k || k === "none") return undefined;
  return ACK_OPTS.find((a) => a === k);
}

export type WizardDraftInput = {
  title: string;
  strengthRaw: string;
  priority: number;
  scopePreset: WizardScopePreset;
  /** Workflow intent for workflow / completing_task refinements */
  workflowName?: string;
  phaseKey?: string;
  scopeTaskId?: string;
};

/** Produce a workspace-kit-compatible `draftRule` object (`schemaVersion` 1). */
export function buildDraftGuidanceRulePayload(input: WizardDraftInput): Record<string, unknown> {
  const title =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim().slice(0, 256)
      : "Draft Guidance rule";
  const family = draftStrengthToFamily(input.strengthRaw);
  const pr = Number.isFinite(input.priority) ? Math.floor(input.priority) : 750;
  const priority = Math.min(9999, Math.max(0, pr));

  let scopeDraft: Record<string, unknown>;
  switch (input.scopePreset) {
    case "always":
      scopeDraft = { preset: "always" };
      break;
    case "phase":
      scopeDraft = {
        preset: "phase",
        phaseKey:
          typeof input.phaseKey === "string" && input.phaseKey.trim() ? input.phaseKey.trim() : "75"
      };
      break;
    case "task":
      scopeDraft = {
        preset: "task",
        taskId:
          typeof input.scopeTaskId === "string" && input.scopeTaskId.trim()
            ? input.scopeTaskId.trim()
            : "T921"
      };
      break;
    case "completing_task": {
      const phaseKey =
        typeof input.phaseKey === "string" && input.phaseKey.trim() ? input.phaseKey.trim() : undefined;
      const tid =
        typeof input.scopeTaskId === "string" && input.scopeTaskId.trim()
          ? input.scopeTaskId.trim()
          : undefined;
      scopeDraft = {
        preset: "completingTask",
        ...(phaseKey ? { phaseKey } : {}),
        ...(tid ? { taskId: tid } : {})
      };
      break;
    }
    default: {
      const wf =
        typeof input.workflowName === "string" && input.workflowName.trim()
          ? input.workflowName.trim()
          : "get-next-actions";
      scopeDraft = { preset: "workflow", workflowName: wf };
      break;
    }
  }

  return {
    schemaVersion: 1,
    title,
    artifactType: "playbook",
    family,
    priority,
    scopeDraft
  };
}

export function withAcknowledgement(
  draft: Record<string, unknown>,
  ackStrengthRaw?: string,
  traceHint?: string
): Record<string, unknown> {
  const st = coerceAckStrength(ackStrengthRaw);
  if (!st) return draft;
  const base =
    typeof traceHint === "string" && traceHint.trim().length ? traceHint.trim().slice(0, 96) : "cae.wizard.ack";
  const token = `${base}.surface`.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 128);
  return {
    ...draft,
    acknowledgement: {
      strength: st,
      token: token.length >= 8 ? token : "cae.wizard.ack.surface"
    }
  };
}
