import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BenchSiteReport,
  Experiment,
  Finding,
  FixtureSiteManifest,
  type BenchSiteReport as BenchSiteReportT,
  type ExpectedFinding,
} from "@/lib/contracts";
import { BENCH_SEED, FIXTURES_DIR, loadManifests, loadSite, serveSite } from "./bench/sites";
import { FixtureSiteRunner } from "./bench/runner";
import { runBenchSite, stripTiming, type BenchRun } from "./bench/pipeline";
import { producedFindings, ruleKey, scoreSite } from "./bench/score";

// stateIds/actionIds/experiment ids come from randomUUID and FixtureJevClient's tiebreak
// jitter is keyed by actionId — counter ids (reset per run) keep runs bit-for-bit identical.
// The counter sits in the first 8 hex chars: ids are minted as `st_${randomUUID().slice(0, 8)}`.
const uuid = vi.hoisted(() => ({ n: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () =>
    `${String(++uuid.n).padStart(8, "0")}-0000-4000-8000-000000000000` as const;
  return { ...actual, default: { ...actual, randomUUID }, randomUUID };
});

const RUN_TIMEOUT_MS = 120_000;
const SITE_ID = "aie-code-2026";
const STAGES = ["discover", "simulate", "verify", "analyze", "compare", "spec", "total"];

async function runSite(id: string): Promise<{ run: BenchRun; report: BenchSiteReportT }> {
  uuid.n = 0;
  const manifest = loadManifests().find((m) => m.id === id);
  if (!manifest) throw new Error(`no manifest for ${id}`);
  const site = loadSite(manifest);
  const served = await serveSite(site);
  const runner = new FixtureSiteRunner(site);
  try {
    const run = await runBenchSite(site, runner, { seed: BENCH_SEED, targetUrl: served.targetUrl });
    return { run, report: scoreSite(manifest, run, runner.name) };
  } finally {
    await runner.close();
    await served.close();
  }
}

const allowPrivate = process.env.REHEARSAL_ALLOW_PRIVATE;
beforeAll(() => {
  process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // fixture sites bind 127.0.0.1
});
afterAll(() => {
  if (allowPrivate === undefined) delete process.env.REHEARSAL_ALLOW_PRIVATE;
  else process.env.REHEARSAL_ALLOW_PRIVATE = allowPrivate;
});

describe("bench: manifest contract", () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".manifest.json")).sort();
  const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

  it("at least one fixture site manifest exists", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses, is named after its id, and maps real page files", (file) => {
    const manifest = FixtureSiteManifest.parse(
      JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8")),
    );
    expect(file).toBe(`${manifest.id}.manifest.json`);
    const pagePaths = Object.keys(manifest.pages);
    expect(pagePaths.length).toBeGreaterThan(0);
    for (const rel of Object.values(manifest.pages)) {
      expect(existsSync(path.join(FIXTURES_DIR, rel)), `${manifest.id}: ${rel}`).toBe(true);
    }
    expect(pagePaths.map(norm)).toContain(norm(manifest.mountPath));
  });

  it("site ids are unique", () => {
    const ids = loadManifests().map((m) => m.id);
    expect(ids.length).toBe(files.length);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe(`bench: end-to-end (${SITE_ID}, fixture runner)`, () => {
  let run: BenchRun;
  let report: BenchSiteReportT;
  beforeAll(async () => {
    ({ run, report } = await runSite(SITE_ID));
  }, RUN_TIMEOUT_MS);

  it("report satisfies the BenchSiteReport contract", () => {
    expect(() => BenchSiteReport.parse(report)).not.toThrow();
    expect(report.siteId).toBe(SITE_ID);
    expect(report.runner).toBe("fixture-site");
    expect(report.seed).toBe(BENCH_SEED);
  });

  it("produces every expected finding (recall 1) and every expected spec item (coverage 1)", () => {
    expect(report.findings.missing).toEqual([]);
    expect(report.findings.recall).toBe(1);
    expect(report.spec.coverage).toBe(1);
  });

  it("meets every manifest expectation", () => {
    expect(report.expectationFailures).toEqual([]);
  });

  it("mints distinct state ids (seeded ids must not collide)", () => {
    const ids = (run.experiment.graph?.states ?? []).map((s) => s.stateId);
    expect(ids.length).toBe(report.discover.states);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("times all six stages plus total", () => {
    for (const stage of STAGES) {
      expect(report.durationsMs[stage], stage).toBeTypeOf("number");
      expect(Number.isFinite(report.durationsMs[stage])).toBe(true);
      expect(report.durationsMs[stage]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("bench: determinism", () => {
  it(
    "two runs of the same site score identically once timing is stripped",
    async () => {
      const a = await runSite(SITE_ID);
      const b = await runSite(SITE_ID);
      expect(a.run.experiment.id).toMatch(/^exp_\d{8}$/);
      expect(b.run.experiment.id).toBe(a.run.experiment.id);
      expect(a.report.simulate.trajectories).toBeGreaterThan(0);
      expect(a.report.findings.produced.length).toBeGreaterThan(0);
      expect(stripTiming(b.report)).toEqual(stripTiming(a.report));
    },
    RUN_TIMEOUT_MS * 2,
  );
});

// ── scoring units (synthetic runs — no pipeline) ───────────────────────────

let findingSeq = 0;
function finding(title: string, over: Partial<Finding> = {}): Finding {
  return Finding.parse({
    findingId: `f-${++findingSeq}`,
    title,
    category: "clarity",
    severity: "medium",
    evidenceType: "hypothesis",
    description: title,
    affectedStates: [],
    recommendation: "fix it",
    verificationStatus: "unverified",
    krugPrinciple: "dont-make-me-think",
    ...over,
  });
}

function manifestWith(over: {
  expected?: ExpectedFinding[];
  tolerated?: ExpectedFinding[];
  unexpected?: ExpectedFinding[];
}): FixtureSiteManifest {
  return FixtureSiteManifest.parse({
    id: "synthetic",
    name: "Synthetic",
    goal: "find the thing",
    mountPath: "/",
    pages: { "/": "synthetic.html" },
    expectedFindings: over.expected ?? [],
    toleratedFindings: over.tolerated ?? [],
    unexpectedFindings: over.unexpected ?? [],
  });
}

function score(manifest: FixtureSiteManifest, findings: Finding[]): BenchSiteReportT {
  const experiment = Experiment.parse({
    id: "exp-synthetic",
    targetUrl: "https://example.com/",
    goal: manifest.goal,
    status: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
    configuration: { seed: BENCH_SEED },
    findings,
  });
  return scoreSite(manifest, { experiment, specMarkdown: "", durationsMs: {} }, "synthetic");
}

describe("bench scoring: ruleKey", () => {
  it("normalizes digit runs to #, collapses whitespace, lowercases, appends the principle", () => {
    expect(ruleKey("  Found 12 links in  3 menus ", "omit-words")).toBe(
      "found # links in # menus|omit-words",
    );
  });

  it("titles differing only in numbers collapse into one rule with a count", () => {
    const produced = producedFindings([
      finding("7 ambiguous link labels"),
      finding("42 ambiguous link labels"),
      finding("42 ambiguous link labels", { krugPrinciple: "omit-words" }),
    ]);
    expect(produced.map((p) => [p.ruleKey, p.count])).toEqual([
      ["# ambiguous link labels|dont-make-me-think", 2],
      ["# ambiguous link labels|omit-words", 1],
    ]);
  });
});

describe("bench scoring: matchFinding buckets", () => {
  it("unexpected beats expected beats tolerated", () => {
    const r = score(
      manifestWith({
        expected: [{ titleMatch: "stale" }, { titleMatch: "dense" }],
        tolerated: [{ titleMatch: "dense" }, { titleMatch: "console" }],
        unexpected: [{ titleMatch: "stale" }],
      }),
      [finding("Stale registration CTA"), finding("Dense link surface"), finding("Console errors")],
    );
    const bucket = Object.fromEntries(r.findings.produced.map((p) => [p.title, p.matchedAs]));
    expect(bucket).toEqual({
      "Stale registration CTA": "unexpected",
      "Dense link surface": "expected",
      "Console errors": "tolerated",
    });
    expect(r.findings.unexpected.map((u) => u.title)).toEqual(["Stale registration CTA"]);
    expect(r.findings.missing).toEqual([{ titleMatch: "stale" }]);
    expect(r.findings.recall).toBe(0.5);
    expect(r.findings.precision).toBeCloseTo(2 / 3);
    expect(r.expectationFailures).toContain('unexpectedFinding: "Stale registration CTA"');
  });

  it("titleMatch is a case-insensitive regex over the title", () => {
    const r = score(manifestWith({ expected: [{ titleMatch: "^post-event .* registration$" }] }), [
      finding("POST-EVENT page still invites REGISTRATION"),
    ]);
    expect(r.findings.produced[0].matchedAs).toBe("expected");
  });

  it("krugPrinciple narrows a match", () => {
    const expected: ExpectedFinding[] = [{ titleMatch: "stale", krugPrinciple: "omit-words" }];
    const hit = score(manifestWith({ expected }), [finding("stale", { krugPrinciple: "omit-words" })]);
    const miss = score(manifestWith({ expected }), [finding("stale", { krugPrinciple: "navigation" })]);
    expect(hit.findings.produced[0].matchedAs).toBe("expected");
    expect(miss.findings.produced[0].matchedAs).toBeUndefined();
    expect(miss.findings.missing).toEqual(expected);
    expect(miss.findings.recall).toBe(0);
  });

  it("severity narrows a match; a narrowed-out expected finding can still be tolerated", () => {
    const r = score(
      manifestWith({
        expected: [{ titleMatch: "stale", severity: "high" }],
        tolerated: [{ titleMatch: "stale" }],
      }),
      [finding("stale", { severity: "low" })],
    );
    expect(r.findings.produced[0].matchedAs).toBe("tolerated");
    expect(r.findings.recall).toBe(0);
    expect(r.findings.precision).toBe(1);
  });

  it("unmatched findings count against precision only", () => {
    const r = score(manifestWith({ expected: [{ titleMatch: "stale" }] }), [
      finding("stale"),
      finding("something else"),
    ]);
    expect(r.findings.produced.find((p) => p.title === "something else")?.matchedAs).toBeUndefined();
    expect(r.findings.recall).toBe(1);
    expect(r.findings.precision).toBe(0.5);
    expect(r.findings.unexpected).toEqual([]);
  });
});

describe("bench scoring: precision/recall edges", () => {
  it("0 expected → recall 1", () => {
    expect(score(manifestWith({}), [finding("anything")]).findings.recall).toBe(1);
  });

  it("0 produced and 0 expected → precision 1, recall 1", () => {
    const r = score(manifestWith({}), []);
    expect(r.findings.precision).toBe(1);
    expect(r.findings.recall).toBe(1);
  });

  it("0 produced with expected findings → precision 0, recall 0", () => {
    const r = score(manifestWith({ expected: [{ titleMatch: "stale" }] }), []);
    expect(r.findings.precision).toBe(0);
    expect(r.findings.recall).toBe(0);
    expect(r.findings.missing).toHaveLength(1);
  });
});
