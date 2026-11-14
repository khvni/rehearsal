import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment } from "@/lib/contracts";

const startExperiment = vi.fn();
const scheduleRun = vi.fn();
const getByIdempotencyKey = vi.fn(async (): Promise<Experiment | null> => null);
const findBySite = vi.fn(async (): Promise<Experiment | null> => null);
vi.mock("@/lib/orchestrator", () => ({
  Orchestrator: class {
    startExperiment = startExperiment;
    scheduleRun = scheduleRun;
    getByIdempotencyKey = getByIdempotencyKey;
    findBySite = findBySite;
  },
}));

vi.mock("@/lib/ratelimit", () => ({ clientIp: () => "test", underDailyLimit: async () => true }));

const { POST } = await import("@/app/api/experiments/route");

const post = (body: unknown, headers?: Record<string, string>) =>
  POST(new Request("http://localhost/api/experiments", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/experiments", () => {
  it.each([
    { trajectories: 1_000_000_000 },
    { maxStates: 1_000_000 },
    { maxDepth: 1000 },
    { verifyCount: 17 },
    { viewports: ["desktop", "mobile", "mobile"] },
  ])("returns 400 for over-budget config %o", async (config) => {
    const res = await post({ targetUrl: "https://example.com/", goal: "x", config });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid config");
    expect(startExperiment).not.toHaveBeenCalled();
  });

  it("creates then schedules a background run — the response is the queued record", async () => {
    startExperiment.mockResolvedValueOnce({ experiment: { id: "exp_t" } as Experiment, created: true, via: "new" });
    scheduleRun.mockResolvedValueOnce({ id: "exp_t", status: "queued" } as Experiment);
    const res = await post({ targetUrl: "https://example.com/", goal: "x", config: { trajectories: 5000, maxStates: 50 } });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("queued");
    expect(startExperiment).toHaveBeenCalledWith(
      "https://example.com/",
      "x",
      expect.objectContaining({ trajectories: 1000, verifyCount: 8, maxStates: 50, viewports: ["desktop", "mobile"] }),
      { idempotencyKey: undefined },
    );
    expect(scheduleRun).toHaveBeenCalledWith("exp_t");
  });

  it("returns the existing record on a repeat Idempotency-Key without creating or scheduling", async () => {
    getByIdempotencyKey.mockResolvedValueOnce({ id: "exp_old" } as Experiment);
    startExperiment.mockClear();
    const res = await post(
      { targetUrl: "https://example.com/", goal: "x" },
      { "idempotency-key": "k-1" },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("exp_old");
    expect(data.dedupe).toBe("idempotency");
    expect(startExperiment).not.toHaveBeenCalled();
    expect(scheduleRun).not.toHaveBeenCalled();
  });

  it("returns the existing record on a site dedupe hit without creating or scheduling", async () => {
    findBySite.mockResolvedValueOnce({ id: "exp_site" } as Experiment);
    startExperiment.mockClear();
    const res = await post({ targetUrl: "https://example.com/" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("exp_site");
    expect(data.dedupe).toBe("site");
    expect(startExperiment).not.toHaveBeenCalled();
  });

  it("returns the inside-lock dedupe hit when a race slips past the pre-check", async () => {
    startExperiment.mockResolvedValueOnce({ experiment: { id: "exp_race" } as Experiment, created: false, via: "site" });
    const res = await post({ targetUrl: "https://example.com/" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dedupe).toBe("site");
    expect(scheduleRun).not.toHaveBeenCalled();
  });

  it("requires targetUrl only — goal is optional and forwarded undefined", async () => {
    startExperiment.mockClear();
    const res = await post({ goal: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("targetUrl is required");
    expect(startExperiment).not.toHaveBeenCalled();

    startExperiment.mockResolvedValueOnce({ experiment: { id: "exp_t" } as Experiment, created: true, via: "new" });
    scheduleRun.mockResolvedValueOnce({ id: "exp_t", status: "queued" } as Experiment);
    const res2 = await post({ targetUrl: "https://example.com/" });
    expect(res2.status).toBe(200);
    expect(startExperiment).toHaveBeenCalledWith("https://example.com/", undefined, expect.anything(), { idempotencyKey: undefined });
  });
});
