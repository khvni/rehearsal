/**
 * Hermetic pipeline smoke for the hourly snapshot-health workflow: serves the
 * checked-in AIE fixture on localhost and runs discover → spec with tiny
 * budgets through the real Orchestrator (local Playwright, fixture adapters).
 */
import { createServer } from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Orchestrator, PIPELINE_STAGES } from "../src/lib/orchestrator";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";
process.env.REHEARSAL_BROWSER = "playwright";

const html = readFileSync(path.join(process.cwd(), "tests", "evals", "fixtures", "aie-code-2026.html"), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/code/2026") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const orch = new Orchestrator();
  const exp = await orch.createExperiment(`http://127.0.0.1:${port}/code/2026`, "find the conference schedule", {
    viewports: ["desktop"],
    maxStates: 3,
    maxDepth: 1,
    trajectories: 50,
    verifyCount: 1,
  });

  const timings: { stage: string; ms: number }[] = [];
  try {
    for (const stage of PIPELINE_STAGES) {
      const t0 = performance.now();
      await orch[stage](exp.id);
      timings.push({ stage, ms: Math.round(performance.now() - t0) });
      console.log(`smoke ${stage}: ${timings.at(-1)!.ms}ms`);
    }
    const done = await orch.get(exp.id);
    if (!done?.graph?.states.length) throw new Error("discover produced no states");
    if (done.status !== "complete" || !done.spec) throw new Error(`pipeline ended in status ${done?.status} without a spec`);
    if (done.errors.length) throw new Error(`pipeline recorded errors: ${done.errors.join("; ")}`);
    console.log(`smoke ok: ${done.graph.states.length} states, ${done.findings.length} findings, spec complete`);
  } finally {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary && timings.length) {
      appendFileSync(summary, ["", "| Pipeline stage | ms |", "| --- | ---: |", ...timings.map((t) => `| ${t.stage} | ${t.ms} |`), ""].join("\n"));
    }
    await orch.dispose();
    server.close();
  }
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exitCode = 1;
  server.close();
});
