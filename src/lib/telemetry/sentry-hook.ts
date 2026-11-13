import { createHmac, timingSafeEqual } from "node:crypto";
import { GithubIssueUpsert, SentryAlert } from "../contracts";
import { logEvent } from "./index";

/**
 * Sentry alert webhook → GitHub `first-responder` issue (docs/telemetry.md).
 * The Devin Automation that watches `first-responder` (docs/snapshot-health.md) picks it up.
 */
export const SENTRY_ISSUE_REPO = "khvni/rehearsal";
export const FIRST_RESPONDER_LABELS = ["first-responder", "sentry"] as const;

/** `Sentry-Hook-Signature` = hex HMAC-SHA256 of the raw body, keyed with the integration's client secret. */
export function verifySentrySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const digest = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const expected = Buffer.from(signature.trim());
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export const sentryMarker = (issueId: string) => `<!-- sentry-issue:${issueId} -->`;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

function tagPairs(v: unknown): [string, string][] {
  if (!Array.isArray(v)) return [];
  const out: [string, string][] = [];
  for (const t of v) {
    if (Array.isArray(t) && t.length >= 2) out.push([String(t[0]), String(t[1])]);
    else if (t && typeof t === "object" && "key" in t && "value" in t) out.push([String(t.key), String(t.value)]);
  }
  return out;
}

/**
 * Normalize an `event_alert` (issue alert rule, action `triggered`) or `issue` webhook
 * (`created`, or `unresolved` with substatus `regressed`/`escalating`) into a SentryAlert.
 * Anything else (installation, resolved, assigned, …) returns null and is acknowledged without action.
 */
export function parseSentryAlert(resource: string | null, payload: unknown): SentryAlert | null {
  const body = obj(payload);
  const data = obj(body.data);
  if (resource === "event_alert") {
    const event = obj(data.event);
    const issueId = str(event.issue_id);
    if (!issueId) return null;
    const metadata = obj(event.metadata);
    return SentryAlert.parse({
      issueId,
      title: str(event.title) ?? str(metadata.title) ?? `Sentry issue ${issueId}`,
      culprit: str(event.culprit) ?? "",
      url: issueWebUrl(str(event.web_url), issueId) ?? str(event.issue_url) ?? "",
      eventUrl: str(event.web_url),
      level: str(event.level),
      project: str(event.project),
      reason: `alert rule: ${str(data.triggered_rule) ?? "unknown"}`,
      tags: tagPairs(event.tags),
    });
  }
  if (resource === "issue") {
    const issue = obj(data.issue);
    const issueId = str(issue.id);
    if (!issueId) return null;
    const substatus = str(issue.substatus);
    const action = str(body.action);
    const reason =
      action === "created" ? "created" : action === "unresolved" && (substatus === "regressed" || substatus === "escalating") ? substatus : null;
    if (!reason) return null;
    return SentryAlert.parse({
      issueId,
      title: str(issue.title) ?? `Sentry issue ${issueId}`,
      culprit: str(issue.culprit) ?? "",
      url: str(issue.web_url) ?? str(issue.permalink) ?? "",
      level: str(issue.level),
      project: str(obj(issue.project).slug),
      reason,
      tags: [],
    });
  }
  return null;
}

/** `https://org.sentry.io/issues/123/events/abc/` → `https://org.sentry.io/issues/123/`. */
function issueWebUrl(eventWebUrl: string | undefined, issueId: string): string | undefined {
  if (!eventWebUrl) return undefined;
  const i = eventWebUrl.indexOf(`/issues/${issueId}/`);
  return i === -1 ? undefined : eventWebUrl.slice(0, i + `/issues/${issueId}/`.length);
}

export function issueTitle(alert: SentryAlert): string {
  return `Sentry: ${alert.title}`.slice(0, 240);
}

const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Issue body; the marker makes repeats of the same Sentry issue update instead of duplicate. */
export function issueBody(alert: SentryAlert): string {
  const pipelineTags = ["stage", "experimentId", "targetHost"];
  const repro = pipelineTags.every((k) => !alert.tags.some(([t]) => t === k))
    ? "No pipeline tags on this event: reproduce from the stack trace in Sentry."
    : "Reproduce with the tagged `stage` on `targetHost` (or its fixture in `tests/evals/fixtures`).";
  return [
    sentryMarker(alert.issueId),
    `Sentry reported an unhandled error in Rehearsal (${alert.reason}).`,
    ``,
    `- **Sentry issue:** ${alert.url || "(no URL in payload)"}`,
    ...(alert.eventUrl ? [`- **Latest event:** ${alert.eventUrl}`] : []),
    `- **Title:** ${alert.title}`,
    `- **Culprit:** ${alert.culprit ? `\`${alert.culprit}\`` : "(none)"}`,
    ...(alert.level ? [`- **Level:** ${alert.level}`] : []),
    ...(alert.project ? [`- **Project:** ${alert.project}`] : []),
    ``,
    ...(alert.tags.length
      ? ["| Tag | Value |", "|---|---|", ...alert.tags.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), ""]
      : []),
    repro,
    ``,
    `First responder: reproduce, fix on a branch, open a PR with \`Fixes #<this issue>\` and a regression eval (factory/automations.yaml \`sentry-first-responder\`, docs/telemetry.md).`,
  ].join("\n");
}

interface UpsertOptions {
  token: string | undefined;
  repo?: string;
  fetch?: typeof fetch;
}

interface GithubIssue {
  number: number;
  state: string;
  body?: string | null;
  labels?: (string | { name?: string })[];
  pull_request?: unknown;
}

const inflight = new Map<string, Promise<unknown>>();

/** Open, update, or reopen the GitHub issue for this Sentry issue. No-op (logged) without a token. */
export async function upsertFirstResponderIssue(alert: SentryAlert, opts: UpsertOptions): Promise<GithubIssueUpsert> {
  if (!opts.token) {
    logEvent({ stage: "sentry-hook", kind: "notice", data: { message: "GITHUB_TOKEN unset: not filing", issueId: alert.issueId } });
    return { action: "skipped", reason: "GITHUB_TOKEN unset" };
  }
  // Serialize deliveries for the same Sentry issue so concurrent alerts cannot both miss the lookup and file twice.
  const prev = inflight.get(alert.issueId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => upsert(alert, opts.token!, opts));
  inflight.set(alert.issueId, run);
  try {
    return await run;
  } finally {
    if (inflight.get(alert.issueId) === run) inflight.delete(alert.issueId);
  }
}

async function upsert(alert: SentryAlert, token: string, opts: UpsertOptions): Promise<GithubIssueUpsert> {
  const repo = opts.repo ?? SENTRY_ISSUE_REPO;
  const doFetch = opts.fetch ?? fetch;
  const gh = async (method: string, route: string, body?: unknown, tolerate: number[] = []) => {
    const res = await doFetch(`https://api.github.com/repos/${repo}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && !tolerate.includes(res.status)) {
      throw new Error(`GitHub ${method} ${route} → ${res.status}`);
    }
    return res;
  };

  const marker = sentryMarker(alert.issueId);
  let existing: GithubIssue | undefined;
  for (let page = 1; !existing; page++) {
    const res = await gh("GET", `/issues?labels=sentry&state=all&per_page=100&page=${page}`);
    const issues = (await res.json()) as GithubIssue[];
    existing = issues.find((i) => !i.pull_request && i.body?.includes(marker));
    if (issues.length < 100) break;
  }

  const body = issueBody(alert);
  if (!existing) {
    for (const name of FIRST_RESPONDER_LABELS) {
      // 422 = label already exists.
      await gh("POST", "/labels", { name, color: name === "sentry" ? "362d59" : "d73a4a" }, [422]);
    }
    const res = await gh("POST", "/issues", { title: issueTitle(alert), body, labels: [...FIRST_RESPONDER_LABELS] });
    const created = (await res.json()) as GithubIssue;
    return { action: "created", number: created.number };
  }

  const n = existing.number;
  const reopen = existing.state === "closed";
  const armed = (existing.labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === "first-responder");
  // Ordered so a retry after any partial failure still re-arms: drop label → reopen → re-add label.
  // A `labeled` event re-arms the first-responder Automation for the regression.
  if (reopen) await gh("DELETE", `/issues/${n}/labels/first-responder`, undefined, [404]);
  await gh("PATCH", `/issues/${n}`, { body, ...(reopen ? { state: "open" } : {}) });
  if (reopen || !armed) await gh("POST", `/issues/${n}/labels`, { labels: ["first-responder"] });
  await gh("POST", `/issues/${n}/comments`, {
    body: `Sentry fired again (${alert.reason})${alert.eventUrl ? `: ${alert.eventUrl}` : "."}`,
  });
  return reopen ? { action: "reopened", number: n } : { action: "updated", number: n };
}
