import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({
  promises: {
    // Every host resolves to a public IP — the SSRF guard is exercised in site-hardening.test.ts.
    lookup: vi.fn(async (_host: string, opts?: { all?: boolean }) =>
      opts?.all ? [{ address: "93.184.216.34", family: 4 }] : { address: "93.184.216.34", family: 4 },
    ),
  },
}));

const cfEnv: Record<string, unknown> = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: cfEnv, ctx: {} }) }));

import { fetchPublic, noteSelfOrigin, requestOrigin } from "@/lib/fetch/guards";

/** A Worker's fetch() to one of its own Custom Domains never reaches it (the edge answers
 *  with a generated text/plain stub) — self-origin fetches go through WORKER_SELF_REFERENCE. */
describe("fetchPublic self-origin routing on Workers", () => {
  const fetchMock = vi.fn(async () => new Response("<html>edge</html>", { status: 200, headers: { "content-type": "text/html" } }));
  const selfFetch = vi.fn(async () => new Response("<html>self</html>", { status: 200, headers: { "content-type": "text/html" } }));

  beforeEach(() => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selfFetch.mockClear();
    cfEnv.WORKER_SELF_REFERENCE = { fetch: selfFetch };
    delete process.env.REHEARSAL_ORIGIN;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete cfEnv.WORKER_SELF_REFERENCE;
    delete process.env.REHEARSAL_ORIGIN;
  });

  it("routes a recorded self origin through the service binding instead of fetch()", async () => {
    noteSelfOrigin("https://rehearsal.example.com");
    const res = await fetchPublic("https://rehearsal.example.com/");
    expect(selfFetch).toHaveBeenCalledWith("https://rehearsal.example.com/", expect.objectContaining({ redirect: "manual" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(res.text()).resolves.toContain("self");
  });

  it("records the request origin via requestOrigin", async () => {
    requestOrigin(new Request("https://site.example.com/api/experiments"));
    await fetchPublic("https://site.example.com/");
    expect(selfFetch).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats REHEARSAL_ORIGIN as a self origin without a recorded request", async () => {
    process.env.REHEARSAL_ORIGIN = "https://pinned.example.com";
    await fetchPublic("https://pinned.example.com/");
    expect(selfFetch).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses plain fetch() for other origins — the binding always lands on this Worker", async () => {
    noteSelfOrigin("https://rehearsal.example.com");
    await fetchPublic("https://other.example.org/");
    expect(fetchMock).toHaveBeenCalled();
    expect(selfFetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch() when the binding is not bound (local workerd)", async () => {
    delete cfEnv.WORKER_SELF_REFERENCE;
    noteSelfOrigin("https://rehearsal.example.com");
    await fetchPublic("https://rehearsal.example.com/");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does not route self origins through the binding off-Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Node.js" });
    noteSelfOrigin("https://rehearsal.example.com");
    await fetchPublic("https://rehearsal.example.com/");
    expect(fetchMock).toHaveBeenCalled();
    expect(selfFetch).not.toHaveBeenCalled();
  });
});
