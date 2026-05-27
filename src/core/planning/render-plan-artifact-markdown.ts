import type {
  PlanArtifactApprovalRecord,
  PlanArtifactPhaseRecommendation,
  PlanArtifactRiskItem,
  PlanArtifactUserStory,
  PlanArtifactV1,
  PlanArtifactWbsItem
} from "./plan-artifact-v1.js";

function bulletList(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

function section(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `## ${title}\n\n${trimmed}\n`;
}

function renderUserStories(stories: PlanArtifactUserStory[]): string {
  return stories
    .map(
      (s) =>
        `### ${s.id} (${s.priority})\n\nAs a ${s.asA}, I want ${s.iWant} so that ${s.soThat}.`
    )
    .join("\n\n");
}

function renderRisks(risks: PlanArtifactRiskItem[]): string {
  if (risks.length === 0) return "_None listed._";
  return risks
    .map((r) => {
      const mit = r.mitigation ? ` Mitigation: ${r.mitigation}` : "";
      return `- **${r.id}** (${r.severity}): ${r.description}.${mit}`;
    })
    .join("\n");
}

function renderWbs(items: PlanArtifactWbsItem[]): string {
  return items
    .map((w) => {
      const path = w.path ? ` (${w.path})` : "";
      const deps = w.dependsOn.length > 0 ? ` · deps: ${w.dependsOn.join(", ")}` : "";
      return [
        `### ${w.wbsId}${path}: ${w.title}`,
        "",
        `**Suggested task:** ${w.suggestedTaskTitle}`,
        "",
        w.approach,
        "",
        `**Scope:** ${w.technicalScope.join("; ")}`,
        "",
        `**Acceptance:**`,
        bulletList(w.acceptanceCriteria),
        "",
        `**Verification:** ${w.testingVerification.join("; ")}`,
        "",
        `**Done means:** ${w.doneMeans} · **Sizing:** ${w.sizingConfidence}${deps}`
      ].join("\n");
    })
    .join("\n\n");
}

function renderPhaseRecommendations(rows: PlanArtifactPhaseRecommendation[]): string {
  return rows
    .map((p) => {
      const primary = p.isPrimary ? " **(primary)**" : "";
      return `- **${p.label}** (\`${p.phaseKey}\`)${primary}: ${p.rationale}`;
    })
    .join("\n");
}

function renderApproval(record: PlanArtifactApprovalRecord): string {
  const lines = [
    `- **Confirmed:** ${record.confirmed}`,
    `- **Approved version:** ${record.approvedVersion}`,
    `- **Approved at:** ${record.approvedAt}`,
    `- **Approved by:** ${record.approvedBy}`,
    `- **planRef:** ${record.planRef}`
  ];
  if (record.reviewSummary) {
    lines.push(`- **Review summary:** ${record.reviewSummary}`);
  }
  if (record.openQuestionsAccepted && record.openQuestionsAccepted.length > 0) {
    lines.push("", "**Deferred open questions:**", bulletList(record.openQuestionsAccepted));
  }
  return lines.join("\n");
}

/**
 * Render a non-authoritative markdown projection of a PlanArtifact v1 document.
 * Omits optional sections when empty or not applicable.
 */
export function renderPlanArtifactMarkdown(plan: PlanArtifactV1): string {
  const parts: string[] = [];

  parts.push(`# ${plan.identity.title}`);
  parts.push("");
  parts.push(
    [
      `| Field | Value |`,
      `| --- | --- |`,
      `| planRef | \`${plan.planRef}\` |`,
      `| planId | \`${plan.planId}\` |`,
      `| version | ${plan.version} |`,
      `| status | ${plan.status} |`,
      `| planningType | ${plan.identity.planningType} |`
    ].join("\n")
  );

  if (plan.identity.summary) {
    parts.push("", plan.identity.summary);
  }
  if (plan.identity.tags && plan.identity.tags.length > 0) {
    parts.push("", `**Tags:** ${plan.identity.tags.map((t) => `\`${t}\``).join(", ")}`);
  }

  parts.push(
    "",
    section("Goals", bulletList(plan.goals)),
    section("Non-goals", bulletList(plan.nonGoals)),
    plan.userStories && plan.userStories.length > 0
      ? section("User stories", renderUserStories(plan.userStories))
      : "",
    section(
      "Value assessment",
      [
        `**Impact:** ${plan.valueAssessment.impact}`,
        `**Confidence:** ${plan.valueAssessment.confidence}`,
        plan.valueAssessment.rationale ? `**Rationale:** ${plan.valueAssessment.rationale}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    ),
    section("Risks", renderRisks(plan.riskAssessment)),
    section(
      "Technical impact",
      [
        `**Systems touched:** ${plan.technicalImpact.systemsTouched.join(", ") || "_none_"}`,
        plan.technicalImpact.compatibilityNotes
          ? `**Compatibility:** ${plan.technicalImpact.compatibilityNotes}`
          : "",
        plan.technicalImpact.migrationImpact
          ? `**Migration:** ${plan.technicalImpact.migrationImpact}`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    )
  );

  if (plan.architecture) {
    const archBody = [
      plan.architecture.overview,
      plan.architecture.decisions && plan.architecture.decisions.length > 0
        ? [
            "**Decisions:**",
            ...plan.architecture.decisions.map(
              (d) => `- **${d.id}:** ${d.decision} — _${d.rationale}_`
            )
          ].join("\n")
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    parts.push(section("Architecture", archBody));
  }

  if (plan.uiUxDirection && plan.uiUxDirection.hasUiChanges) {
    const uiBody = [
      plan.uiUxDirection.summary ?? "",
      plan.uiUxDirection.mockupRefs && plan.uiUxDirection.mockupRefs.length > 0
        ? `**Mockups:** ${plan.uiUxDirection.mockupRefs.join(", ")}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    parts.push(section("UI / UX direction", uiBody));
  }

  parts.push(
    section(
      "Testing strategy",
      [
        `**Layers:** ${plan.testingStrategy.layers.join(", ")}`,
        "",
        "**Critical paths:**",
        bulletList(plan.testingStrategy.criticalPaths),
        plan.testingStrategy.outOfScopeTesting && plan.testingStrategy.outOfScopeTesting.length > 0
          ? ["", "**Out of scope:**", bulletList(plan.testingStrategy.outOfScopeTesting)].join("\n")
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    ),
    section("Implementation guidance", bulletList(plan.implementationGuidance)),
    section("What not to do", bulletList(plan.whatNotToDo)),
    section("Assumptions", plan.assumptions.length > 0 ? bulletList(plan.assumptions) : "_None._"),
    section(
      "Open questions",
      plan.openQuestions.length > 0 ? bulletList(plan.openQuestions) : "_None._"
    ),
    section("Work breakdown (WBS)", renderWbs(plan.wbs)),
    section("Phase recommendations", renderPhaseRecommendations(plan.phaseRecommendations))
  );

  if (plan.approvalRecord) {
    parts.push(section("Approval", renderApproval(plan.approvalRecord)));
  }

  parts.push(
    "",
    "---",
    "",
    `_Rendered from PlanArtifact v${plan.schemaVersion} · updated ${plan.provenance.updatedAt} · source ${plan.provenance.source}_`
  );

  return parts
    .filter((chunk) => chunk.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
