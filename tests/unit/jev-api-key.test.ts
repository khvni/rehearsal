import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpJevClient, selectJev } from "../../src/lib/decisions/jev";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Jev API key", () => {
  it("never sends OPENROUTER_API_KEY to the Jev endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ decisions: {} })));
    vi.stubGlobal("fetch", fetchMock);
    const jev = selectJev({ OPENROUTER_API_KEY: "or-secret" });
    await jev.decide({}, [{ name: "next", type: "choice", instructions: "pick", criteria: { a: "first", b: "second" } }]);
    const sent = fetchMock.mock.calls.map((c) => {
      const [url, init] = c as unknown as [string, RequestInit];
      return `${url} ${(init.headers as Record<string, string>).authorization}`;
    });
    expect(sent).toEqual([]);
    expect(jev.name).toBe("jev-fixture");
    expect(() => new HttpJevClient({ OPENROUTER_API_KEY: "or-secret" })).toThrow(/JEV_API_KEY/);
  });

  it("authorizes Jev calls with JEV_API_KEY only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ decisions: {} })));
    vi.stubGlobal("fetch", fetchMock);
    const jev = new HttpJevClient({ JEV_API_KEY: "jev-secret", OPENROUTER_API_KEY: "or-secret" });
    await jev.decide({}, [{ name: "next", type: "choice", instructions: "pick", criteria: { a: "first", b: "second" } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer jev-secret");
  });
});
