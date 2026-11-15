import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment } from "@/lib/contracts";

const routeGet = vi.fn();
const routeRunStep = vi.fn();
const routeMarkFailed = vi.fn(async () => undefined);
vi.mock("@/lib/orchestrator", () => ({
  Orchestrator: class {
    get = routeGet;
    runStep = routeRunStep;
    markFailed = routeMarkFailed;
  },
  StageInProgressError: class extends Error {},
}));
const { POST: runStepPost } = await import("@/app/api/internal/run-step/route");


describe("POST /api/internal/run-step", () => {
  const post = (body: unknown, headers?: Record<string, string>) =>
    runStepPost(new Request("http://localhost/api/internal/run-step", { method: "POST", body: JSON.stringify(body), headers }));
  const expWithToken = () => ({ id: "exp_a1b2c3d4", status: "discovering", runToken: "tok-1" }) as Experiment;
  const get = routeGet;
  const runStep = routeRunStep;

  beforeEach(() => vi.clearAllMocks());

  it("400s on a malformed id and 404s on an unknown one", async () => {
    expect((await post({ id: "nope" })).status).toBe(400);
    get.mockResolvedValueOnce(null);
    expect((await post({ id: "exp_a1b2c3d4", token: "tok-1" })).status).toBe(404);
  });

  it("401s without the run token (or the shared secret)", async () => {
    get.mockResolvedValue(expWithToken());
    expect((await post({ id: "exp_a1b2c3d4", token: "wrong" })).status).toBe(401);
    expect((await post({ id: "exp_a1b2c3d4" })).status).toBe(401);
  });

  it("202s on the per-run token and on the bearer secret, and kicks a step", async () => {
    process.env.REHEARSAL_RUN_SECRET = "s3cr3t";
    try {
      get.mockResolvedValue(expWithToken());
      const viaToken = await post({ id: "exp_a1b2c3d4", token: "tok-1" });
      expect(viaToken.status).toBe(202);
      get.mockResolvedValue(expWithToken());
      const viaBearer = await post({ id: "exp_a1b2c3d4" }, { authorization: "Bearer s3cr3t" });
      expect(viaBearer.status).toBe(202);
      await new Promise((r) => setTimeout(r, 20));
      expect(runStep).toHaveBeenCalledWith("exp_a1b2c3d4", expect.objectContaining({ origin: "http://localhost" }));
    } finally {
      delete process.env.REHEARSAL_RUN_SECRET;
    }
  });
});
