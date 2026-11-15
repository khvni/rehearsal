import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Experiment,
  type ExperimentStore,
  type LlmClient,
} from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { rollupBrand } from "@/lib/rebuild";
import { buildPage, deterministicPlan } from "@/lib/rebuild/site";
import { GET } from "@/app/experiments/[id]/rb/[[...path]]/route";
import { POST } from "@/app/api/experiments/[id]/[stage]/route";

const allowance = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/ratelimit", () => ({ underRunLimit: allowance }));
vi.mock("@/lib/access", () => ({
  presentsAccessToken: () => false,
  maxConcurrentRuns: () => 2,
  withRunSlot: async (fn: () => Promise<unknown>) => ({
    busy: false,
    value: await fn(),
  }),
}));
const g = globalThis as unknown as { __orchestrator?: Orchestrator };
const ID = "exp_abcdef12";

function fixture(count = 8): Experiment {
  const paths = [
    "/",
    "/resources",
    "/resources/guide",
    "/team",
    "/pricing",
    "/about",
    "/contact",
    "/news",
  ];
  return Experiment.parse({
    id: ID,
    targetUrl: "https://example.com/",
    goal: "Read resources",
    status: "complete",
    createdAt: "2026-01-01T00:00:00Z",
    configuration: {},
    graph: {
      states: paths
        .slice(0, count)
        .map((path, i) => ({
          stateId: `s${i}`,
          stateHash: `h${i}`,
          url: `https://example.com${path}`,
          pageTitle: path === "/" ? "Acme" : path,
          visibleText: "Useful resources for teams building reliable software.",
          viewport: { name: "desktop", width: 1280, height: 900 },
          actions: [],
        })),
      edges: [],
    },
    spec: {
      targetUrl: "https://example.com/",
      goal: "Read resources",
      generatedAt: "2026-01-01T00:00:00Z",
      summary: "Improve navigation",
      changes: [],
      rebuildPhases: [],
    },
  });
}

function setup(exp: Experiment) {
  let saved = structuredClone(exp);
  const llm: LlmClient = {
    name: "fixture",
    complete: vi.fn(async () => ""),
    resetBudget: vi.fn(),
  };
  const store: ExperimentStore = {
    name: "memory",
    get: async (id) => (id === ID ? structuredClone(saved) : null),
    save: async (exp) => {
      saved = structuredClone(exp);
    },
    list: async () => [saved],
    appendActivity: async () => {},
    activity: async () => [],
  };
  const orch = new Orchestrator({ store, llm });
  g.__orchestrator = orch;
  return { orch, llm, saved: () => saved };
}
const get = (path?: string[], id = ID) =>
  GET(new Request(`http://localhost/experiments/${id}/rb`), {
    params: Promise.resolve({ id, path }),
  });
const post = (restart = false, body = false) =>
  POST(
    new Request(
      `http://localhost/api/experiments/${ID}/rebuild${restart && !body ? "?restart=1" : ""}`,
      {
        method: "POST",
        ...(body
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ restart }),
            }
          : {}),
      }
    ),
    { params: Promise.resolve({ id: ID, stage: "rebuild" }) }
  );

afterEach(() => {
  delete g.__orchestrator;
  vi.clearAllMocks();
});

it("replans a canceled planning request on a non-restart rebuild POST", async () => {
  const exp = fixture(1);
  exp.status = "rebuilding";
  const { saved, llm } = setup(exp);
  const response = await post();
  expect(response.status).toBe(200);
  expect(llm.complete).toHaveBeenCalled();
  expect(saved().rebuild?.site?.pages.length).toBeGreaterThan(0);
  expect(saved().runCheckpoint?.stage).toBe("rebuild");
});

describe("rebuilt site route", () => {
  it("serves home without a trailing slash, nested paths and the shared CSS with strict headers", async () => {
    const exp = fixture(3);
    const site = deterministicPlan(exp);
    site.pages = await Promise.all(
      site.pages.map((p) =>
        buildPage(exp, site, p, { name: "fixture", complete: async () => "" })
      )
    );
    exp.rebuild = {
      generatedAt: exp.createdAt,
      brand: rollupBrand(exp.graph!.states),
      goals: [],
      pages: [],
      llm: "fixture",
      site,
    };
    setup(exp);
    for (const path of [undefined, [], ["resources"], ["resources", "guide"]]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const html = await res.text();
      expect(html).toContain(`/experiments/${ID}/rb/_assets/site.css`);
      expect(html).toContain("Useful resources");
      expect(res.headers.get("content-security-policy")).toContain(
        "script-src 'none'"
      );
      expect(res.headers.get("content-security-policy")).toContain(
        "style-src 'self';"
      );
    }
    const css = await get(["_assets", "site.css"]);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain(".rb-container");
    const missing = await get(["not-crawled"]);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Not rebuilt yet");
  });
  it("matches raw and encoded punctuation and Unicode paths against the sitemap", async () => {
    const exp = fixture(4);
    ["/", "/@alice", "/c++", "/caf%C3%A9"].forEach((path, i) => {
      exp.graph!.states[i].url = `https://example.com${path}`;
    });
    const site = deterministicPlan(exp);
    expect(site.pages.map(p => p.path)).toEqual(["/", "/@alice", "/c++", "/café"]);
    site.pages = await Promise.all(site.pages.map(p => buildPage(exp, site, p, { name: "fixture", complete: async () => '<h1>Welcome</h1><a href="/@alice">Alice</a><a href="/c%2B%2B">C++</a>' })));
    site.pages[3].path = "/caf%C3%A9";
    exp.rebuild = { generatedAt: exp.createdAt, brand: rollupBrand(exp.graph!.states), goals: [], pages: [], llm: "fixture", site };
    setup(exp);
    for (const path of [["@alice"], ["%40alice"], ["c++"], ["c%2B%2B"], ["café"], ["caf%C3%A9"]]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(`<a href="/experiments/${ID}/rb/c++">C++</a>`);
    }
  });
  it("rejects traversal and returns simple 404s for absent experiments/sites", async () => {
    setup(fixture());
    for (const path of [
      [".."],
      ["%2e%2e"],
      ["%252e%252e"],
      ["a%2f.."],
      ["a\\.."],
      ["%zz"],
    ])
      expect((await get(path)).status).toBe(400);
    expect((await get()).status).toBe(404);
    expect((await get([], "exp_00000000")).status).toBe(404);
  });
});

describe("rebuild stage API", () => {
  it("persists plan and page batches, budgets retries, counts a whole rebuild once and supports restart", async () => {
    const { saved, llm } = setup(fixture());
    expect((await post()).status).toBe(200);
    expect(
      saved().rebuild!.site!.pages.every((p) => p.status === "planned")
    ).toBe(true);
    expect(llm.resetBudget).toHaveBeenLastCalledWith({
      experimentId: ID,
      maxCalls: 1,
    });
    expect((await post()).status).toBe(200);
    expect(
      saved().rebuild!.site!.pages.filter((p) => p.status === "built")
    ).toHaveLength(6);
    expect(llm.resetBudget).toHaveBeenLastCalledWith({
      experimentId: ID,
      maxCalls: 12,
    });
    const res = await post();
    expect((await res.json()).status).toBe("complete");
    expect(llm.resetBudget).toHaveBeenLastCalledWith({
      experimentId: ID,
      maxCalls: 4,
    });
    expect(allowance).toHaveBeenCalledTimes(1);
    await post();
    expect(allowance).toHaveBeenCalledTimes(1);
    await post(true);
    expect(allowance).toHaveBeenCalledTimes(2);
    expect(
      saved().rebuild!.site!.pages.every((p) => p.status === "planned")
    ).toBe(true);
    await post(true, true);
    expect(allowance).toHaveBeenCalledTimes(3);
  });
});
