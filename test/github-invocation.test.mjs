import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyGithubWebhookSignatureSha256,
  parseCannonSlashCommand,
  resolveRouteKind,
  extractTaskIdsFromText,
  getInvocationCommentBody
} from "../dist/core/github-invocation.js";
import { validatePersistedConfigDocument as validateDoc } from "../dist/core/config-metadata.js";

test("verifyGithubWebhookSignatureSha256 accepts GitHub-style hex digest", () => {
  const secret = "fixture-secret";
  const body = Buffer.from('{"hook":true}');
  const mac = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(
    verifyGithubWebhookSignatureSha256(body, `sha256=${mac}`, secret),
    true
  );
  assert.equal(verifyGithubWebhookSignatureSha256(body, "sha256=deadbeef", secret), false);
  assert.equal(verifyGithubWebhookSignatureSha256(body, undefined, secret), false);
});

test("parseCannonSlashCommand maps slash verbs to route kinds", () => {
  assert.deepEqual(parseCannonSlashCommand("hello\n/cannon-implement T649"), {
    routeKind: "implement",
    remainder: "T649"
  });
  assert.equal(parseCannonSlashCommand("no slash here"), null);
});

test("resolveRouteKind prefers slash over event map", () => {
  const r = resolveRouteKind({
    eventName: "issue_comment",
    commentBody: "/cannon-plan",
    eventPlaybookMap: { issue_comment: "implement" }
  });
  assert.equal(r, "plan");
});

test("resolveRouteKind falls back to eventPlaybookMap", () => {
  const r = resolveRouteKind({
    eventName: "issue_comment",
    commentBody: "plain text",
    eventPlaybookMap: { issue_comment: "plan" }
  });
  assert.equal(r, "plan");
});

test("extractTaskIdsFromText finds T### tokens", () => {
  assert.deepEqual(extractTaskIdsFromText("Ship T649 and T650"), ["T649", "T650"]);
});

test("getInvocationCommentBody reads PR review bodies", () => {
  const payload = {
    review: { body: "/cannon-review T649" }
  };
  assert.match(getInvocationCommentBody(payload, "pull_request_review"), /cannon-review/);
});

test("validatePersistedConfigDocument accepts kit.githubInvocation shape", () => {
  validateDoc(
    {
      kit: {
        githubInvocation: {
          enabled: true,
          allowedRepositories: ["acme/rocket"],
          eventPlaybookMap: { issue_comment: "plan" },
          commentDebounceSeconds: 10,
          rateLimitEventsPerHour: 0,
          planOnlyRunCommands: ["get-next-actions"],
          sensitiveRunCommands: ["run-transition"]
        }
      }
    },
    "fixture"
  );
});

test("validatePersistedConfigDocument rejects bad eventPlaybookMap values", () => {
  assert.throws(
    () =>
      validateDoc(
        {
          kit: {
            githubInvocation: {
              enabled: false,
              eventPlaybookMap: { issue_comment: "nope" }
            }
          }
        },
        "fixture"
      ),
    /eventPlaybookMap/
  );
});
