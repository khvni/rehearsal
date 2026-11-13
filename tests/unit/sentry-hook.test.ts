import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  issueBody,
  parseSentryAlert,
  sentryMarker,
  upsertFirstResponderIssue,
  verifySentrySignature,
} from "@/lib/telemetry/sentry-hook";
import { traceTags } from "@/lib/telemetry";
import { POST } from "@/app/api/hooks/sentry/route";

const SECRET = "test-client-secret";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");

// Shape from docs.sentry.io/integrations/integration-platform/webhooks/issue-alerts/
const eventAlert = {
  action: "triggered",
  installation: { uuid: "a8e5d37a-696c-4c54-adb5-b3f28d64c7de" },
  data: {
    triggered_rule: "Unhandled stage exception",
    event: {
      issue_id: "1117540176",
      title: "Error: Target path disallowed by robots.txt: /",
      culprit: "Orchestrator.discover(src/lib/orchestrator.ts)",
      level: "error",
      project: 1,
      web_url: "https://acme.sentry.io/issues/1117540176/events/e4874d664c3540c1a32eab185f12c5ab/",
      issue_url: "https://sentry.io/api/0/issues/1117540176/",
      tags: [
        ["level", "error"],
        ["stage", "discover"],
        ["experimentId", "exp_1234abcd"],
        ["targetHost", "ai.engineer"],
      ],
    },
  },
  actor: { type: "application", id: "sentry", name: "Sentry" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** In-memory GitHub issues API: records every call. */
function fakeGithub(issues: { number: number; state: string; body: string }[] = []) {
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, path: u.pathname + u.search, body });
    if (method === "GET") return jsonResponse(issues);
    if (method === "POST" && u.pathname.endsWith("/issues")) return jsonResponse({ number: 42, state: "open" }, 201);
    return jsonResponse({}, method === "POST" ? 201 : 200);
  });
  return { calls, fetch: fetchMock as unknown as typeof fetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sentry webhook signature", () => {
  const body = JSON.stringify(eventAlert);
  it("accepts the hex HMAC-SHA256 of the raw body", () => {
    expect(verifySentrySignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejects a wrong secret, a tampered body, and a missing header", () => {
    expect(verifySentrySignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifySentrySignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifySentrySignature(body, null, SECRET)).toBe(false);
    expect(verifySentrySignature(body, "abc", SECRET)).toBe(false);
  });
});

describe("parseSentryAlert", () => {
  it("normalizes an issue alert with pipeline tags and the issue web URL", () => {
    const alert = parseSentryAlert("event_alert", eventAlert)!;
    expect(alert.issueId).toBe("1117540176");
    expect(alert.url).toBe("https://acme.sentry.io/issues/1117540176/");
    expect(alert.reason).toBe("alert rule: Unhandled stage exception");
    expect(alert.tags).toContainEqual(["targetHost", "ai.engineer"]);
  });
  it("accepts new and regressed issue webhooks, ignores the rest", () => {
    const issue = (action: string, substatus: string) => ({
      action,
      data: { issue: { id: "77", title: "TypeError", culprit: "verify", web_url: "https://acme.sentry.io/issues/77/", substatus } },
    });
    expect(parseSentryAlert("issue", issue("created", "new"))?.reason).toBe("created");
    expect(parseSentryAlert("issue", issue("unresolved", "regressed"))?.reason).toBe("regressed");
    expect(parseSentryAlert("issue", issue("resolved", "new"))).toBeNull();
    expect(parseSentryAlert("installation", { action: "created" })).toBeNull();
  });
});

describe("telemetry tags", () => {
  it("tags spans/failures with stage, experimentId, targetHost", () => {
    expect(traceTags("verify", { experimentId: "exp_1", targetUrl: "https://ai.engineer/code/2026" })).toEqual({
      stage: "verify",
      experimentId: "exp_1",
      targetHost: "ai.engineer",
    });
    expect(traceTags("spec", { experimentId: "exp_2" }).targetHost).toBe("unknown");
  });
});

describe("upsertFirstResponderIssue", () => {
  const alert = parseSentryAlert("event_alert", eventAlert)!;

  it("opens a first-responder + sentry issue with the stable marker", async () => {
    const gh = fakeGithub();
    const result = await upsertFirstResponderIssue(alert, { token: "t", fetch: gh.fetch });
    expect(result).toEqual({ action: "created", number: 42 });
    const create = gh.calls.find((c) => c.method === "POST" && c.path === "/repos/khvni/rehearsal/issues")!;
    expect(create.body?.labels).toEqual(["first-responder", "sentry"]);
    expect(create.body?.title).toBe("Sentry: Error: Target path disallowed by robots.txt: /");
    const body = String(create.body?.body);
    expect(body.startsWith(sentryMarker("1117540176"))).toBe(true);
    expect(body).toContain("https://acme.sentry.io/issues/1117540176/");
    expect(body).toContain("`Orchestrator.discover(src/lib/orchestrator.ts)`");
    expect(body).toContain("| targetHost | ai.engineer |");
    expect(body).toBe(issueBody(alert));
  });

  it("updates the matching open issue instead of duplicating", async () => {
    const gh = fakeGithub([{ number: 7, state: "open", body: `${sentryMarker("1117540176")}\nold` }]);
    const result = await upsertFirstResponderIssue(alert, { token: "t", fetch: gh.fetch });
    expect(result).toEqual({ action: "updated", number: 7 });
    expect(gh.calls.some((c) => c.method === "POST" && c.path.endsWith("/issues"))).toBe(false);
    expect(gh.calls.find((c) => c.method === "PATCH")?.path).toBe("/repos/khvni/rehearsal/issues/7");
    expect(gh.calls.some((c) => c.path.endsWith("/issues/7/comments"))).toBe(true);
  });

  it("reopens a closed issue on regression and re-applies first-responder", async () => {
    const gh = fakeGithub([{ number: 9, state: "closed", body: sentryMarker("1117540176") }]);
    const result = await upsertFirstResponderIssue(alert, { token: "t", fetch: gh.fetch });
    expect(result.action).toBe("reopened");
    expect(gh.calls.find((c) => c.method === "PATCH")?.body?.state).toBe("open");
    expect(gh.calls.find((c) => c.method === "POST" && c.path.endsWith("/issues/9/labels"))?.body).toEqual({
      labels: ["first-responder"],
    });
  });

  it("no-ops without GITHUB_TOKEN", async () => {
    const gh = fakeGithub();
    expect(await upsertFirstResponderIssue(alert, { token: undefined, fetch: gh.fetch })).toMatchObject({ action: "skipped" });
    expect(gh.calls).toHaveLength(0);
  });
});

describe("POST /api/hooks/sentry", () => {
  const raw = JSON.stringify(eventAlert);
  const request = (signature: string, resource = "event_alert") =>
    new Request("http://localhost/api/hooks/sentry", {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", "sentry-hook-signature": signature, "sentry-hook-resource": resource },
    });

  it("503 without SENTRY_WEBHOOK_SECRET, 401 on a bad signature", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", "");
    expect((await POST(request(sign(raw)))).status).toBe(503);
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", SECRET);
    expect((await POST(request("deadbeef"))).status).toBe(401);
  });

  it("files the issue on a signed alert, acknowledges other resources", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("GITHUB_TOKEN", "t");
    const gh = fakeGithub();
    vi.stubGlobal("fetch", gh.fetch);
    const res = await POST(request(sign(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, issueId: "1117540176", action: "created", number: 42 });
    const ignored = await POST(request(sign(raw), "installation"));
    expect(await ignored.json()).toMatchObject({ ok: true, ignored: "installation" });
  });
});
