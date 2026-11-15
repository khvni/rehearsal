import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fetch/guards", () => ({ assertPublicUrl: vi.fn(async (u: string) => new URL(u)) }));
const cfEnv: Record<string, unknown> = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: cfEnv, ctx: {} }) }));

import { assertPublicUrl } from "@/lib/fetch/guards";
import { continueRun } from "@/lib/jobs";

const workersUA = { userAgent: "Cloudflare-Workers" };
const hop = (u: string) => `${u}/api/internal/run-step`;

/** Run-step hops must never follow the request Host — the pin or the run's stored origin decides. */
describe("continueRun hop targeting on Workers", () => {
  const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

  beforeEach(() => {
    vi.stubGlobal("navigator", workersUA);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    vi.mocked(assertPublicUrl).mockClear();
    delete process.env.REHEARSAL_ORIGIN;
    delete cfEnv.WORKER_SELF_REFERENCE;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pins the hop to REHEARSAL_ORIGIN even when the run arrived through an alias", async () => {
    process.env.REHEARSAL_ORIGIN = "https://rehearsal.example.com";
    await continueRun("exp_x", { origin: "https://alias.example.com", token: "t" });
    expect(fetchMock).toHaveBeenCalledWith(hop("https://rehearsal.example.com"), expect.objectContaining({ method: "POST" }));
  });

  it("targets the given (stored) origin and SSRF-guards it — the request Host is never consulted", async () => {
    await continueRun("exp_x", { origin: "https://rehearsal.example.com", token: "t" });
    expect(vi.mocked(assertPublicUrl)).toHaveBeenCalledWith(hop("https://rehearsal.example.com"));
    expect(fetchMock).toHaveBeenCalledWith(hop("https://rehearsal.example.com"), expect.anything());
  });

  it("exempts loopback self-hops from the SSRF guard so local workerd dev continues", async () => {
    await continueRun("exp_x", { origin: "http://localhost:8787", token: "t" });
    expect(vi.mocked(assertPublicUrl)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(hop("http://localhost:8787"), expect.anything());
  });

  it("does nothing off-Workers or without any hop origin", async () => {
    vi.stubGlobal("navigator", { userAgent: "Node.js" });
    await continueRun("exp_x", { origin: "http://localhost:8787", token: "t" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", workersUA);
    await continueRun("exp_x", { token: "t" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hops through the WORKER_SELF_REFERENCE binding when deployed — fetch() to its own Custom Domain never arrives", async () => {
    const selfFetch = vi.fn(async () => new Response("", { status: 202 }));
    cfEnv.WORKER_SELF_REFERENCE = { fetch: selfFetch };
    await continueRun("exp_x", { origin: "https://rehearsal.example.com", token: "t" });
    expect(selfFetch).toHaveBeenCalledWith(
      hop("https://rehearsal.example.com"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "exp_x", token: "t" }) }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
