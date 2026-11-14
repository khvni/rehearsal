import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Experiment, isExperimentId } from "../../src/lib/contracts";
import { JsonFileStore } from "../../src/lib/storage";

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
});
