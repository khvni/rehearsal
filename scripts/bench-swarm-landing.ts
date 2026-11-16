/**
 * Times runPersonaSwarm with the real PlaywrightRunner against a public-host
 * target: the aie-code-2026 fixture served on the machine's LAN IP (non-
 * loopback, so politeDelay applies; REHEARSAL_ALLOW_PRIVATE lets the guards
 * reach it). Counts landing + robots GETs server-side — a shared landing shows
 * 1 landing GET per run instead of one per agent.
 *
 *   REHEARSAL_ALLOW_PRIVATE=1 npx tsx scripts/bench-swarm-landing.ts
 *     --samples 3 --agents 40 --out data/bench-landing
 *
 * `--out` writes swarm-<i>.json per sample; swarm JSON is comparable verbatim
 * across runs (no wall-clock fields).
 */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { hrtime } from "node:process";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SAMPLES = Number(opt("--samples", "3"));
const AGENTS = Number(opt("--agents", "40"));
const OUT = path.resolve(opt("--out", path.join("data", "bench-landing")));

// A public-host politeness run needs a non-loopback address: politeDelay skips
// loopback under REHEARSAL_ALLOW_PRIVATE, so serving on 127.0.0.1 would hide the
// cost this script measures.
function lanIp(): string {
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  throw new Error("no non-loopback IPv4 interface — politeDelay would be skipped");
}

async function main() {
  process.env.REHEARSAL_ALLOW_PRIVATE ??= "1";
  const { loadManifests, loadSite, pageFor } = await import("../tests/evals/bench/sites");
  const { ExperimentConfig, VIEWPORTS } = await import("../src/lib/contracts");
  const { runPersonaSwarm } = await import("../src/lib/simulation/swarm");
  const { PlaywrightRunner } = await import("../src/lib/browser/playwright");
  const { FixtureJevClient } = await import("../src/lib/decisions/jev");

  const site = loadSite(loadManifests().find((m) => m.id === "aie-code-2026")!);
  const mount = site.manifest.mountPath;
  const config = ExperimentConfig.parse({
    seed: 1337,
    maxAgents: AGENTS,
    maxStepsPerAgent: 8,
    maxConcurrentAgents: 10,
    viewports: ["desktop"],
    trajectories: 50,
    verifyCount: 2,
  });

  let landingGets = 0;
  let robotsGets = 0;
  let totalGets = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    totalGets++;
    if (u.pathname === "/robots.txt") {
      robotsGets++;
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    const html = pageFor(site, u.pathname);
    if (html !== null) {
      if (u.pathname === mount) landingGets++;
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html);
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((r) => server.listen(44901, lanIp(), r));
  const url = `http://${lanIp()}:44901${mount}`;
  console.log(`serving ${url} (${AGENTS} agents x10)`);

  mkdirSync(OUT, { recursive: true });
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    landingGets = 0;
    robotsGets = 0;
    totalGets = 0;
    const runner = new PlaywrightRunner(undefined, undefined, new FixtureJevClient());
    const t0 = hrtime.bigint();
    const swarm = await runPersonaSwarm({
      runner,
      url,
      goal: "find the conference schedule",
      assertions: [{ kind: "text-present", value: "schedule" }],
      config,
      viewport: VIEWPORTS.desktop,
      jev: new FixtureJevClient(),
    });
    const ms = Number(hrtime.bigint() - t0) / 1e6;
    await runner.close();
    const reached = swarm.journeys.filter((j) => j.goalReached).length;
    rows.push({
      sample: i,
      ms: Math.round(ms),
      landingGets,
      robotsGets,
      totalGets,
      journeys: swarm.journeys.length,
      reached,
    });
    console.log(
      `sample ${i}: ${Math.round(ms)}ms landingGets=${landingGets} robotsGets=${robotsGets} totalGets=${totalGets} reached=${reached}`,
    );
    writeFileSync(path.join(OUT, `swarm-${i}.json`), JSON.stringify(swarm));
  }
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
