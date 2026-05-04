/**
 * Conservative secret-shaped pattern detection for phase journal free text.
 * When no dedicated redaction pipeline is configured, we **reject** writes that
 * look like pasted credentials (stable **`phase-note-secret-rejected`**).
 */

export const PHASE_NOTE_SECRET_REJECTION_CODE = "phase-note-secret-rejected" as const;

export type PhaseNoteSecretGuardResult =
  | { ok: true }
  | { ok: false; code: typeof PHASE_NOTE_SECRET_REJECTION_CODE; message: string };

type Detector = { test: (s: string) => boolean; hint: string };

/** Ordered: higher-signal patterns first. Do not echo matched substrings in messages. */
const DETECTORS: Detector[] = [
  {
    test: (s) => /-----BEGIN [A-Z0-9 -]*PRIVATE KEY-----/.test(s),
    hint: "contains a PEM private key header"
  },
  {
    test: (s) => /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/.test(s),
    hint: "matches a GitHub classic token shape"
  },
  {
    test: (s) => /github_pat_[A-Za-z0-9_]{20,}/i.test(s),
    hint: "matches a fine-grained GitHub PAT prefix"
  },
  {
    test: (s) => /\bsk-ant-[a-zA-Z0-9_-]{15,}/i.test(s),
    hint: "matches an Anthropic API key shape"
  },
  {
    test: (s) => /\bsk_(?:live|test)_[0-9a-zA-Z]{20,}/.test(s),
    hint: "matches a Stripe secret key shape"
  },
  {
    test: (s) => /\bAKIA[0-9A-Z]{16}\b/.test(s),
    hint: "matches an AWS access key id shape"
  },
  {
    test: (s) => /\bASIA[0-9A-Z]{16}\b/.test(s),
    hint: "matches an AWS temporary access key id shape"
  },
  {
    test: (s) => /\bxox[baprs]-[0-9a-z-]{10,}/i.test(s),
    hint: "matches a Slack bot token shape"
  },
  {
    test: (s) => /\bnpm_[A-Za-z0-9]{36,}/.test(s),
    hint: "matches an npm token shape"
  },
  {
    test: (s) => /\bAIza[0-9A-Za-z_-]{20,}/.test(s),
    hint: "matches a Google API key shape"
  },
  {
    test: (s) => /\bBearer\s+[A-Za-z0-9._=-]{40,}/.test(s),
    hint: "contains a long Bearer credential-shaped value"
  },
  {
    test: (s) => /\bsk-proj-[a-zA-Z0-9_-]{10,}/i.test(s),
    hint: "matches an OpenAI project API key shape"
  },
  {
    test: (s) => /\bsk-[A-Za-z0-9]{20,}/.test(s),
    hint: "matches an OpenAI-style API key shape"
  }
];

/**
 * Reject when `text` matches high-confidence secret-shaped patterns.
 * @param fieldLabel Human-facing field name for errors (e.g. `summary`, `ref value`).
 */
export function rejectIfPhaseNoteTextContainsSecret(text: string, fieldLabel: string): PhaseNoteSecretGuardResult {
  if (!text) {
    return { ok: true };
  }
  for (const d of DETECTORS) {
    if (d.test(text)) {
      return {
        ok: false,
        code: PHASE_NOTE_SECRET_REJECTION_CODE,
        message: `Phase note ${fieldLabel} ${d.hint}. Summarize the finding without pasting secrets, tokens, or private keys.`
      };
    }
  }
  return { ok: true };
}

export function guardPhaseNoteOptionalText(
  value: string | null | undefined,
  fieldLabel: string
): PhaseNoteSecretGuardResult {
  if (value == null) {
    return { ok: true };
  }
  return rejectIfPhaseNoteTextContainsSecret(value, fieldLabel);
}

/**
 * Validate user-supplied strings on `convert-phase-note-to-task` before task creation.
 */
export function guardPhaseNoteConvertTaskPayload(
  args: Record<string, unknown>,
  resolved: { title: string; summary: string; description: string | undefined }
): PhaseNoteSecretGuardResult {
  const pairs: Array<[string, string]> = [
    ["task title", resolved.title],
    ["task summary", resolved.summary]
  ];
  if (resolved.description) {
    pairs.push(["task description", resolved.description]);
  }
  for (const key of ["approach", "risk", "phase", "ownership"] as const) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) {
      pairs.push([`task ${key}`, v.trim()]);
    }
  }
  for (const arrKey of ["technicalScope", "acceptanceCriteria"] as const) {
    const arr = args[arrKey];
    if (!Array.isArray(arr)) {
      continue;
    }
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (typeof item === "string" && item.trim()) {
        pairs.push([`${String(arrKey)}[${i}]`, item.trim()]);
      }
    }
  }
  for (const [label, val] of pairs) {
    const r = rejectIfPhaseNoteTextContainsSecret(val, label);
    if (!r.ok) {
      return r;
    }
  }
  return { ok: true };
}
