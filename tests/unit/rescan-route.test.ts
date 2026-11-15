import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn(async () => ({ id: "exp_a1b2c3d4" }));
const rescan = vi.fn(async () => ({
  experiment: { id: "exp_a1b2c3d4" },
  report: { changed: true, restarted: true },
}));
const scheduleRun = vi.fn();
vi.mock("@/lib/orchestrator", () => ({
  Orchestrator: class {
    get = get;
    rescan = rescan;
    scheduleRun = scheduleRun;
  },
  StageInProgressError: class extends Error {},
}));

const underRunLimit = vi.fn(async () => true);
vi.mock("@/lib/ratelimit", () => ({ underRunLimit }));
vi.mock("@/lib/access", () => ({ presentsAccessToken: () => false }));

const { POST } = await import("@/app/api/experiments/[id]/rescan/route");
const post = (body?: string) =>
  POST(new Request("http://localhost/api/experiments/exp_a1b2c3d4/rescan", { method: "POST", body }), {
    params: Promise.resolve({ id: "exp_a1b2c3d4" }),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/experiments/:id/rescan JSON body", () => {
  it.each(["{bad", "{", " "])("rejects malformed nonempty JSON %j without side effects", async (body) => {
    const response = await post(body);
    expect.soft(response.status).toBe(400);
    expect.soft(await response.json()).toEqual({ error: "invalid JSON" });
    expect.soft(get).not.toHaveBeenCalled();
    expect.soft(underRunLimit).not.toHaveBeenCalled();
    expect.soft(rescan).not.toHaveBeenCalled();
    expect.soft(scheduleRun).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "{}"])("preserves rescanning without a goal for body %j", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(202);
    expect(rescan).toHaveBeenCalledWith("exp_a1b2c3d4", { goal: undefined });
    expect(scheduleRun).toHaveBeenCalledWith("exp_a1b2c3d4", { skipDiscover: false, origin: "http://localhost" });
  });

  it("forwards a valid goal", async () => {
    const response = await post(JSON.stringify({ goal: "find pricing" }));
    expect(response.status).toBe(202);
    expect(rescan).toHaveBeenCalledWith("exp_a1b2c3d4", { goal: "find pricing" });
  });
});
