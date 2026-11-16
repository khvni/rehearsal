import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserbaseFunctionRunner } from "@/lib/browser/function-runner";
import { classifyError } from "@/lib/errors";
import { Orchestrator } from "@/lib/orchestrator";
import type { Experiment, ExperimentStore, PageFetcher } from "@/lib/contracts";

// Deadline tests isolate the timeout budget: robots.txt checks and per-host
// politeness spacing are preconditions covered by hosted-politeness tests.
vi.mock("@/lib/fetch/guards", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/fetch/guards")>();
  return { ...real, robotsAllows: vi.fn(async () => true), politeDelay: vi.fn(async () => undefined) };
});

const URL = "https://site.test/";
const PAGES: Record<string, string> = {
  [URL]: `<html><head><title>Home</title></head><body><h1>Home</h1><a href="/about">About us</a></body></html>`,
  [`${URL}about`]: `<html><head><title>About</title></head><body><h1>About</h1><p>Who we are</p></body></html>`,
};
const DESKTOP = { name: "desktop" as const, width: 1440, height: 900 };

/** A Function API whose invocations never leave RUNNING; `hang` also stalls every request until it is aborted. */
function stuckBackend(opts: { hang?: boolean } = {}) {
  const calls = { invokes: 0, polls: 0 };
  const fetchImpl = (async (input: RequestInfo | globalThis.URL, init?: RequestInit) => {
    if (String(input).endsWith("/invoke")) calls.invokes += 1;
    else calls.polls += 1;
    if (opts.hang) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }
    return Response.json({ id: "inv_1", status: "RUNNING" });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function fixtureFetcher(): PageFetcher {
  return {
    name: "fixture-fetch",
    async fetchHtml(url) {
      const html = PAGES[url];
      if (html === undefined) throw new Error(`fixture 404: ${url}`);
      return html;
    },
  };
}

function memoryStore(): ExperimentStore {
  const all = new Map<string, Experiment>();
  return {
    name: "memory",
    async save(e) {
      all.set(e.id, e);
    },
    async get(id) {
      return all.get(id) ?? null;
    },
    async list() {
      return [...all.values()];
    },
    async appendActivity() {},
    async activity() {
      return [];
    },
  };
}

beforeEach(() => {
  process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // fetch is stubbed; skip DNS
});
afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_BROWSER;
});

describe("BrowserbaseFunctionRunner deadline", () => {
  it("aborts a hanging Function API request when the operation budget runs out", async () => {
    const { fetchImpl } = stuckBackend({ hang: true });
    const runner = new BrowserbaseFunctionRunner({ apiKey: "bb", functionId: "fn_1", fetchImpl, timeoutMs: 20, pollMs: 10 });
    const started = Date.now();
    const err = await runner.openPage(URL, DESKTOP).catch((e: unknown) => e);
    const elapsed = Date.now() - started;
    expect(classifyError(err)).toBe("BROWSER_REMOTE_FAILED");
    expect(String(err)).toMatch(/openPage .*20 ms/);
    expect(elapsed).toBeLessThan(1_000);
  }, 10_000);

  it("stops polling an invocation stuck in RUNNING at the deadline", async () => {
    const { calls, fetchImpl } = stuckBackend();
    const runner = new BrowserbaseFunctionRunner({ apiKey: "bb", functionId: "fn_1", fetchImpl, timeoutMs: 30, pollMs: 10 });
    const err = await runner.openPage(URL, DESKTOP).catch((e: unknown) => e);
    expect(String(err)).toMatch(/still RUNNING after 30 ms \(invocation inv_1\)/);
    expect(calls.invokes).toBe(1);
  });
});

describe("discover after a hosted browser timeout", () => {
  it("maps the rest of the crawl with the plain fetcher instead of re-invoking the stuck backend", async () => {
    process.env.REHEARSAL_BROWSER = "browserbase-function";
    const { calls, fetchImpl } = stuckBackend();
    const runner = new BrowserbaseFunctionRunner({ apiKey: "bb", functionId: "fn_1", fetchImpl, timeoutMs: 30, pollMs: 10 });
    const orch = new Orchestrator({ store: memoryStore(), fetcher: fixtureFetcher(), probeFetcher: fixtureFetcher(), runner });
    const exp = await orch.startExperiment(URL, "learn about the team", { viewports: ["desktop", "mobile"] }).then((r) => r.experiment);
    const done = await orch.discover(exp.id);
    expect(calls).toMatchObject({ invokes: 1 });
    expect(done.graph?.states.map((s) => `${s.viewport.name}:${s.url}`).sort()).toEqual([
      `desktop:${URL}`,
      `desktop:${URL}about`,
      `mobile:${URL}`,
      `mobile:${URL}about`,
    ]);
    expect(done.failures.filter((f) => f.stage === "discover")).toEqual([]);
  });
});
