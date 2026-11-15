import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment } from "@/lib/contracts";

// In-memory D1 stand-in for the `rate_limits` upsert in src/lib/ratelimit.ts.
const counts = new Map<string, number>();
const DB = {
  prepare(sql: string) {
    let values: unknown[] = [];
    const stmt = {
      bind(...v: unknown[]) {
        values = v;
        return stmt;
      },
      async run() {
        return {};
      },
      async first() {
        if (!sql.includes("INSERT INTO rate_limits")) return null;
        const key = `${values[0]}|${values[1]}`;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return { count };
      },
    };
    return stmt;
  },
};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { DB } }) }));

const experiments = new Map<string, Partial<Experiment>>();
const runAll = vi.fn(async (id: string) => ({ id }));
const rebuild = vi.fn(async (id: string) => ({ id }));
const rescan = vi.fn(async (id: string) => ({
  experiment: { id },
  report: { changed: false, checked: 1, mismatches: [], goalChanged: false, restarted: false },
}));
vi.mock("@/lib/orchestrator", () => ({
  StageInProgressError: class extends Error {},
  Orchestrator: class {
    get = async (id: string) => experiments.get(id) ?? null;
    runAll = runAll;
    rebuild = rebuild;
    rescan = rescan;
    scheduleRun = vi.fn();
    markFailed = vi.fn(async () => undefined);
  },
}));

const { ipBucket, RUN_PER_EXPERIMENT_PER_DAY, RUN_PER_IP_PER_DAY } = await import("@/lib/ratelimit");
const stage = await import("@/app/api/experiments/[id]/[stage]/route");
const rescanRoute = await import("@/app/api/experiments/[id]/rescan/route");

const TOKEN = "fixture-token-0123456789";
const run = (id: string, ip = "203.0.113.7", headers: Record<string, string> = {}, name = "run") =>
  stage.POST(
    new Request(`http://localhost/api/experiments/${id}/${name}`, {
      method: "POST",
      headers: { "cf-connecting-ip": ip, ...headers },
    }),
    { params: Promise.resolve({ id, stage: name }) },
  );
const postRescan = (id: string, body: unknown, ip = "203.0.113.7") =>
  rescanRoute.POST(
    new Request(`http://localhost/api/experiments/${id}/rescan`, {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
const expId = (n: number) => `exp_${n.toString(16).padStart(8, "0")}`;

beforeEach(() => {
  counts.clear();
  experiments.clear();
  vi.clearAllMocks();
  for (let n = 0; n < 20; n++) experiments.set(expId(n), { id: expId(n), status: "failed" });
});
afterEach(() => {
  delete process.env.REHEARSAL_ACCESS_TOKEN;
});

describe("ipBucket", () => {
  it("keeps IPv4 and collapses IPv6 to its /64", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
    expect(ipBucket("2001:0DB8:00aa:00bb::ffff")).toBe("2001:db8:aa:bb::/64");
    expect(ipBucket("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("2001:db8::1%eth0")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("64:ff9b::203.0.113.7")).toBe("64:ff9b:0:0::/64");
  });
});

describe("POST /api/experiments/:id/:stage daily run budget", () => {
  it("returns 429 once an experiment's daily run budget is spent", async () => {
    for (let i = 0; i < RUN_PER_EXPERIMENT_PER_DAY; i++) expect((await run(expId(0))).status).toBe(200);
    expect((await run(expId(0))).status).toBe(429);
    expect(runAll).toHaveBeenCalledTimes(RUN_PER_EXPERIMENT_PER_DAY);
  });

  it("caps runs per caller across experiments, sharing one bucket per IPv6 /64", async () => {
    for (let i = 0; i < RUN_PER_IP_PER_DAY; i++) {
      expect((await run(expId(i), `2001:db8:1:2::${i.toString(16)}`)).status).toBe(200);
    }
    expect((await run(expId(15), "2001:db8:1:2:ffff:ffff:ffff:ffff")).status).toBe(429);
    // An over-budget caller never consumed expId(15)'s budget; another network still can run it.
    expect((await run(expId(15), "198.51.100.9")).status).toBe(200);
  });

  it("refuses to re-run a completed experiment without the access token", async () => {
    experiments.set(expId(1), { id: expId(1), status: "complete" });
    expect((await run(expId(1))).status).toBe(403);
    expect(runAll).not.toHaveBeenCalled();
    process.env.REHEARSAL_ACCESS_TOKEN = TOKEN;
    expect((await run(expId(1), undefined, { authorization: `Bearer ${TOKEN}` })).status).toBe(200);
  });

  it("allows rebuilding a completed experiment again, within the run limit", async () => {
    experiments.set(expId(4), { id: expId(4), status: "complete" });
    expect((await run(expId(4), undefined, {}, "rebuild")).status).toBe(200);
    experiments.set(expId(4), { id: expId(4), status: "complete", rebuild: {} as Experiment["rebuild"] });
    expect((await run(expId(4), undefined, {}, "rebuild")).status).toBe(200);
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect((await run(expId(4), undefined, {}, "spec")).status).toBe(403);
  });

  it("404s unknown experiments before spending budget", async () => {
    expect((await run("exp_ffffffff")).status).toBe(404);
    expect(counts.size).toBe(0);
  });
});

describe("POST /api/experiments/:id/rescan", () => {
  it("shares the daily run budget", async () => {
    for (let i = 0; i < RUN_PER_EXPERIMENT_PER_DAY; i++) expect((await postRescan(expId(2), {})).status).toBe(200);
    expect((await postRescan(expId(2), { goal: "new goal" })).status).toBe(429);
  });

  it("returns 400 for an over-long goal", async () => {
    expect((await postRescan(expId(3), { goal: "x".repeat(10_000) })).status).toBe(400);
    expect(rescan).not.toHaveBeenCalled();
  });
});
