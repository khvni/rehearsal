import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hasAccess, withRunSlot } from "@/lib/access";
import { proxy } from "@/proxy";

const TOKEN = "fixture-token-0123456789";
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

afterEach(() => {
  delete process.env.REHEARSAL_ACCESS_TOKEN;
  delete process.env.REHEARSAL_MAX_CONCURRENT_RUNS;
});

describe("shared-secret gate", () => {
  it("accepts the token as Bearer or as the Basic password, nothing else", () => {
    expect(hasAccess(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(hasAccess(basic("anyone", TOKEN), TOKEN)).toBe(true);
    expect(hasAccess(null, TOKEN)).toBe(false);
    expect(hasAccess("Bearer wrong", TOKEN)).toBe(false);
    expect(hasAccess(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(hasAccess(basic(TOKEN, "wrong"), TOKEN)).toBe(false);
    expect(hasAccess("Basic !!!", TOKEN)).toBe(false);
    const unicode = "pässwörd-🔑-0123456789";
    const utf8Basic = `Basic ${Buffer.from(`me:${unicode}`, "utf8").toString("base64")}`;
    expect(hasAccess(utf8Basic, unicode)).toBe(true);
  });

  it("returns 401 on every gated route without credentials once REHEARSAL_ACCESS_TOKEN is set", () => {
    const urls = ["/", "/experiments/x", "/api/experiments", "/api/experiments/x", "/api/experiments/x/run"];
    for (const u of urls) expect(proxy(new NextRequest(`http://app.test${u}`)).status).toBe(200);
    process.env.REHEARSAL_ACCESS_TOKEN = TOKEN;
    for (const u of urls) {
      const res = proxy(new NextRequest(`http://app.test${u}`, { method: "POST" }));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Basic /);
      const ok = proxy(new NextRequest(`http://app.test${u}`, { headers: { authorization: `Bearer ${TOKEN}` } }));
      expect(ok.status).toBe(200);
    }
  });
});

describe("pipeline concurrency cap", () => {
  it("rejects runs past REHEARSAL_MAX_CONCURRENT_RUNS and frees the slot afterwards", async () => {
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "2";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = withRunSlot(() => gate.then(() => "a"));
    const b = withRunSlot(() => gate.then(() => "b"));
    expect(await withRunSlot(async () => "c")).toEqual({ busy: true });
    release();
    expect(await Promise.all([a, b])).toEqual([
      { busy: false, value: "a" },
      { busy: false, value: "b" },
    ]);
    await expect(withRunSlot(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await withRunSlot(async () => "d")).toEqual({ busy: false, value: "d" });
  });
});
