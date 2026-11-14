import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ACTIVITY_EVENT_LIMIT,
  ActivityEvent,
  Experiment,
  type BrowserRunner,
  type ExperimentStore,
} from "@/lib/contracts";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { Orchestrator } from "@/lib/orchestrator";
import { JsonFileStore } from "@/lib/storage";
import { GET } from "@/app/api/experiments/[id]/activity/route";

const ev = (i: number, kind: ActivityEvent["kind"] = "info"): ActivityEvent => ({
  ts: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  stage: "discover",
  kind,
  message: `event ${i}`,
});

// Determinism rule: no wall-clock/network dependence. REHEARSAL_ALLOW_PRIVATE
// skips DNS; the fetch stub answers robots.txt with 404 → allowed.
beforeAll(() => {
  process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
});

// ── Contract ────────────────────────────────────────────────────────────────

describe("ActivityEvent contract", () => {
  it("parses a full event and defaults nothing it does not own", () => {
    const parsed = ActivityEvent.parse({ ...ev(1, "fetch"), url: "https://example.com/a" });
    expect(parsed.kind).toBe("fetch");
    expect(parsed.url).toBe("https://example.com/a");
  });

  it("rejects an unknown kind", () => {
    expect(() => ActivityEvent.parse({ ...ev(1), kind: "telemetry" })).toThrow();
  });
});

// ── JsonFileStore ───────────────────────────────────────────────────────────

const dir = mkdtempSync(path.join(tmpdir(), "rehearsal-activity-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("JsonFileStore activity", () => {
  it("appends and reads back events in order", async () => {
    const store = new JsonFileStore(dir);
    await store.appendActivity("exp_0000000a", ev(1, "fetch"));
    await store.appendActivity("exp_0000000a", ev(2, "map"));
    const feed = await store.activity("exp_0000000a");
    expect(feed.map((e) => e.message)).toEqual(["event 1", "event 2"]);
    expect(feed.map((e) => e.kind)).toEqual(["fetch", "map"]);
  });

  it("keeps only the newest ACTIVITY_EVENT_LIMIT events", async () => {
    const store = new JsonFileStore(dir);
    for (let i = 0; i < ACTIVITY_EVENT_LIMIT + 7; i++) {
      await store.appendActivity("exp_0000000b", ev(i));
    }
    const feed = await store.activity("exp_0000000b");
    expect(feed).toHaveLength(ACTIVITY_EVENT_LIMIT);
    expect(feed[0].message).toBe("event 7");
    expect(feed.at(-1)?.message).toBe(`event ${ACTIVITY_EVENT_LIMIT + 6}`);
  });

  it("honours a smaller limit and keeps feeds apart per experiment", async () => {
    const store = new JsonFileStore(dir);
    await store.appendActivity("exp_0000000c", ev(1));
    await store.appendActivity("exp_0000000d", ev(9));
    expect(await store.activity("exp_0000000c", 1)).toHaveLength(1);
    expect((await store.activity("exp_0000000c"))[0].message).toBe("event 1");
    expect((await store.activity("exp_0000000d"))[0].message).toBe("event 9");
  });

  it("never writes outside the store dir for hostile ids", async () => {
    const store = new JsonFileStore(dir);
    await store.appendActivity("../escape", ev(1));
    await store.appendActivity("a/b", ev(1));
    expect(await store.activity("../escape")).toEqual([]);
    const files = readdirSync(dir);
    expect(files.every((f) => f.endsWith(".activity.jsonl"))).toBe(true);
  });
});

// ── Orchestrator emission ───────────────────────────────────────────────────

const URL_A = "https://example.com/";
const PAGE = `<html><head><title>Home</title></head><body><h1>Welcome</h1><a href="https://example.com/about">About us</a></body></html>`;

function setup(feeds = new Map<string, ActivityEvent[]>()) {
  const runner: BrowserRunner = {
    name: "stub",
    async openPage() {
      return { html: PAGE, screenshotPath: "" };
    },
    async runTrajectory(args) {
      return {
        runId: args.runId,
        viewport: args.viewport,
        success: false,
        steps: [{ actionId: "a1", label: "Schedule", ok: false, error: "click timed out" }],
        assertions: [{ assertion: { kind: "text-present" as const, value: "schedule" }, passed: false }],
        errors: [],
        consoleErrorCount: 0,
        screenshotPaths: [],
        durationMs: 1200,
      };
    },
    async close() {},
  };
  const mem = new Map<string, Experiment>();
  const store: ExperimentStore = {
    name: "memory",
    async save(e) {
      mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e))));
    },
    async get(id) {
      return mem.get(id) ?? null;
    },
    async list() {
      return [...mem.values()];
    },
    async appendActivity(id, event) {
      feeds.set(id, [...(feeds.get(id) ?? []), event]);
    },
    async activity(id) {
      return feeds.get(id) ?? [];
    },
  };
  const orch = new Orchestrator({
    runner,
    store,
    jev: new FixtureJevClient(),
    llm: new FixtureLlmClient(),
    fetcher: { name: "stub-fetch", fetchHtml: async () => "" },
  });
  const seed = async (id: string) =>
    store.save(
      Experiment.parse({
        id,
        targetUrl: URL_A,
        goal: "find the schedule",
        status: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        configuration: { viewports: ["desktop"], maxStates: 3, maxDepth: 1, trajectories: 10, verifyCount: 1 },
      }),
    );
  return { orch, feeds, seed };
}

describe("orchestrator activity emission", () => {
  it("records the discover loop: fetch, map, done — all tagged 'discover'", async () => {
    const { orch, seed } = setup();
    await seed("exp_00000010");
    await orch.discover("exp_00000010");
    const feed = await orch.activity("exp_00000010");

    const kinds = feed.map((e) => e.kind);
    expect(kinds).toContain("fetch");
    expect(kinds).toContain("map");
    expect(feed.filter((e) => e.kind === "fetch").map((e) => e.url)).toContain(URL_A);
    // every fetch carries its URL and order reads fetch → map per page
    const firstFetch = feed.findIndex((e) => e.kind === "fetch");
    const firstMap = feed.findIndex((e) => e.kind === "map");
    expect(firstFetch).toBeGreaterThanOrEqual(0);
    expect(firstMap).toBeGreaterThan(firstFetch);
    expect(feed.every((e) => e.stage === "discover")).toBe(true);
    expect(feed.every((e) => ActivityEvent.safeParse(e).success)).toBe(true);
    expect(feed.at(-1)?.message).toContain("Map complete");
  });

  it("records browser runs and failed steps/assertions during verify", async () => {
    const { orch, seed } = setup();
    await seed("exp_00000020");
    await orch.verify("exp_00000020"); // runs discover + simulate first
    const feed = await orch.activity("exp_00000020");

    expect(feed.some((e) => e.stage === "verify" && e.kind === "browser" && e.message.includes("run_"))).toBe(true);
    expect(feed.some((e) => e.kind === "assert" && e.message.includes('"Schedule" failed'))).toBe(true);
    expect(feed.some((e) => e.kind === "assert" && e.message.startsWith("Assertion failed:"))).toBe(true);
    expect(feed.some((e) => e.stage === "simulate" && e.kind === "decide")).toBe(true);
  });

  it("records a run-level error line when a stage fails", async () => {
    const { orch, seed } = setup();
    await seed("exp_00000030");
    await orch.markFailed("exp_00000030", new Error("boom"));
    const feed = await orch.activity("exp_00000030");
    expect(feed.at(-1)).toMatchObject({ stage: "run", kind: "error" });
    expect(feed.at(-1)?.message).toContain("boom");
  });
});

// ── Endpoint ────────────────────────────────────────────────────────────────

describe("GET /api/experiments/[id]/activity", () => {
  it("returns the stored feed and 404s for unknown experiments", async () => {
    const { orch, seed } = setup();
    await seed("exp_00000040");
    await orch.discover("exp_00000040");
    (globalThis as { __orchestrator?: Orchestrator }).__orchestrator = orch;

    const res = await GET(new Request("http://localhost/api/experiments/exp_api/activity"), {
      params: Promise.resolve({ id: "exp_00000040" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ActivityEvent[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((e) => ActivityEvent.safeParse(e).success)).toBe(true);

    const missing = await GET(new Request("http://localhost/api/experiments/exp_none/activity"), {
      params: Promise.resolve({ id: "exp_00000099" }),
    });
    expect(missing.status).toBe(404);
  });
});
