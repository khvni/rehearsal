import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Experiment, isExperimentId } from "../../src/lib/contracts";
import { JsonFileStore, selectStore } from "../../src/lib/storage";

const experiment = (id: string) =>
  Experiment.parse({
    id, targetUrl: "https://example.com/", goal: "g", status: "created",
    createdAt: new Date(0).toISOString(), configuration: {},
  });

describe("experiment ids", () => {
  it("accept only the generated exp_ + 8 hex format", () => {
    expect(isExperimentId("exp_1234abcd")).toBe(true);
    for (const bad of ["../x", "exp_1234abcd/../../x", "exp_1234ABCD", "exp_123", "..%2Fpackage", "", undefined]) {
      expect(isExperimentId(bad)).toBe(false);
    }
  });
});

describe("selectStore", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["", "   "])("uses DATABASE_URL when TIGERDATA_URL is blank (%j)", (blank) => {
    vi.stubEnv("TIGERDATA_URL", blank);
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/database");

    expect(selectStore().name).toBe("tigerdata");
  });

  it.each(["", "   "])("uses JSON when both database URLs are blank (%j)", (blank) => {
    vi.stubEnv("TIGERDATA_URL", blank);
    vi.stubEnv("DATABASE_URL", blank);

    expect(selectStore().name).toBe("json-file");
  });

  it("prefers TIGERDATA_URL over DATABASE_URL and trims it", () => {
    vi.stubEnv("TIGERDATA_URL", "  postgres://example.invalid/tigerdata  ");
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/database");

    const store = selectStore();
    expect(store.name).toBe("tigerdata");
    expect(store).toHaveProperty("url", "postgres://example.invalid/tigerdata");
  });
});

describe("JsonFileStore", () => {
  const root = mkdtempSync(path.join(tmpdir(), "rehearsal-store-"));
  const dir = path.join(root, "experiments");
  mkdirSync(dir);
  writeFileSync(path.join(root, "x.json"), JSON.stringify(experiment("exp_00000000")));
  const store = new JsonFileStore(dir);

  it("returns null for traversal ids even when the target file exists", async () => {
    expect(await store.get("../x")).toBeNull();
    expect(await store.get("..%2Fx")).toBeNull();
  });

  it("refuses to save an experiment with an invalid id", async () => {
    await expect(store.save(experiment("../escape"))).rejects.toThrow(/invalid experiment id/);
  });

  it("round-trips a valid experiment", async () => {
    await store.save(experiment("exp_1234abcd"));
    expect((await store.get("exp_1234abcd"))?.id).toBe("exp_1234abcd");
  });

  it("still reads and lists legacy experiments with empty viewports", async () => {
    const legacy = { ...experiment("exp_00000001"), configuration: { viewports: [] } };
    writeFileSync(path.join(dir, `${legacy.id}.json`), JSON.stringify(legacy));

    expect((await store.get(legacy.id))?.configuration.viewports).toEqual([]);
    expect(await store.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: legacy.id, configuration: expect.objectContaining({ viewports: [] }) }),
    ]));
  });
});
