import { describe, expect, it, vi } from "vitest";

const createExperiment = vi.fn();
vi.mock("@/lib/orchestrator", () => ({
  Orchestrator: class {
    createExperiment = createExperiment;
  },
}));

vi.mock("@/lib/ratelimit", () => ({ clientIp: () => "test", underDailyLimit: async () => true }));

const { POST } = await import("@/app/api/experiments/route");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/experiments", { method: "POST", body: JSON.stringify(body) }));

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
    expect(createExperiment).not.toHaveBeenCalled();
  });

  it("passes a parsed in-bounds config to the orchestrator, capped to the demo limits", async () => {
    createExperiment.mockResolvedValueOnce({ id: "exp_t" });
    const res = await post({ targetUrl: "https://example.com/", goal: "x", config: { trajectories: 5000, maxStates: 50 } });
    expect(res.status).toBe(200);
    expect(createExperiment).toHaveBeenCalledWith(
      "https://example.com/",
      "x",
      expect.objectContaining({ trajectories: 1000, verifyCount: 8, maxStates: 50, viewports: ["desktop", "mobile"] }),
    );
  });
});
