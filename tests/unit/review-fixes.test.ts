import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/browser/extract";
import { FallbackJevClient } from "@/lib/decisions/jev";
import { JsonFileStore } from "@/lib/storage";
import type { JevClient } from "@/lib/contracts";

describe("isSameOrigin", () => {
  it("rejects look-alike hosts a prefix test would accept", () => {
    expect(isSameOrigin("https://a.com/x", "https://a.com")).toBe(true);
    expect(isSameOrigin("https://a.com.evil.com/x", "https://a.com")).toBe(false);
    expect(isSameOrigin("https://a.company/x", "https://a.com")).toBe(false);
    expect(isSameOrigin(undefined, "https://a.com")).toBe(false);
    expect(isSameOrigin("not a url", "https://a.com")).toBe(false);
  });
});

describe("FallbackJevClient", () => {
  it("falls back to fixture decisions when the live client throws", async () => {
    const broken: JevClient = {
      name: "http",
      decide: async () => {
        throw new Error("Jev HTTP 401");
      },
    };
    const client = new FallbackJevClient(broken);
    const out = await client.decide({ goal: "pricing" }, [
      { type: "choice", name: "next", instructions: "pick the next action", criteria: { a1: "Pricing", a2: "Blog" } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].question).toBe("next");
  });
});

describe("JsonFileStore.get", () => {
  it("never resolves ids outside the experiments dir", async () => {
    const store = new JsonFileStore();
    expect(await store.get("../../package")).toBeNull();
    expect(await store.get("exp_missing")).toBeNull();
  });
});
