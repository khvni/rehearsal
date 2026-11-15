import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import type { Experiment, ExperimentStore } from "@/lib/contracts";
import { POST } from "@/app/api/experiments/route";

/** In-memory store; `failSave`/`failList` make it behave like an unreachable D1. */
function store(opts: { failSave?: boolean; failList?: boolean } = {}): ExperimentStore {
  const all = new Map<string, Experiment>();
  return {
    name: "memory",
    async save(e) {
      if (opts.failSave && all.size > 0) throw new Error("D1_ERROR: database is unavailable");
      all.set(e.id, e);
    },
    async get(id) {
      return all.get(id) ?? null;
    },
    async list() {
      if (opts.failList) throw new Error("D1_ERROR: database is unavailable");
      return [...all.values()];
    },
    async appendActivity() {},
    async activity() {
      return [];
    },
  };
}

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
const useStore = (s: ExperimentStore) => {
  g.__orchestrator = new Orchestrator({ store: s });
};

const postRaw = (body: string) =>
  POST(new Request("http://localhost/api/experiments", { method: "POST", body, headers: { "content-type": "application/json" } }));
const post = (body: unknown) => postRaw(JSON.stringify(body));

// IP-literal targets keep these tests off DNS.
const PUBLIC_TARGET = "https://93.184.216.34/";

let allowPrivate: string | undefined;
beforeEach(() => {
  allowPrivate = process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  useStore(store());
});
afterEach(() => {
  if (allowPrivate === undefined) delete process.env.REHEARSAL_ALLOW_PRIVATE;
  else process.env.REHEARSAL_ALLOW_PRIVATE = allowPrivate;
  delete g.__orchestrator;
});

describe("POST /api/experiments error statuses", () => {
  it("returns 500 when the store can't be read during dedupe", async () => {
    useStore(store({ failList: true }));
    const res = await post({ targetUrl: PUBLIC_TARGET, goal: "x" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/D1_ERROR/);
  });

  it("returns 500 when scheduling the run can't persist the record", async () => {
    useStore(store({ failSave: true }));
    const res = await post({ targetUrl: PUBLIC_TARGET, goal: "x" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/D1_ERROR/);
  });

  it.each([
    ["http://10.0.0.1/", /Blocked private IP: 10\.0\.0\.1/],
    ["http://localhost:3000/", /Blocked hostname: localhost/],
    ["ftp://93.184.216.34/", /Blocked protocol: ftp:/],
    ["not a url", /Invalid URL/],
  ])("returns 400 for a rejected target %s", async (targetUrl, error) => {
    const res = await post({ targetUrl, goal: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(error);
  });

  it.each(["{not json", "null", "[]", "42"])("returns 400 for a body that isn't a JSON object: %s", async (body) => {
    const res = await postRaw(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("body must be a JSON object");
  });

  it("still creates and queues an experiment for a valid target", async () => {
    useStore(store());
    const res = await post({ targetUrl: PUBLIC_TARGET, goal: "x" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("queued");
  });
});
