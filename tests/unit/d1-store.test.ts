import { beforeEach, describe, expect, it, vi } from "vitest";
import { Experiment } from "../../src/lib/contracts";

/** Records every statement a D1 binding prepares; `failDdl` makes the next CREATE TABLE throw. */
function recordingD1() {
  const statements: string[] = [];
  let failDdl = false;
  const binding = {
    statements,
    failNextDdl() {
      failDdl = true;
    },
    prepare(sql: string) {
      const isDdl = sql.startsWith("CREATE TABLE");
      const stmt = {
        bind: () => stmt,
        async run() {
          statements.push(sql);
          if (isDdl && failDdl) {
            failDdl = false;
            throw new Error("D1_ERROR: transient");
          }
          return {};
        },
        async all() {
          statements.push(sql);
          return { results: [] };
        },
        async first() {
          statements.push(sql);
          return null;
        },
      };
      return stmt;
    },
  };
  return binding;
}

const env: { DB?: ReturnType<typeof recordingD1> } = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env, ctx: {} }) }));

const { D1Store } = await import("../../src/lib/storage");

const ddl = (db: ReturnType<typeof recordingD1>) => db.statements.filter((s) => s.startsWith("CREATE TABLE")).length;
const event = { ts: new Date(0).toISOString(), stage: "run", kind: "info" as const, message: "m" };
const experiment = Experiment.parse({
  id: "exp_1234abcd", targetUrl: "https://example.com/", goal: "g", status: "created",
  createdAt: new Date(0).toISOString(), configuration: {},
});

describe("D1Store schema setup", () => {
  beforeEach(() => {
    env.DB = recordingD1();
  });

  it("creates all tables once per binding, not before every op", async () => {
    const db = env.DB!;
    const store = new D1Store();
    await store.save(experiment);
    await store.appendActivity(experiment.id, event);
    await store.get(experiment.id);
    await new D1Store().activity(experiment.id);
    expect(ddl(db)).toBe(3);
    expect(db.statements).toHaveLength(3 + 5);
  });

  it("retries the setup after a failed attempt", async () => {
    const db = env.DB!;
    const store = new D1Store();
    db.failNextDdl();
    await expect(store.get(experiment.id)).rejects.toThrow(/transient/);
    await store.get(experiment.id);
    await store.get(experiment.id);
    expect(ddl(db)).toBe(1 + 3);
  });

  it("sets up each new binding on first use", async () => {
    const store = new D1Store();
    await store.get(experiment.id);
    const next = recordingD1();
    env.DB = next;
    await store.get(experiment.id);
    expect(ddl(next)).toBe(3);
  });
});
