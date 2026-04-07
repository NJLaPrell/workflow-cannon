import path from "node:path";
import type { IngestCandidate } from "./ingest.js";

export type ImprovementTaskPayload = {
  title: string;
  /** Interpreted problem report (also stored on task metadata). */
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

function transcriptInterpretation(sample: string): string {
  if (/\bpolicy\b|denied|approval|policyapproval/i.test(sample)) {
    return "The sampled line matches **policy / approval-lane** confusion: operators are unsure which surface supplies **`policyApproval`** or why a run was denied.";
  }
  if (/sqlite|better-sqlite|native|rebuild/i.test(sample)) {
    return "The sampled line matches **native SQLite / binary module** friction—install or ABI recovery is unclear from the session text alone.";
  }
  if (/\bconfig\b|unknown key|validation|invalid key/i.test(sample)) {
    return "The sampled line matches **config validation** friction: the error path does not clearly steer to a fix or doc anchor.";
  }
  return "The transcript shows **general operator/agent friction** (retries, errors, or unclear next steps) without a tighter classification from this single line.";
}

function approachBlock(summary: string, proposedSolution: string): string {
  return `${summary}\n\n**Recommended change:** ${proposedSolution}`;
}

export function buildImprovementTaskPayload(c: IngestCandidate): ImprovementTaskPayload {
  const tier = c.confidence.tier;
  const key = c.evidenceKey;

  switch (c.evidenceKind) {
    case "transcript": {
      const rel = c.provenanceRefs.transcriptPath ?? "transcript";
      const base = path.basename(rel);
      const sample = c.provenanceRefs.sampleLine ?? "";
      const scoredExcerpt =
        typeof c.provenanceRefs.scoredTextExcerpt === "string" ? c.provenanceRefs.scoredTextExcerpt : "";
      const hintSource = scoredExcerpt || sample;
      const snippet = hintSource ? truncate(hintSource, 160) : "";
      const symptom = snippet
        ? `Transcript **${rel}** — message text that triggered scoring: “${snippet}”.`
        : `Transcript **${rel}** was scored as elevated friction (see **metadata.provenanceRefs**).`;
      const interpretation = transcriptInterpretation(hintSource);
      const proposedSolution = transcriptResolutionHint(hintSource);
      const pipelineNote =
        typeof c.provenanceRefs.pipelineAdmissionSummary === "string"
          ? c.provenanceRefs.pipelineAdmissionSummary
          : "";

      const issue = [
        "## Problem report",
        "",
        "### Why this improvement exists (pipeline forensics)",
        pipelineNote ||
          `Automated ingest matched friction heuristics on extracted transcript message text (**${tier}** tier, key \`${key}\`).`,
        "",
        "### Symptom",
        symptom,
        "",
        "### Impact",
        "If the signal is real, operators and agents repeat the same dead-end path until docs, policy examples, or CLI hints catch up. If it is noise (e.g. benign assistant summary), **cancel** in triage.",
        "",
        "### Evidence",
        `- Source: **${rel}**`,
        `- Role of strongest line: **${c.provenanceRefs.transcriptRole ?? "unknown"}**; lines scanned in window: **${c.provenanceRefs.linesScannedInSlice ?? "?"}**; friction hits: **${c.provenanceRefs.frictionHitsInSlice ?? "?"}**`,
        `- Pipeline admission: transcript friction, **${tier}** tier, evidence key \`${key}\``,
        "",
        "### Interpretation",
        interpretation
      ].join("\n");

      return {
        title: truncate(snippet ? `${base}: ${snippet}` : `Session friction in ${base}`, 200),
        issue,
        proposedSolution,
        approach: approachBlock(
          `**Triage job:** Confirm the forensics + excerpt match a real operator problem. If yes, keep **proposed** or promote to **ready** and ship the **Recommended change**. If no, **reject**/**cancel** with one line (“assistant success summary” / already fixed).`,
          proposedSolution
        ),
        technicalScope: [
          "Readable outcome: either merged maintainer guidance (AGENT-CLI-MAP, POLICY-APPROVAL, CONFIG, short runbook) tied to the excerpt above, or a **cancel** note explaining why no change was needed.",
          "If this uncovers a product defect, spawn execution **T###** with repro, **cancel** this improvement, link the new id."
        ],
        acceptanceCriteria: [
          "You can state **why** the transcript matched the pipeline (or why it was a false positive) in plain language.",
          "Either merged guidance exists for this failure mode, or the improvement is **cancelled** with that explicit rationale."
        ]
      };
    }
    case "policy_deny": {
      const op = c.provenanceRefs.operationId ?? "unknown";
      const cmd = c.provenanceRefs.command ?? "";
      const ts = c.provenanceRefs.traceTimestamp ?? "";
      const proposedSolution =
        "Document the correct approval lane for this **operationId** in **AGENT-CLI-MAP** (tier + JSON **`policyApproval`** example) and ensure **POLICY-APPROVAL** states env vs run surfaces; if denial is wrong, fix policy classification with maintainer review—not chat-only workarounds.";

      const issue = [
        "## Problem report",
        "",
        "### Symptom",
        `A **workspace-kit** sensitive run was **denied** for **${op}**${cmd ? ` (\`${cmd}\`)` : ""}${ts ? ` at ${ts}` : ""}.`,
        "",
        "### Impact",
        "Legitimate automation or maintainer workflows stop until someone reverse-engineers policy tiers and approval JSON from error text or tribal knowledge.",
        "",
        "### Evidence",
        `- Policy trace: **operationId** \`${op}\`${cmd ? `, command \`${cmd}\`` : ""}`,
        `- Pipeline admission: policy denial signal, **${tier}** tier, evidence key \`${key}\``,
        "",
        "### Interpretation",
        "This is **policy / discoverability** friction: the denied path is either missing from copy-paste docs or mis-tiered relative to operator expectations."
      ].join("\n");

      return {
        title: truncate(`Policy friction: ${op}`, 200),
        issue,
        proposedSolution,
        approach: approachBlock(
          `Denial on **${op}** is already anchored to policy telemetry—address doc gaps or tier fixes rather than treating this row as an open-ended investigation.`,
          proposedSolution
        ),
        technicalScope: [
          "Merged maintainer docs or manifest policy rows so this **operationId** has a correct tier story and a working JSON **`policyApproval`** example.",
          "Optional: denial footnote or CLI remediation pointer that links to the canonical doc anchor for repeat operators."
        ],
        acceptanceCriteria: [
          "Operators following the updated docs can complete the run without unexplained denials, or a tier correction ships with maintainer rationale.",
          "Improvement **completed** or **cancelled** with PR link or explicit “working as designed” note."
        ]
      };
    }
    case "config_mutation": {
      const k = c.provenanceRefs.key ?? "";
      const ts = c.provenanceRefs.timestamp ?? "";
      const proposedSolution =
        "Improve the validation message and/or **CONFIG** documentation for this key so failed sets return an actionable error; if the key is deprecated, state the replacement in **CHANGELOG** / **CONFIG**.";

      const issue = [
        "## Problem report",
        "",
        "### Symptom",
        `Config mutation failed for key **${k || "(unknown)"}**${ts ? ` (${ts})` : ""} per **.workspace-kit/config/mutations.jsonl**.`,
        "",
        "### Impact",
        "Operators cannot tell whether the key is invalid, deprecated, wrongly typed, or blocked by policy—so they stall or patch config by guesswork.",
        "",
        "### Evidence",
        `- Mutation record: key **${k || "(unknown)"}**`,
        `- Pipeline admission: config mutation signal, **${tier}** tier, evidence key \`${key}\``,
        "",
        "### Interpretation",
        "This is **configuration UX** friction: emitted errors or docs do not close the loop for this key."
      ].join("\n");

      return {
        title: truncate(`Config UX: ${k || "unknown key"}`, 200),
        issue,
        proposedSolution,
        approach: approachBlock(
          `The failing key and timestamp are already identified—deliver clearer validation output and/or CONFIG prose rather than reopening discovery.`,
          proposedSolution
        ),
        technicalScope: [
          "Align **config-metadata** / CLI validation text with the intended shape for this key; add maintainer notes only when migrations or edge cases matter.",
          "Confirm **`workspace-kit config validate`** (or the failing command) surfaces the new messaging."
        ],
        acceptanceCriteria: [
          "Failed mutations return a fix-forward message; docs mention non-obvious edge cases if any.",
          "Improvement **completed** or **cancelled** with merged change or ‘invalid caller’ rationale."
        ]
      };
    }
    case "task_transition": {
      const taskId = c.provenanceRefs.taskId ?? "unknown";
      const count = c.provenanceRefs.transitionEventCount ?? "?";
      const digest =
        typeof c.provenanceRefs.transitionDigest === "string" ? c.provenanceRefs.transitionDigest : "";
      const pipelineNote =
        typeof c.provenanceRefs.pipelineAdmissionSummary === "string"
          ? c.provenanceRefs.pipelineAdmissionSummary
          : "";
      const proposedSolution =
        "Default to **evidence-backed closure**: cite the transition sequence already in task-engine evidence (log excerpt or UI) in the PR or cancellation note; if the pattern is policy/discoverability, patch **AGENT-CLI-MAP** / **POLICY-APPROVAL**; if scope thrash, split or clarify the underlying execution task; if benign, **cancel** this improvement with one-line rationale and optionally tune queue-health churn heuristics separately.";

      const issue = [
        "## Problem report",
        "",
        "### Why this improvement exists (transition forensics)",
        pipelineNote ||
          `**${count}** transition(s) on **${taskId}** in the ingest window triggered the churn heuristic (**${tier}** tier).`,
        "",
        "### Symptom",
        `Task **${taskId}** recorded **${count}** lifecycle transitions in the scanned window.`,
        "",
        "### Transition sequence (last events in window)",
        digest ? `\`${digest}\`` : "(No digest attached — use **get-task** / task history in UI.)",
        "",
        "### Impact",
        "High churn usually means policy retries, duplicate operator attempts, unclear scope, or benign maintainer activity on doc tasks—only you can tell from the sequence above.",
        "",
        "### Evidence",
        `- Task id: **${taskId}**, transition event count **${count}**`,
        `- Pipeline admission: transition churn signal, **${tier}** tier, evidence key \`${key}\``,
        "",
        "### Interpretation",
        "Read the digest: repeated **cancel**/**start** loops suggest policy or scope confusion; a short burst of doc task motion may be **cancel**-worthy noise."
      ].join("\n");

      return {
        title: truncate(`Transition churn: ${taskId} (${count} events)`, 200),
        issue,
        proposedSolution,
        approach: approachBlock(
          `**Triage job:** Use the digest to explain **why** churn happened in one sentence, then either ship the minimal doc/task fix or **cancel** with “expected maintainer motion.”`,
          proposedSolution
        ),
        technicalScope: [
          "Record the interpreted pattern (policy loop vs scope thrash vs benign) next to the digest; pair with doc fix, task split, or cancellation.",
          "Do not leave a churn row **ready** indefinitely—**complete** or **cancel** with explicit reasoning."
        ],
        acceptanceCriteria: [
          "A reader sees **why** churn occurred (or why it was benign) and what you decided.",
          "Improvement reaches **completed** or **cancelled** with that rationale and any linked PR."
        ]
      };
    }
    case "git_diff": {
      const fromTag = c.provenanceRefs.fromTag ?? "?";
      const toTag = c.provenanceRefs.toTag ?? "?";
      const n = c.provenanceRefs.pathCount ?? "?";
      const proposedSolution =
        "Ship **CHANGELOG** / **RELEASING**-aligned notes for consumer-visible behavior, run **parity** on the packaged artifact for this train, and call out extension or config migrations when paths under **src/** or **schemas/** changed.";

      const issue = [
        "## Problem report",
        "",
        "### Symptom",
        `Git range **${fromTag} → ${toTag}** touches **${n}** paths.`,
        "",
        "### Impact",
        "Downstream consumers may miss migrations, extension breaks, or config/schema shifts without explicit release hygiene.",
        "",
        "### Evidence",
        `- Diff scope: **${n}** paths between **${fromTag}** and **${toTag}**`,
        `- Pipeline admission: git-range signal, **${tier}** tier, evidence key \`${key}\``,
        "",
        "### Interpretation",
        "This is a **release-communication** gap risk: breadth of change demands changelog and parity discipline, not a blank-slate investigation."
      ].join("\n");

      return {
        title: truncate(`Release hygiene: ${fromTag} → ${toTag}`, 200),
        issue,
        proposedSolution,
        approach: approachBlock(
          `The diff span is already bounded—translate risky paths into changelog bullets, parity evidence, or explicit “no user impact” statements.`,
          proposedSolution
        ),
        technicalScope: [
          "Changelog / release notes enumerate risky paths from the diff summary or mark them as no user impact.",
          "Refresh **artifacts/parity-evidence.json** when packaged surfaces change; coordinate version/tag bump per **RELEASING.md** when this gates a release."
        ],
        acceptanceCriteria: [
          "Changelog / release notes reflect the diff scope; parity passes when required by policy.",
          "Improvement **completed** or **cancelled** with merged doc/evidence or deferral rationale."
        ]
      };
    }
    default: {
      throw new Error(`Unhandled improvement evidence kind: ${String((c as IngestCandidate).evidenceKind)}`);
    }
  }
}
