/**
 * Runs one fixture site through the full pipeline under the bench harness:
 * seeded ids, pinned clock (manifest.referenceNow), in-memory store, fixture
 * adapters, per-stage wall-clock timing via hrtime (immune to clock pinning).
 */
import { hrtime } from "node:process";
import type {
  ActivityEvent,
  BenchSiteReport,
  Experiment,
  ExperimentConfig,
  ExperimentStore,
  FixtureSiteManifest,
  BrowserRunner,
} from "@/lib/contracts";
import { ExperimentConfig as ExperimentConfigSchema } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { specToMarkdown } from "@/lib/analysis/spec";
import { PlainFetcher } from "@/lib/fetch";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { BENCH_DEFAULTS } from "./sites";
import type { FixtureSite } from "./sites";

/** Patch node:crypto so randomUUID is a deterministic counter (AGENTS.md rule 3). */
export function installDeterministicIds(): void {
  let seq = 0;
  const nodeCrypto = process.getBuiltinModule("node:crypto") as unknown as {
    randomUUID: () => string;
  };
  // Counter first — makeState keeps only slice(0, 8) for stateIds/actionIds.
  nodeCrypto.randomUUID = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-000000000000`;
  (process.getBuiltinModule("node:module") as unknown as {
    syncBuiltinESMExports: () => void;
  }).syncBuiltinESMExports();
}

/** Pinned clock so stale-date heuristics don't drift with wall time. */
export function withPinnedClock<T>(iso: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!iso) return fn();
  const RealDate = Date;
  const pinned = new RealDate(iso).getTime();
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(pinned);
      else super(...(args as [number]));
    }
    static now() {
      return pinned;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  return fn().finally(() => {
    globalThis.Date = RealDate;
  });
}

/** In-memory store — bench runs never read or write data/experiments. */
function memoryStore(): ExperimentStore {
  const map = new Map<string, Experiment>();
  const feeds = new Map<string, ActivityEvent[]>();
  return {
    name: "bench-memory",
    save: async (e) => {
      map.set(e.id, e);
    },
    get: async (id) => map.get(id) ?? null,
    list: async () => [...map.values()],
    appendActivity: async (id, event) => {
      const feed = feeds.get(id) ?? [];
      feed.push(event);
      feeds.set(id, feed);
    },
    activity: async (id, limit) => {
      const events = feeds.get(id) ?? [];
      return limit === undefined ? events : events.slice(-limit);
    },
  };
}

export interface BenchRun {
  experiment: Experiment;
  specMarkdown: string;
  /** Measured ms per stage (real time — hrtime ignores the pinned clock). */
  durationsMs: Record<string, number>;
}

/**
 * Runs discover→simulate→verify→analyze→compare→spec over one fixture site.
 * `installDeterministicIds` must run before any experiment ids are minted.
 */
export async function runBenchSite(
  site: FixtureSite,
  runner: BrowserRunner,
  opts: { seed: number; targetUrl: string },
): Promise<BenchRun> {
  const manifest: FixtureSiteManifest = site.manifest;
  const config: ExperimentConfig = ExperimentConfigSchema.parse({
    seed: opts.seed,
    ...BENCH_DEFAULTS,
    ...manifest.config,
  });
  const store = memoryStore();
  const orch = new Orchestrator({
    fetcher: new PlainFetcher(),
    jev: new FixtureJevClient(),
    llm: new FixtureLlmClient(),
    store,
    runner,
  });

  const durationsMs: Record<string, number> = {};
  const timed = async <R>(stage: string, fn: () => Promise<R>): Promise<R> => {
    const t0 = hrtime.bigint();
    const r = await fn();
    durationsMs[stage] = Number(hrtime.bigint() - t0) / 1e6;
    return r;
  };

  return withPinnedClock(manifest.referenceNow, async () => {
    const exp = await orch.createExperiment(opts.targetUrl, manifest.goal, config);
    await timed("discover", () => orch.discover(exp.id));
    await timed("simulate", () => orch.simulate(exp.id));
    await timed("verify", () => orch.verify(exp.id));
    await timed("analyze", () => orch.analyze(exp.id));
    await timed("compare", () => orch.compare(exp.id));
    // runSpec also writes data/experiments/<id>/spec.md — gitignored scratch output.
    const specExp = await timed("spec", () => orch.spec(exp.id));
    const finalExp = (await store.get(exp.id))!;
    return {
      experiment: finalExp,
      specMarkdown: specToMarkdown(specExp.spec!),
      durationsMs: { ...durationsMs, total: Object.values(durationsMs).reduce((a, b) => a + b, 0) },
    };
  });
}

/** Determinism proof input: the report with timing fields zeroed. */
export function stripTiming(report: BenchSiteReport): BenchSiteReport {
  return { ...report, durationsMs: {}, overBudget: [] };
}
