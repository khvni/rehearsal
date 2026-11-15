import { beforeEach, describe, expect, it, vi } from "vitest";
import { Experiment } from "@/lib/contracts";

const get = vi.fn();
const resume = vi.fn(async () => undefined);
vi.mock("@/lib/orchestrator", () => ({
  Orchestrator: class {
    get = get;
    resume = resume;
  },
}));
vi.mock("@/lib/jobs", () => ({ runInBackground: async (work: () => Promise<void>) => work() }));

const { GET } = await import("@/app/api/experiments/[id]/route");
const experiment = Experiment.parse({
  id: "exp_12345678", targetUrl: "https://example.com/", goal: "find pricing",
  status: "simulating", createdAt: "2026-11-15T00:00:00.000Z", configuration: {},
});
const poll = (etag?: string, id = experiment.id) => GET(
  new Request(`http://localhost/api/experiments/${id}`, { headers: etag ? { "If-None-Match": etag } : {} }),
  { params: Promise.resolve({ id }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(structuredClone(experiment));
});

describe("conditional experiment polling", () => {
  it("returns the full record and a validator on the first poll", async () => {
    const res = await poll();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(experiment);
    expect(res.headers.get("etag")).toMatch(/^W\/"[a-f0-9]{64}"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("returns no body for an unchanged poll and still runs the resume watchdog", async () => {
    const first = await poll();
    resume.mockClear();
    const res = await poll(first.headers.get("etag")!);
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(resume).toHaveBeenCalledWith(experiment.id, { origin: "http://localhost", inline: true });
  });

  it("sends updated artifacts even when the status and creation time are unchanged", async () => {
    const first = await poll();
    const updated = { ...experiment, errors: ["new evidence"] };
    get.mockResolvedValue(updated);
    const res = await poll(first.headers.get("etag")!);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(res.headers.get("etag")).not.toBe(first.headers.get("etag"));
  });

  it("accepts strong validators, validator lists, and the wildcard", async () => {
    const first = await poll();
    const strong = first.headers.get("etag")!.replace(/^W\//, "");
    for (const value of [strong, `"old", ${strong}`, "*"]) {
      expect((await poll(value)).status).toBe(304);
    }
    expect((await poll('W/"old"')).status).toBe(200);
  });

  it("keeps watchdog failures from breaking a conditional poll", async () => {
    const first = await poll();
    resume.mockRejectedValueOnce(new Error("watchdog failed"));
    expect((await poll(first.headers.get("etag")!)).status).toBe(304);
  });

  it("returns 404 before considering validators for invalid or missing records", async () => {
    expect((await poll("*", "invalid")).status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValue(null);
    expect((await poll("*")).status).toBe(404);
    expect(resume).not.toHaveBeenCalled();
  });
});
