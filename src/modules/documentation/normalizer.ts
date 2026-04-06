import type { AiRecord } from "./parser.js";
import type {
  NormalizedBaseRecord,
  NormalizedCadence,
  NormalizedChatFeature,
  NormalizedCheck,
  NormalizedCommand,
  NormalizedConfig,
  NormalizedDecision,
  NormalizedDocument,
  NormalizedExample,
  NormalizedGuardrail,
  NormalizedMeta,
  NormalizedRef,
  NormalizedRollback,
  NormalizedRule,
  NormalizedState,
  NormalizedTerm,
  NormalizedWorkflow,
  NormalizedRunbook,
  NormalizedWorkbook,
  NormalizedChain,
  NormalizedArtifact,
  NormalizedPromotion,
  NormalizedTransition
} from "./types.js";

function asStatus(v?: string): NormalizedBaseRecord["status"] {
  if (v === "active" || v === "deprecated" || v === "draft" || v === "observed" || v === "planned") return v;
  return undefined;
}

function asList(v?: string): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Step sequences in `chat_feature|…|steps=` use `>` so commas can appear inside a step. */
function asStepSequence(v?: string): string[] {
  if (!v) return [];
  return v
    .split(">")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeDocument(records: AiRecord[]): NormalizedDocument {
  const refs: NormalizedRef[] = [];
  const rules: NormalizedRule[] = [];
  const checks: NormalizedCheck[] = [];
  const decisions: NormalizedDecision[] = [];
  const examples: NormalizedExample[] = [];
  const terms: NormalizedTerm[] = [];
  const commands: NormalizedCommand[] = [];
  const workflows: NormalizedWorkflow[] = [];
  const runbooks: NormalizedRunbook[] = [];
  const workbooks: NormalizedWorkbook[] = [];
  const chains: NormalizedChain[] = [];
  const states: NormalizedState[] = [];
  const transitions: NormalizedTransition[] = [];
  const promotions: NormalizedPromotion[] = [];
  const rollbacks: NormalizedRollback[] = [];
  const artifacts: NormalizedArtifact[] = [];
  const configs: NormalizedConfig[] = [];
  const cadences: NormalizedCadence[] = [];
  const guardrails: NormalizedGuardrail[] = [];
  const chatFeatures: NormalizedChatFeature[] = [];
  const refsById = new Map<string, NormalizedRef>();
  const examplesByParent = new Map<string, NormalizedExample[]>();
  const profileRecords = new Map<"core" | "runbook" | "workbook", Array<NormalizedBaseRecord>>([
    ["core", []],
    ["runbook", []],
    ["workbook", []]
  ]);

  let meta: NormalizedMeta | null = null;
  for (const rec of records) {
    const status = asStatus(rec.kv["status"] ?? rec.kv["st"]);
    if (rec.type === "meta") {
      meta = {
        schema: "base.v2",
        doc: rec.kv["doc"] ?? "rules",
        truth: (rec.kv["truth"] as NormalizedMeta["truth"]) ?? "canonical",
        profile: rec.kv["profile"] as NormalizedMeta["profile"],
        status,
        title: rec.kv["title"],
        owner: rec.kv["owner"],
        tags: asList(rec.kv["tags"]),
        refs: asList(rec.kv["refs"])
      };
      continue;
    }

    if (rec.type === "ref") {
      const ref: NormalizedRef = {
        id: rec.kv["id"] ?? rec.kv["name"] ?? "",
        type: (rec.kv["type"] as NormalizedRef["type"]) ?? "doc",
        target: rec.kv["target"] ?? rec.kv["path"] ?? "",
        anchor: rec.kv["anchor"],
        label: rec.kv["label"] ?? rec.kv["name"],
        note: rec.kv["note"],
        status
      };
      refs.push(ref);
      if (ref.id) refsById.set(ref.id, ref);
      continue;
    }

    if (rec.type === "rule") {
      rules.push({
        id: rec.kv["id"] ?? rec.kv["slot1"] ?? "",
        level: (rec.kv["level"] as NormalizedRule["level"]) ?? "should",
        scope: rec.kv["scope"] ?? "",
        scope_kind: rec.kv["scope_kind"],
        kind: rec.kv["kind"],
        directive: rec.kv["directive"] ?? rec.kv["slot3"] ?? "",
        why: rec.kv["why"] ?? "",
        unless: rec.kv["unless"],
        also: asList(rec.kv["also"]),
        risk: rec.kv["risk"] as NormalizedRule["risk"],
        approval: rec.kv["approval"] as NormalizedRule["approval"],
        override: rec.kv["override"] as NormalizedRule["override"],
        status,
        refs: asList(rec.kv["refs"])
      });
      continue;
    }

    if (rec.type === "example") {
      const ex: NormalizedExample = {
        id: rec.kv["id"] ?? "",
        for: rec.kv["for"] ?? "",
        kind: (rec.kv["kind"] as NormalizedExample["kind"]) ?? "edge",
        text: rec.kv["text"] ?? "",
        status,
        refs: asList(rec.kv["refs"])
      };
      examples.push(ex);
      const list = examplesByParent.get(ex.for) ?? [];
      list.push(ex);
      examplesByParent.set(ex.for, list);
      continue;
    }

    if (rec.type === "check") checks.push({ id: rec.kv["id"] ?? "", scope: rec.kv["scope"] ?? "", assertion: rec.kv["assertion"] ?? rec.kv["assert"] ?? "", when: rec.kv["when"], onFail: rec.kv["onFail"] as NormalizedCheck["onFail"], status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "decision") decisions.push({ id: rec.kv["id"] ?? "", topic: rec.kv["topic"] ?? "", choice: rec.kv["choice"] ?? "", why: rec.kv["why"] ?? "", consequence: rec.kv["consequence"] ?? rec.kv["then"], status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "term") terms.push({ name: rec.kv["name"] ?? "", definition: rec.kv["definition"] ?? rec.kv["def"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "command" || rec.type === "cmd") commands.push({ id: rec.kv["id"] ?? rec.kv["slot1"] ?? "", name: rec.kv["name"] ?? "", use: rec.kv["use"] ?? "", scope: rec.kv["scope"] ?? "", expectation: rec.kv["expectation"] ?? rec.kv["expect"] ?? "", risk: rec.kv["risk"] as NormalizedCommand["risk"], sensitivity: rec.kv["sensitivity"] as NormalizedCommand["sensitivity"], status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "workflow" || rec.type === "wf") workflows.push({ id: rec.kv["id"] ?? rec.kv["slot1"] ?? "", name: rec.kv["name"] ?? "", when: rec.kv["when"] ?? "", steps: asList(rec.kv["steps"] ?? rec.kv["do"]), done: asList(rec.kv["done"]), forbid: asList(rec.kv["forbid"]), askIf: rec.kv["askIf"] ?? rec.kv["ask_if"], haltIf: rec.kv["haltIf"] ?? rec.kv["halt_if"], approval: rec.kv["approval"] as NormalizedWorkflow["approval"], risk: rec.kv["risk"] as NormalizedWorkflow["risk"], status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "runbook") runbooks.push({ name: rec.kv["name"] ?? "", scope: rec.kv["scope"] ?? "", owner: rec.kv["owner"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "workbook") workbooks.push({ name: rec.kv["name"] ?? "", phase: rec.kv["phase"] ?? "", state: rec.kv["state"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "chain") chains.push({ step: rec.kv["step"] ?? "", command: rec.kv["command"] ?? "", expectExit: Number.parseInt(rec.kv["expectExit"] ?? rec.kv["expect_exit"] ?? "0", 10), status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "state") states.push({ name: rec.kv["name"] ?? "", distTag: rec.kv["distTag"] ?? rec.kv["dist_tag"] ?? "", intent: rec.kv["intent"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "transition") transitions.push({ from: rec.kv["from"] ?? "", to: rec.kv["to"] ?? "", requires: asList(rec.kv["requires"]), status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "promotion") promotions.push({ from: rec.kv["from"] ?? "", to: rec.kv["to"] ?? "", requires: asList(rec.kv["requires"]), status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "rollback") rollbacks.push({ strategy: rec.kv["strategy"] ?? "", note: rec.kv["note"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "artifact") artifacts.push({ path: rec.kv["path"] ?? "", schema: rec.kv["schema"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "config") configs.push({ key: rec.kv["key"] ?? "", default: rec.kv["default"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "cadence") cadences.push({ rule: rec.kv["rule"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "guardrail") guardrails.push({ id: rec.kv["id"] ?? "", level: (rec.kv["level"] as NormalizedGuardrail["level"]) ?? "should", directive: rec.kv["directive"] ?? "", why: rec.kv["why"] ?? "", status, refs: asList(rec.kv["refs"]) });
    if (rec.type === "chat_feature" || rec.type === "chatfeature") {
      chatFeatures.push({
        id: rec.kv["id"] ?? "",
        title: rec.kv["title"] ?? "",
        summary: rec.kv["summary"] ?? "",
        steps: asStepSequence(rec.kv["steps"] ?? rec.kv["do"]),
        status,
        refs: asList(rec.kv["refs"])
      });
    }
  }

  const core: NormalizedBaseRecord[] = [
    ...refs,
    ...rules,
    ...checks,
    ...decisions,
    ...examples,
    ...terms,
    ...commands,
    ...workflows,
    ...chatFeatures
  ];
  const runbook: NormalizedBaseRecord[] = [...runbooks, ...chains, ...states, ...transitions, ...promotions, ...rollbacks, ...artifacts, ...configs, ...cadences, ...guardrails];
  const workbook: NormalizedBaseRecord[] = [...workbooks, ...states, ...transitions, ...artifacts, ...guardrails];
  profileRecords.set("core", core);
  profileRecords.set("runbook", runbook);
  profileRecords.set("workbook", workbook);

  return {
    meta,
    refs,
    rules,
    checks,
    decisions,
    examples,
    terms,
    commands,
    workflows,
    runbooks,
    workbooks,
    chains,
    states,
    transitions,
    promotions,
    rollbacks,
    artifacts,
    configs,
    cadences,
    guardrails,
    chatFeatures,
    refsById,
    examplesByParent,
    profileRecords
  };
}
