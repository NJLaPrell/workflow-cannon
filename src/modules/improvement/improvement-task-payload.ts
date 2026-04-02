import path from "node:path";
import type { IngestCandidate } from "./ingest.js";

export type ImprovementTaskPayload = {
  title: string;
  /** Short issue statement (also stored on task metadata). */
  issue: string;
  /** Primary recommended fix (also stored on task metadata as proposedSolutions[0]). */
  proposedSolution: string;
  approach: string;
  technicalScope: string[];
  acceptanceCriteria: string[];
};

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function transcriptResolutionHint(sample: string): string {
  if (/\bpolicy\b|denied|approval|policyapproval/i.test(sample)) {
    return (
      "Update or cross-link **docs/maintainers/POLICY-APPROVAL.md** and **docs/maintainers/AGENT-CLI-MAP.md** so the denied command path shows the exact JSON **`policyApproval`** shape (and env vs run lane). Add a copy-paste block if one is missing for this failure class."
    );
  }
  if (/sqlite|better-sqlite|native|rebuild/i.test(sample)) {
    return (
      "Align **workspace-kit doctor** / CLI hints with **docs/maintainers/runbooks/native-sqlite-consumer-install.md** so the error string in the session maps to an ordered recovery path (rebuild, ABI, permissions)."
    );
  }
  if (/\bconfig\b|unknown key|validation|invalid key/i.test(sample)) {
    return (
      "Tighten **docs/maintainers/CONFIG.md** (or generated **CONFIG** docs) and/or the validation error emitted by **`workspace-kit config`** for the failing key so operators get a fix-forward message, not a dead end."
    );
  }
  return (
    "Add a short maintainer runbook paragraph or instruction-file hint that names this failure mode and the supported fix, so the next session does not need raw transcript archaeology."
  );
}

export function buildImprovementTaskPayload(c: IngestCandidate): ImprovementTaskPayload {
  switch (c.evidenceKind) {
    case "transcript": {
      const rel = c.provenanceRefs.transcriptPath ?? "transcript";
      const base = path.basename(rel);
      const sample = c.provenanceRefs.sampleLine ?? "";
      const snippet = sample ? truncate(sample, 160) : "";
      const issue = snippet
        ? `Agent transcript **${rel}** shows friction: “${snippet}”.`
        : `Agent transcript **${rel}** shows elevated friction (see **metadata.provenanceRefs.sampleLine**).`;
      const proposedSolution = transcriptResolutionHint(sample);
      return {
        title: truncate(snippet ? `${base}: ${snippet}` : `Session friction in ${base}`, 200),
        issue,
        proposedSolution,
        approach: `${issue}\n\n**Recommended resolution:** ${proposedSolution}`,
        technicalScope: [
          "Apply the doc or CLI messaging changes described in the recommended resolution, keeping the diff scoped (prefer a single maintainer doc pair or one CLI string change).",
          "If the sample proves a product defect (not discoverability), open a **`T###`** execution task with a minimal repro, **`cancel`** this improvement, and link the new id in the cancellation rationale.",
          "Close with **`complete`** when merged guidance matches the symptom, or **`cancel`** with rationale if the session noise was transient or already fixed upstream."
        ],
        acceptanceCriteria: [
          "Merged guidance or code addresses the named failure mode; the task body is not a generic ‘investigate transcript’ stub.",
          "This improvement is **`completed`** or **`cancelled`** with evidence (PR, note, or linked **`T###`**)."
        ]
      };
    }
    case "policy_deny": {
      const op = c.provenanceRefs.operationId ?? "unknown";
      const cmd = c.provenanceRefs.command ?? "";
      const ts = c.provenanceRefs.traceTimestamp ?? "";
      const issue = `Policy denied **${op}**${cmd ? ` (${cmd})` : ""}${ts ? ` at ${ts}` : ""}, blocking the intended **workspace-kit run**.`;
      const proposedSolution =
        "Document the correct approval lane for this **operationId** in **AGENT-CLI-MAP** (tier + JSON **`policyApproval`** example) and ensure **POLICY-APPROVAL** states env vs run surfaces; if denial is wrong, fix policy classification with maintainer review—not chat-only workarounds.";
      return {
        title: truncate(`Policy friction: ${op}`, 200),
        issue,
        proposedSolution,
        approach: `${issue}\n\n**Recommended resolution:** ${proposedSolution}`,
        technicalScope: [
          "Patch **docs/maintainers/AGENT-CLI-MAP.md** / **POLICY-APPROVAL.md** with copy-paste JSON for this operation (or correct the manifest **`policySensitivity`** row if mis-tiered).",
          "If UX is correct, add a denial footnote that links to the canonical doc anchor so repeat operators self-recover.",
          "Verify with one non-interactive CLI run that the documented approval path succeeds."
        ],
        acceptanceCriteria: [
          "Operators following the updated docs can complete the run without unexplained denials, or the policy tier change is merged with rationale.",
          "Improvement **`complete`** or **`cancel`** with PR link or explicit ‘working as designed’ note."
        ]
      };
    }
    case "config_mutation": {
      const k = c.provenanceRefs.key ?? "";
      const ts = c.provenanceRefs.timestamp ?? "";
      const issue = `Config mutation failed for key **${k || "(unknown)"}**${ts ? ` (${ts})` : ""} per **.workspace-kit/config/mutations.jsonl**.`;
      const proposedSolution =
        "Improve the validation message and/or **CONFIG** documentation for this key so failed sets return an actionable error; if the key is deprecated, state the replacement in **CHANGELOG** / **CONFIG**.";
      return {
        title: truncate(`Config UX: ${k || "unknown key"}`, 200),
        issue,
        proposedSolution,
        approach: `${issue}\n\n**Recommended resolution:** ${proposedSolution}`,
        technicalScope: [
          "Trace the rejection in **mutations.jsonl** and align **config-metadata** / CLI validation text with the intended shape.",
          "Add or adjust a short maintainer note if the key requires a migration story.",
          "Re-run **`workspace-kit config validate`** (or the failing command) to confirm the new messaging."
        ],
        acceptanceCriteria: [
          "Failed mutations surface a clear fix; docs mention edge cases if any.",
          "Improvement **`complete`** or **`cancel`** with merged PR or ‘invalid caller’ rationale."
        ]
      };
    }
    case "task_transition": {
      const taskId = c.provenanceRefs.taskId ?? "unknown";
      const count = c.provenanceRefs.transitionEventCount ?? "?";
      const issue = `Task **${taskId}** recorded **${count}** lifecycle transitions in the scanned window—usually policy retries, duplicate operator attempts, unclear scope, or fixture noise.`;
      const proposedSolution =
        "Default to **evidence-backed closure**: cite the transition sequence already in task-engine evidence (log excerpt or UI) in the PR or cancellation note; if the pattern is policy/discoverability, patch **AGENT-CLI-MAP** / **POLICY-APPROVAL**; if scope thrash, split or clarify the underlying execution task; if benign, **`cancel`** this improvement with one-line rationale and optionally tune queue-health churn heuristics separately.";
      return {
        title: truncate(`Transition churn: ${taskId} (${count} events)`, 200),
        issue,
        proposedSolution,
        approach: `${issue}\n\n**Recommended resolution:** ${proposedSolution}`,
        technicalScope: [
          "Record the transition pattern (timestamps/actions) alongside the chosen resolution—no blank ‘investigate’ checklist.",
          "Ship the minimal doc or task split implied by the pattern, or **`cancel`** with cited history if no product change.",
          "Do not leave this improvement in **`ready`** as a perpetual meta-audit."
        ],
        acceptanceCriteria: [
          "Root cause stated with evidence (history excerpt or PR); doc/split/cancel decision is explicit.",
          "Improvement reaches **`complete`** or **`cancelled`** with that rationale."
        ]
      };
    }
    case "git_diff": {
      const fromTag = c.provenanceRefs.fromTag ?? "?";
      const toTag = c.provenanceRefs.toTag ?? "?";
      const n = c.provenanceRefs.pathCount ?? "?";
      const issue = `Git range **${fromTag} → ${toTag}** touches **${n}** paths—downstream workflows may need migration or release notes.`;
      const proposedSolution =
        "Ship **CHANGELOG** / **RELEASING**-aligned notes for consumer-visible behavior, run **parity** on the packaged artifact for this train, and call out extension or config migrations when paths under **src/** or **schemas/** changed.";
      return {
        title: truncate(`Release hygiene: ${fromTag} → ${toTag}`, 200),
        issue,
        proposedSolution,
        approach: `${issue}\n\n**Recommended resolution:** ${proposedSolution}`,
        technicalScope: [
          "Enumerate risky paths from the diff summary and map each to changelog bullets or ‘no user impact’ explicitly.",
          "Attach or refresh **artifacts/parity-evidence.json** for the release candidate when behavior touches packaged surfaces.",
          "Coordinate version/tag bump per **RELEASING.md** if this improvement gates a release."
        ],
        acceptanceCriteria: [
          "Changelog / release notes reflect the diff scope; parity passes when required.",
          "Improvement **`complete`** or **`cancel`** with merged doc/evidence or deferral rationale."
        ]
      };
    }
    default: {
      throw new Error(`Unhandled improvement evidence kind: ${String((c as IngestCandidate).evidenceKind)}`);
    }
  }
}
