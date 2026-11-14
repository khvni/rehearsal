import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SpecReport, type Experiment } from "@/lib/contracts";
import { specToMarkdown } from "@/lib/analysis/spec";
import { BENCH_SEED, loadManifests, loadSite, serveSite } from "./bench/sites";
import { FixtureSiteRunner } from "./bench/runner";
import { runBenchSite, type BenchRun } from "./bench/pipeline";

// Rebuild-quality evals. Today: the SpecReport the bench harness emits is well-formed and
// renders the rebuild sections. Future rebuild-fidelity evals are listed as todos below.

const uuid = vi.hoisted(() => ({ n: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () =>
    `${String(++uuid.n).padStart(8, "0")}-0000-4000-8000-000000000000` as const;
  return { ...actual, default: { ...actual, randomUUID }, randomUUID };
});

const SITE_ID = "aie-code-2026";

// Duplicated from bench.eval.ts on purpose: eval files don't import each other.
async function runSite(id: string): Promise<BenchRun> {
  uuid.n = 0;
  const manifest = loadManifests().find((m) => m.id === id);
  if (!manifest) throw new Error(`no manifest for ${id}`);
  const site = loadSite(manifest);
  const served = await serveSite(site);
  const runner = new FixtureSiteRunner(site);
  try {
    return await runBenchSite(site, runner, { seed: BENCH_SEED, targetUrl: served.targetUrl });
  } finally {
    await runner.close();
    await served.close();
  }
}

const allowPrivate = process.env.REHEARSAL_ALLOW_PRIVATE;
afterAll(() => {
  if (allowPrivate === undefined) delete process.env.REHEARSAL_ALLOW_PRIVATE;
  else process.env.REHEARSAL_ALLOW_PRIVATE = allowPrivate;
});

describe(`rebuild: spec report (${SITE_ID})`, () => {
  let run: BenchRun;
  let spec: SpecReport;
  beforeAll(async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // fixture sites bind 127.0.0.1
    run = await runSite(SITE_ID);
    spec = (run.experiment as Experiment).spec!;
  }, 120_000);

  it("satisfies the SpecReport contract", () => {
    expect(spec).toBeDefined();
    expect(() => SpecReport.parse(spec)).not.toThrow();
  });

  it("has at least one change and one rebuild phase", () => {
    expect(spec.changes.length).toBeGreaterThan(0);
    expect(spec.rebuildPhases.length).toBeGreaterThan(0);
  });

  it("every change carries a title, a change, and a rationale", () => {
    for (const c of spec.changes) {
      expect(c.title.trim(), `rank ${c.rank}`).not.toBe("");
      expect(c.change.trim(), `rank ${c.rank}: ${c.title}`).not.toBe("");
      expect(c.rationale.trim(), `rank ${c.rank}: ${c.title}`).not.toBe("");
    }
  });

  it("markdown renders the changes-by-impact and rebuild-plan sections", () => {
    const md = specToMarkdown(spec);
    expect(md).toContain("## Changes (by impact)");
    expect(md).toContain("## Rebuild plan");
    expect(run.specMarkdown).toBe(md);
  });
});

describe("rebuild fidelity", () => {
  it.todo("variant patch changes measured metrics (compare stage, hermetic chromium)");
  it.todo("rebuild spec item coverage vs golden rebuild");
  it.todo("every rebuild phase item traces back to a spec change");
  it.todo("applying the spec's DomPatches resolves the findings they cite on re-run");
});

describe.todo("rebuild diff vs golden rebuilt HTML");
