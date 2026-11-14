import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Experiment,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type LlmClient,
} from "@/lib/contracts";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { llmFindings } from "@/lib/analysis/findings";
import { generateSpec } from "@/lib/analysis/spec";
import { JsonFileStore } from "@/lib/storage";
import { Orchestrator } from "@/lib/orchestrator";

const BOGUS_ASSERTIONS = JSON.stringify([
  { kind: "bogus", value: "x", selector: null },
  { kind: "text-present", value: "Pricing", selector: null },
  { kind: "url-matches", value: 42 },
]);

const stubLlm = (byMarker: Record<string, string>): LlmClient => ({
  name: "stub",
  async complete(prompt) {
    for (const [marker, out] of Object.entries(byMarker)) if (prompt.includes(marker)) return out;
    return "not json";
  },
});

const PAGE = `<html><head><title>Acme</title></head><body><h1>Acme</h1><a href="/pricing">Pricing</a></body></html>`;

const runner: BrowserRunner = {
  name: "fixture-runner",
  async openPage() {
    return { html: PAGE, screenshotPath: "" };
  },
  async runTrajectory(args): Promise<BrowserRun> {
    return {
      runId: args.runId, viewport: args.viewport, success: true, steps: [],
      assertions: args.assertions.map((assertion) => ({ assertion, passed: true })),
      errors: [], consoleErrorCount: 0, screenshotPaths: [], durationMs: 0,
    };
  },
  async close() {},
};

const dir = mkdtempSync(path.join(tmpdir(), "rehearsal-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("LLM output is validated against the contracts before it is stored", () => {
  it("simulate keeps only contract-valid assertions and the list still loads", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const store: ExperimentStore = new JsonFileStore(dir);
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: stubLlm({ ASSERTION_LIST: BOGUS_ASSERTIONS }),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment("https://acme.test", "find the pricing page", {
      viewports: ["desktop"], trajectories: 10, verifyCount: 1, maxStates: 2, maxDepth: 1,
    });
    await orch.simulate(exp.id);
    const simulated = (await orch.get(exp.id))!;
    expect(simulated.assertions).toEqual([{ kind: "text-present", value: "Pricing" }]);
    expect((await orch.list()).map((e) => e.id)).toContain(exp.id);
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });

  it("falls back to keyword assertions when no LLM assertion is valid", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      runner, store: new JsonFileStore(dir), jev: new FixtureJevClient(),
      llm: stubLlm({ ASSERTION_LIST: JSON.stringify([{ kind: "anything", value: "x", selector: null }]) }),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment("https://acme.test", "find the pricing page", {
      viewports: ["desktop"], trajectories: 10, verifyCount: 1, maxStates: 2, maxDepth: 1,
    });
    await orch.simulate(exp.id);
    expect((await orch.get(exp.id))!.assertions).toEqual([{ kind: "text-present", value: "pricing" }]);
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });

  it("JsonFileStore.list skips unparseable documents and save rejects invalid ones", async () => {
    const store = new JsonFileStore(dir);
    const before = (await store.list()).length;
    const good = JSON.parse(readFileSync(path.join(dir, `${(await store.list())[0].id}.json`), "utf8"));
    writeFileSync(path.join(dir, "exp_bad.json"), JSON.stringify({ ...good, id: "exp_bad", assertions: [{ kind: "bogus", value: "x", selector: null }] }));
    writeFileSync(path.join(dir, "exp_torn.json"), "{");
    expect((await store.list()).length).toBe(before);
    await expect(store.save({ ...good, id: "exp_bad2", assertions: [{ kind: "bogus", value: "x" }] } as Experiment)).rejects.toThrow();
    await expect(store.get("exp_bad2")).resolves.toBeNull();
  });

  it("llmFindings drops findings that don't fit the Finding contract", async () => {
    const findings = await llmFindings({
      llm: stubLlm({
        FINDINGS_JSON: JSON.stringify({
          findings: [
            { title: "Vague CTA", description: "Says 'Go'", severity: "nope", category: "??", recommendation: "Name it" },
            { title: "Bad", description: { nested: true } },
            { title: null, description: "x" },
          ],
        }),
      }),
      states: [], runs: [], goal: "find pricing",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ title: "Vague CTA", severity: "medium", category: "clarity", evidenceType: "hypothesis" });
  });

  it("generateSpec ignores malformed LLM spec fields", async () => {
    const base = Experiment.parse({
      id: "exp_spec", targetUrl: "https://acme.test/", goal: "find pricing", status: "created",
      createdAt: "2026-01-01T00:00:00.000Z", configuration: {},
      findings: [{
        findingId: "f1", title: "Vague CTA", category: "clarity", severity: "high", evidenceType: "hypothesis",
        description: "d", affectedStates: [], recommendation: "r", verificationStatus: "unverified", krugPrinciple: "omit-words",
      }],
    });
    const spec = await generateSpec(base, stubLlm({
      "rebuild spec": JSON.stringify({
        summary: 7,
        changes: [{ title: "t", change: "c", rationale: "r", effort: "XL", krugPrinciple: "made-up" }],
        rebuildPhases: [{ name: "p", items: "not-an-array" }],
      }),
    }));
    expect(spec.changes.map((c) => c.findingId)).toEqual(["f1"]);
    expect(typeof spec.summary).toBe("string");
    expect(spec.rebuildPhases.length).toBeGreaterThan(0);
  });
});
