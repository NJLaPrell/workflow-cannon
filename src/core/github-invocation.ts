import { createHmac, timingSafeEqual } from "node:crypto";

/** Route kinds aligned with ADR-github-native-invocation.md slash commands. */
export const GITHUB_INVOCATION_ROUTE_KINDS = [
  "plan",
  "implement",
  "review",
  "fix-review",
  "none"
] as const;

export type GithubInvocationRouteKind = (typeof GITHUB_INVOCATION_ROUTE_KINDS)[number];

const ROUTE_SET = new Set<string>(GITHUB_INVOCATION_ROUTE_KINDS);

/** Verify GitHub `X-Hub-Signature-256` (HMAC-SHA256 hex digest of raw body). */
export function verifyGithubWebhookSignatureSha256(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!secret || !signatureHeader) {
    return false;
  }
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }
  const theirHex = signatureHeader.slice(prefix.length).trim();
  if (!/^[0-9a-f]+$/i.test(theirHex) || theirHex.length % 2 !== 0) {
    return false;
  }
  const theirs = Buffer.from(theirHex, "hex");
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const mine = hmac.digest();
  if (theirs.length !== mine.length) {
    return false;
  }
  return timingSafeEqual(theirs, mine);
}

export function extractTaskIdsFromText(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(T\d{3,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1]!);
  }
  return [...out].sort();
}

const SLASH_RE =
  /^\/(cannon-plan|cannon-implement|cannon-review|cannon-fix-review)\b(.*)$/im;

export function parseCannonSlashCommand(body: string): {
  routeKind: GithubInvocationRouteKind;
  remainder: string;
} | null {
  const lines = body.split(/\r?\n/);
  let m: RegExpMatchArray | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    m = line.match(SLASH_RE);
    if (m) break;
  }
  if (!m) {
    return null;
  }
  const cmd = m[1]!.toLowerCase();
  const remainder = (m[2] ?? "").trim();
  const map: Record<string, GithubInvocationRouteKind> = {
    "cannon-plan": "plan",
    "cannon-implement": "implement",
    "cannon-review": "review",
    "cannon-fix-review": "fix-review"
  };
  const routeKind = map[cmd];
  if (!routeKind) {
    return null;
  }
  return { routeKind, remainder };
}

export function getRepositoryFullName(payload: Record<string, unknown>): string | null {
  const repo = payload.repository;
  if (!repo || typeof repo !== "object" || repo === null) {
    return null;
  }
  const name = (repo as Record<string, unknown>).full_name;
  return typeof name === "string" && name.includes("/") ? name : null;
}

export function getGithubDeliveryMeta(
  headers: Record<string, string | undefined>,
  payload: Record<string, unknown>
): { deliveryId: string; eventName: string } {
  const deliveryId =
    headers["x-github-delivery"] ??
    headers["X-GitHub-Delivery"] ??
    (typeof payload.delivery_id === "string" ? payload.delivery_id : "");
  const eventName =
    headers["x-github-event"] ??
    headers["X-GitHub-Event"] ??
    (typeof payload.action === "string" ? `synthetic.${payload.action}` : "unknown");
  return {
    deliveryId: deliveryId || "unknown-delivery",
    eventName: eventName || "unknown"
  };
}

export function resolveRouteKind(args: {
  eventName: string;
  commentBody: string;
  eventPlaybookMap: Record<string, string>;
}): GithubInvocationRouteKind | null {
  const slash = parseCannonSlashCommand(args.commentBody);
  if (slash) {
    return slash.routeKind;
  }
  const mapped = args.eventPlaybookMap[args.eventName];
  if (mapped === undefined) {
    return null;
  }
  if (!ROUTE_SET.has(mapped)) {
    return null;
  }
  return mapped as GithubInvocationRouteKind;
}

export function getIssueCommentBody(payload: Record<string, unknown>): string {
  const c = payload.comment;
  if (c && typeof c === "object" && c !== null) {
    const body = (c as Record<string, unknown>).body;
    if (typeof body === "string") {
      return body;
    }
  }
  return "";
}

/** Text used for slash parsing: issue comments, PR review bodies, or review comment bodies. */
export function getInvocationCommentBody(
  payload: Record<string, unknown>,
  eventName: string
): string {
  const direct = getIssueCommentBody(payload);
  if (direct.trim()) {
    return direct;
  }
  if (eventName === "pull_request_review") {
    const r = payload.review;
    if (r && typeof r === "object" && r !== null) {
      const body = (r as Record<string, unknown>).body;
      if (typeof body === "string") {
        return body;
      }
    }
  }
  return "";
}

export function isRepositoryAllowed(
  fullName: string | null,
  allowedRepositories: string[]
): boolean {
  if (!fullName) {
    return false;
  }
  const set = new Set(allowedRepositories.map((s) => s.trim().toLowerCase()).filter(Boolean));
  return set.has(fullName.toLowerCase());
}

export type GithubInvocationAuditRecord = {
  schemaVersion: 1;
  githubDeliveryId: string;
  githubEvent: string;
  repositoryFullName: string | null;
  routeKind: GithubInvocationRouteKind | "unresolved";
  decision:
    | "invoked"
    | "dry-run"
    | "policy-denied"
    | "repo-denied"
    | "signature-invalid"
    | "disabled"
    | "debounced"
    | "none-route"
    | "parse-error";
  taskIdsReferenced: string[];
  workspaceKitCommand?: string;
  /** Never include secrets or policy payloads. */
  detail?: string;
};

export function buildAuditRecord(
  partial: Omit<GithubInvocationAuditRecord, "schemaVersion">
): GithubInvocationAuditRecord {
  return { schemaVersion: 1, ...partial };
}
