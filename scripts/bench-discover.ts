/* Local benchmark for the discover stage: fixture site on a non-loopback IP so
 * politeDelay still applies (private IPs allowed via REHEARSAL_ALLOW_PRIVATE=1;
 * the politeness skip only covers loopback hosts). */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";

const index = readFileSync(
  path.join(__dirname, "..", "tests", "evals", "fixtures", "checkout-loop", "index.html"),
  "utf8",
);
const leaf = readFileSync(
  path.join(__dirname, "..", "tests", "evals", "fixtures", "checkout-loop", "trial.html"),
  "utf8",
);

const requests: { url: string; start: number; end: number }[] = [];

async function main() {
  const host = "172.16.255.2";
  const server: Server = createServer((req, res) => {
    const start = Date.now();
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
    } else if (req.url === "/" || (req.url ?? "").startsWith("/")) {
      const html = req.url === "/" ? index : leaf;
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("not found");
    }
    requests.push({ url: req.url ?? "", start, end: Date.now() });
  });
  await new Promise<void>((r) => server.listen(8080, host, r));
  const base = `http://${host}:8080`;

  const { Orchestrator } = await import("../src/lib/orchestrator");
  const orch = new Orchestrator();
  const t0 = Date.now();
  const exp = await orch.createExperiment(base, "sign up for a trial");
  const tCreate = Date.now() - t0;
  const t1 = Date.now();
  await orch.discover(exp.id);
  const tDiscover = Date.now() - t1;

  const store = (orch as unknown as { store: { activity: (id: string) => Promise<{ ts: string; message: string }[]> } }).store;
  const activity = await store.activity(exp.id);
  console.log(`create: ${tCreate}ms  discover: ${tDiscover}ms`);
  console.log(`requests (${requests.length}):`);
  for (const r of requests) console.log(`  ${new Date(r.start).toISOString().slice(17, 23)} ${r.url} (${r.end - r.start}ms)`);
  console.log("activity:");
  for (const a of activity) console.log(`  ${a.ts.slice(17, 23)} ${a.message.slice(0, 110)}`);
  await new Promise<void>((r) => server.close(() => r()));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
