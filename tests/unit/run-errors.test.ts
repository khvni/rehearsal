import { describe, expect, it } from "vitest";
import { Experiment } from "../../src/lib/contracts";
import { BrowserbaseFunctionRunner, UnavailableRunner } from "../../src/lib/browser/function-runner";
import { selectRunner } from "../../src/lib/browser/runner";
import { RehearsalError, classifyError, dominantCode, formatFailure, toFailure } from "../../src/lib/errors";

const VP = { name: "desktop" as const, width: 1440, height: 900 };

describe("classifyError", () => {
  it.each([
    ["Blocked private IP: 10.0.0.1", "EGRESS_BLOCKED"],
    ["Hostname resolves to private IP: a.test -> 127.0.0.1", "EGRESS_BLOCKED"],
    ["robots.txt disallows /admin", "ROBOTS_DISALLOWED"],
    ["Redirected off-origin to https://evil.test", "REDIRECT_OFF_ORIGIN"],
    ["Non-HTML response (application/pdf) for https://a.test/x", "NON_HTML"],
    ["browserType.launch: Executable doesn't exist at /ms-playwright/chromium", "BROWSER_UNAVAILABLE"],
    ["page.goto: Timeout 30000ms exceeded.", "NAV_TIMEOUT"],
    ["page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.test", "NAV_FAILED"],
    ["Fetch failed 503 for https://a.test", "HTTP_STATUS"],
    ["something odd", "UNKNOWN"],
  ])("%s → %s", (message, code) => {
    expect(classifyError(new Error(message))).toBe(code);
  });

  it("keeps the code a RehearsalError was thrown with", () => {
    expect(classifyError(new RehearsalError("BOT_CHALLENGE", "Access denied"))).toBe("BOT_CHALLENGE");
  });

  it("formats readable lines and picks the most common code", () => {
    const fails = [
      toFailure(new Error("Timeout 30000ms exceeded"), "discover", "https://a.test/1"),
      toFailure(new RehearsalError("BROWSER_UNAVAILABLE", "No remote browser configured"), "discover", "https://a.test/"),
      toFailure(new RehearsalError("BROWSER_UNAVAILABLE", "No remote browser configured"), "discover", "https://a.test/2"),
    ];
    expect(dominantCode(fails)).toBe("BROWSER_UNAVAILABLE");
    expect(formatFailure(fails[1])).toBe("[BROWSER_UNAVAILABLE] No remote browser configured");
    expect(formatFailure({ code: "UNKNOWN", message: "[UNKNOWN] x" })).toBe("[UNKNOWN] x");
  });

  it("stored experiments without failures still parse", () => {
    const exp = Experiment.parse({
      id: "exp_1",
      targetUrl: "https://a.test/",
      goal: "g",
      status: "failed",
      createdAt: "2026-01-01T00:00:00.000Z",
      configuration: {},
    });
    expect(exp.failures).toEqual([]);
  });
});

describe("selectRunner on workerd", () => {
  it("never falls back to local Chromium on Workers", () => {
    expect(selectRunner({}, true).name).toBe("no-browser");
    expect(selectRunner({ BROWSERBASE_API_KEY: "bb" }, true).name).toBe("no-browser");
    expect(selectRunner({ BROWSERBASE_API_KEY: "bb", BROWSERBASE_FUNCTION_ID: "fn" }, true).name).toBe("browserbase-function");
  });

  it("UnavailableRunner fails every page with BROWSER_UNAVAILABLE", async () => {
    const err = await new UnavailableRunner("No remote browser configured").openPage().catch((e) => e);
    expect(classifyError(err)).toBe("BROWSER_UNAVAILABLE");
  });
});

describe("BrowserbaseFunctionRunner", () => {
  process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  const fakeApi = (statuses: { status: string; results?: unknown; error?: unknown }[]) => {
    const calls: { url: string; body?: unknown; key?: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        key: (init?.headers as Record<string, string>)["x-bb-api-key"],
      });
      // Once the scripted statuses drain, repeat the last one — a long-running
      // invocation stays RUNNING however fast this machine drains the array.
      const next = statuses.length ? statuses.shift()! : { status: "RUNNING" };
      return new Response(JSON.stringify({ id: "inv_1", ...next }), { status: 200 });
    }) as typeof fetch;
    return { calls, runner: new BrowserbaseFunctionRunner({ apiKey: "bb", functionId: "fn_1", fetchImpl, sleep: async () => {}, pollMs: 10, timeoutMs: 50 }) };
  };

  it("invokes the Function, polls to COMPLETED and unwraps the value", async () => {
    const { calls, runner } = fakeApi([
      { status: "PENDING" },
      { status: "RUNNING" },
      { status: "COMPLETED", results: { ok: true, value: { html: "<html></html>" } } },
    ]);
    const res = await runner.openPage("https://a.test/", VP);
    expect(res.html).toBe("<html></html>");
    expect(calls[0].url).toBe("https://api.browserbase.com/v1/functions/fn_1/invoke");
    expect(calls[0].body).toMatchObject({ params: { op: "openPage", args: { url: "https://a.test/" } } });
    expect(calls[0].body).not.toHaveProperty("op");
    expect(calls[0].key).toBe("bb");
    expect(calls[2].url).toBe("https://api.browserbase.com/v1/functions/invocations/inv_1");
  });

  it("surfaces the Function's own error so it keeps its code", async () => {
    const { runner } = fakeApi([{ status: "COMPLETED", results: { ok: false, error: "page.goto: Timeout 60000ms exceeded." } }]);
    const err = await runner.openPage("https://a.test/", VP).catch((e) => e);
    expect(classifyError(err)).toBe("NAV_TIMEOUT");
  });

  it("maps FAILED invocations and timeouts to BROWSER_REMOTE_FAILED", async () => {
    const failed = await fakeApi([{ status: "FAILED", error: "session crashed" }]).runner.openPage("https://a.test/", VP).catch((e) => e);
    expect(classifyError(failed)).toBe("BROWSER_REMOTE_FAILED");
    const stuck = await fakeApi(Array.from({ length: 2000 }, () => ({ status: "RUNNING" }))).runner.openPage("https://a.test/", VP).catch((e) => e);
    expect(classifyError(stuck)).toBe("BROWSER_REMOTE_FAILED");
    expect(String(stuck)).toMatch(/still RUNNING after 50 ms/);
  });
});
