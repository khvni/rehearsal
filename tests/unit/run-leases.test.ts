import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1RunLeaseStore, MemoryRunLeaseStore } from "@/lib/storage";

const env: { DB?: ReturnType<typeof binding> } = {};

function binding(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const query = db.prepare(sql);
      let values: SQLInputValue[] = [];
      const stmt = {
        bind(...args: SQLInputValue[]) { values = args; return stmt; },
        async run() { return query.run(...values); },
        async first() { return query.get(...values) ?? null; },
      };
      return stmt;
    },
  };
}

describe("D1 run leases", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    env.DB = binding(db);
    Reflect.set(globalThis, Symbol.for("__cloudflare-context__"), { env });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, Symbol.for("__cloudflare-context__"));
    db.close();
  });

  it("atomically caps concurrent clients and reclaims expired slots", async () => {
    const a = new D1RunLeaseStore();
    const b = new D1RunLeaseStore();
    const claims = await Promise.all(Array.from({ length: 9 }, (_, i) =>
      (i % 2 ? a : b).acquireSlot(`holder-${i}`, 8, 100, 0)));
    expect(claims.filter(Boolean)).toHaveLength(8);
    expect(await b.acquireSlot("blocked", 8, 100, 99)).toBe(false);
    expect(await b.acquireSlot("replacement", 1, 100, 100)).toBe(true);
    await a.release("holder-0");
    expect(await a.acquireSlot("still-blocked", 1, 100, 100)).toBe(false);
    await b.release("replacement");
    expect(await a.acquireSlot("free", 1, 100, 100)).toBe(true);
  });

  it("locks across clients, reports stages and fences stale releases", async () => {
    const a = new D1RunLeaseStore();
    const b = new D1RunLeaseStore();
    expect(await a.activeLock("exp_a", 0)).toBeNull();
    const claims = await Promise.all([
      a.acquireLock("exp_a", "first", "discover", 100, 0),
      b.acquireLock("exp_a", "second", "rebuild", 100, 0),
    ]);
    expect(claims).toEqual([true, false]);
    expect(await b.activeLock("exp_a", 99)).toEqual({ stage: "discover" });
    expect(await b.acquireLock("exp_a", "second", "rebuild", 100, 100)).toBe(true);
    await a.release("first");
    expect(await a.activeLock("exp_a", 100)).toEqual({ stage: "rebuild" });
    expect(await a.activeLock("exp_a", 200)).toBeNull();
  });

  it("surfaces D1 failures without granting a lease", async () => {
    vi.spyOn(env.DB!, "prepare").mockImplementation(() => { throw new Error("D1 unavailable"); });
    await expect(new D1RunLeaseStore().acquireSlot("holder", 8, 100, 0)).rejects.toThrow("D1 unavailable");
  });

  it.each(["d1", "memory"])("renews %s leases and expires them once renewal stops", async (backend) => {
    const leases = backend === "d1" ? new D1RunLeaseStore() : new MemoryRunLeaseStore();
    await leases.renew("missing", 100, 0);
    expect(await leases.activeLock("exp_a", 0)).toBeNull();
    expect(await leases.acquireSlot("slot-holder", 1, 100, 0)).toBe(true);
    expect(await leases.acquireLock("exp_a", "lock-holder", "rebuild", 100, 0)).toBe(true);
    for (const now of [30, 60, 90, 120]) {
      await leases.renew("slot-holder", 100, now);
      await leases.renew("lock-holder", 100, now);
    }
    expect(await leases.acquireSlot("blocked", 1, 100, 219)).toBe(false);
    expect(await leases.activeLock("exp_a", 219)).toEqual({ stage: "rebuild" });
    expect(await leases.acquireSlot("replacement", 1, 100, 220)).toBe(true);
    expect(await leases.activeLock("exp_a", 220)).toBeNull();
    expect(await leases.acquireLock("exp_a", "replacement", "discover", 100, 220)).toBe(true);
    await leases.renew("lock-holder", 100, 300);
    expect(await leases.activeLock("exp_a", 320)).toBeNull();
  });
});
