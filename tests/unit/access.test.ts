import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasAccess, withRunSlot } from "@/lib/access";
import { proxy } from "@/proxy";
import { MemoryRunLeaseStore } from "@/lib/storage";

const TOKEN = "fixture-token-0123456789";
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

afterEach(() => {
  vi.useRealTimers();
  delete process.env.REHEARSAL_ACCESS_TOKEN;
  delete process.env.REHEARSAL_MAX_CONCURRENT_RUNS;
  delete process.env.REHEARSAL_RUN_SLOT_TTL_MS;
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
  it("runs eight builds concurrently across admission contexts and rejects the ninth", async () => {
    const leases = new MemoryRunLeaseStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started: number[] = [];
    const runs = Array.from({ length: 8 }, (_, i) => withRunSlot(async () => {
      started.push(i);
      await gate;
    }, 0, () => 0, leases));
    await expect(withRunSlot(async () => undefined, 0, () => 0, leases)).resolves.toEqual({ busy: true });
    expect(started).toHaveLength(8);
    release();
    expect((await Promise.all(runs)).every((run) => !run.busy)).toBe(true);
    await expect(withRunSlot(async () => "free", 0, () => 0, leases)).resolves.toEqual({ busy: false, value: "free" });
  });

  it("propagates admission errors instead of running work", async () => {
    const leases = new MemoryRunLeaseStore();
    vi.spyOn(leases, "acquireSlot").mockRejectedValue(new Error("database unavailable"));
    const work = vi.fn();
    await expect(withRunSlot(work, 0, () => 0, leases)).rejects.toThrow("database unavailable");
    expect(work).not.toHaveBeenCalled();
  });
  it("expires a never-released lease using an injected clock without freeing a newer lease", async () => {
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "1";
    process.env.REHEARSAL_RUN_SLOT_TTL_MS = "1000";
    let time = 0;
    const now = () => time;
    let oldRelease!: () => void;
    const old = withRunSlot(() => new Promise<void>((r) => { oldRelease = r; }), 0, now);
    time = 999;
    expect(await withRunSlot(async () => "blocked", 0, now)).toEqual({ busy: true });
    time = 1000;
    let newRelease!: () => void;
    const next = withRunSlot(() => new Promise<void>((r) => { newRelease = r; }), 0, now);
    oldRelease();
    await old;
    expect(await withRunSlot(async () => "still blocked", 0, now)).toEqual({ busy: true });
    newRelease();
    await next;
    expect(await withRunSlot(async () => "free", 0, now)).toEqual({ busy: false, value: "free" });
  });
  it("waits for capacity, propagates errors and releases the acquired slot", async () => {
    vi.useFakeTimers();
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "1";
    let release!: () => void;
    const held = withRunSlot(() => new Promise<void>((r) => { release = r; }));
    const work = vi.fn(async () => "queued");
    const queued = withRunSlot(work, 20_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(work).not.toHaveBeenCalled();
    release();
    await held;
    await vi.advanceTimersByTimeAsync(250);
    expect(await queued).toEqual({ busy: false, value: "queued" });
    await expect(withRunSlot(async () => { throw new Error("queued failure"); }, 20_000)).rejects.toThrow("queued failure");
    expect(await withRunSlot(async () => "free")).toEqual({ busy: false, value: "free" });
  });

  it("returns busy after the bounded wait without invoking work", async () => {
    vi.useFakeTimers();
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "1";
    let release!: () => void;
    const held = withRunSlot(() => new Promise<void>((r) => { release = r; }));
    const work = vi.fn(async () => undefined);
    const queued = withRunSlot(work, 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await queued).toEqual({ busy: true });
    expect(work).not.toHaveBeenCalled();
    release();
    await held;
  });
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
