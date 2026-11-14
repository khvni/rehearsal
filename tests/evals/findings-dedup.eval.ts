import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  VIEWPORTS,
  type Assertion,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type Finding,
} from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { makeState } from "@/lib/graph";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { ruleFindings } from "@/lib/analysis/findings";
import { collapseFindings } from "@/lib/analysis/dedupe";
import { Orchestrator } from "@/lib/orchestrator";

const AIE_URL = "https://ai.engineer/code/2026";
const REFERENCE_NOW = "2026-11-13T12:00:00Z";
const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const aiePage = extractPage(aieHtml, AIE_URL);
const SEVERITY_RANK: Record<Finding["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1 };

const key = (f: Pick<Finding, "krugPrinciple" | "title">) => `${f.krugPrinciple}|${f.title.replace(/ \(\d+ of \d+ (pages|runs)\)$/, "")}`;
const duplicateKeys = (findings: Finding[]) => {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([k]) => k);
};

function failedRun(runId: string, assertions: Assertion[]): BrowserRun {
  return {
    runId, viewport: VIEWPORTS.desktop, success: false, steps: [],
    assertions: assertions.map((assertion) => ({ assertion, passed: false })),
    errors: [], consoleErrorCount: 0, screenshotPaths: [`/shots/${runId}.png`], durationMs: 0,
  };
}

// ── per-state rule findings collapse to one finding per (Krug principle + title) ──

describe("eval: cross-state finding dedup", () => {
  const states = ["", "/speakers", "/sponsors", "/venue"].map((p) =>
    makeState({
      url: `${AIE_URL}${p}`,
      viewport: VIEWPORTS.desktop,
      title: aiePage.title,
      visibleText: aiePage.visibleText,
      actions: aiePage.actions,
      screenshotPath: `/shots/state${p || "/home"}.png`,
    }),
  );
  const schedule: Assertion = { kind: "url-matches", value: "schedule" };
  const runs = [failedRun("run_a", [schedule]), failedRun("run_b", [schedule])];
  const raw = ruleFindings({ states, runs, assertions: [schedule], referenceNowIso: REFERENCE_NOW });
  const collapsed = collapseFindings(raw, { states, runs: runs.length });

  it("raw rule output repeats per state (the bug this guards against)", () => {
    expect(duplicateKeys(raw).length).toBeGreaterThan(0);
  });

  it("each (principle, title) appears once, with every state and screenshot as evidence", () => {
    expect(duplicateKeys(collapsed)).toEqual([]);
    for (const k of new Set(raw.map(key))) {
      const group = raw.filter((f) => key(f) === k);
      const merged = collapsed.filter((f) => key(f) === k);
      expect(merged, k).toHaveLength(1);
      const [f] = merged;
      for (const g of group) {
        for (const s of g.affectedStates) expect(f.affectedStates, k).toContain(s);
        for (const a of g.affectedActions) expect(f.affectedActions, k).toContain(a);
        for (const p of g.evidencePaths) expect(f.evidencePaths, k).toContain(p);
      }
      expect(SEVERITY_RANK[f.severity]).toBe(Math.max(...group.map((g) => SEVERITY_RANK[g.severity])));
      expect(f.findingId).toBe(group[0].findingId);
    }
  });

  it("titles carry the affected-scope count", () => {
    const stale = collapsed.find((f) => f.title.startsWith("Post-event page still invites registration"));
    expect(stale?.title).toBe(`Post-event page still invites registration (${states.length} of ${states.length} pages)`);
    expect(stale?.evidencePaths).toHaveLength(states.length);
    const failure = collapsed.filter((f) => f.evidenceType === "verified-failure");
    expect(failure.map((f) => f.title)).toEqual(['Assertion failed in browser: url-matches "schedule" (2 of 2 runs)']);
    expect(failure[0].evidencePaths).toEqual(["/shots/run_a.png", "/shots/run_b.png"]);
  });

  it("keeps verified failures distinct when their assertions differ, and takes max severity", () => {
    const other: Assertion = { kind: "text-present", value: "Schedule" };
    const findings = collapseFindings(
      ruleFindings({ states: [], runs: [failedRun("run_a", [schedule]), failedRun("run_b", [other])], assertions: [] }),
      { states: [], runs: 2 },
    );
    expect(findings).toHaveLength(2);
    const [low, high] = [{ ...raw[0], severity: "low" as const }, { ...raw[0], findingId: "x", severity: "critical" as const }];
    expect(collapseFindings([low, high], { states: [], runs: 0 })[0].severity).toBe("critical");
  });

  it("counts pages by URL, so desktop + mobile states of one URL are one page", () => {
    const mobile = states.map((s) =>
      makeState({ url: s.url, viewport: VIEWPORTS.mobile, title: s.pageTitle, visibleText: s.visibleText, actions: s.actions }),
    );
    const both = [states[0], mobile[0], states[1], mobile[1]];
    const findings = collapseFindings(ruleFindings({ states: both, runs: [], assertions: [], referenceNowIso: REFERENCE_NOW }), { states: both, runs: 0 });
    const stale = findings.find((f) => f.title.startsWith("Post-event page still invites registration"));
    expect(stale?.title).toBe("Post-event page still invites registration (2 of 2 pages)");
    expect(stale?.affectedStates).toHaveLength(4);
    const one = [states[0], mobile[0]];
    const single = collapseFindings(ruleFindings({ states: one, runs: [], assertions: [], referenceNowIso: REFERENCE_NOW }), { states: one, runs: 0 });
    expect(single.find((f) => f.title.startsWith("Post-event"))?.title).toBe("Post-event page still invites registration");
  });
});

// ── orchestrator: analyze + spec list each change once ──────────────────────

describe("eval: orchestrator analyze/spec emit each finding once across states", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(REFERENCE_NOW));
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  });
  afterAll(() => {
    vi.useRealTimers();
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });

  const runner: BrowserRunner = {
    name: "fixture-runner",
    async openPage(url) {
      if (!url.startsWith("https://ai.engineer/")) throw new Error(`no fixture for ${url}`);
      return { html: aieHtml, screenshotPath: `/shots/${encodeURIComponent(url)}.png` };
    },
    async runTrajectory(args): Promise<BrowserRun> {
      return { ...failedRun(args.runId, args.assertions), viewport: args.viewport };
    },
    async close() {},
  };
  const mem = new Map<string, Experiment>();
  const store: ExperimentStore = {
    name: "memory",
    async save(e) { mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
    async get(id) { return mem.get(id) ?? null; },
    async list() { return [...mem.values()]; },
    async appendActivity() {},
    async activity() { return []; },
  };

  it("findings and spec changes are unique per (principle, title)", async () => {
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment(AIE_URL, "find the conference schedule", {
      viewports: ["desktop"], trajectories: 200, verifyCount: 2, maxStates: 4,
    });
    await orch.spec(exp.id);
    const done = (await orch.get(exp.id))!;
    const pages = done.graph!.states.length;
    expect(pages).toBeGreaterThan(1);
    expect(duplicateKeys(done.findings)).toEqual([]);
    const stale = done.findings.filter((f) => f.title.startsWith("Post-event page still invites registration"));
    expect(stale).toHaveLength(1);
    expect(stale[0].title).toMatch(new RegExp(`\\(\\d+ of ${pages} pages\\)$`));
    const titles = done.spec!.changes.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
