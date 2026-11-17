/**
 * Measures storage operations per GET /api/experiments/[id] poll.
 * Before: every poll ran orch.get + orch.resume -> ~4 store/lease reads.
 * After: polls of finished/idle experiments skip resume via runNeedsWatchdog -> 1 read.
 */
import { Orchestrator, runNeedsWatchdog } from "../src/lib/orchestrator";
import { JsonFileStore, MemoryRunLeaseStore } from "../src/lib/storage";
import { Experiment } from "../src/lib/contracts";

const counts = { store: 0, lease: 0 };
const calls: string[] = [];
const inner = new JsonFileStore();
const store = new Proxy(inner, {
  get: (t, p) => {
    const v = (t as unknown as Record<string | symbol, unknown>)[p];
    return typeof v === "function"
      ? (...a: unknown[]) => { counts.store++; calls.push(`store.${String(p)}`); return (v as (...args: unknown[]) => unknown).apply(t, a); }
      : v;
  },
});
const innerLeases = new MemoryRunLeaseStore();
const leases = new Proxy(innerLeases, {
  get: (t, p) => {
    const v = (t as unknown as Record<string | symbol, unknown>)[p];
    return typeof v === "function"
      ? (...a: unknown[]) => { counts.lease++; calls.push(`lease.${String(p)}`); return (v as (...args: unknown[]) => unknown).apply(t, a); }
      : v;
  },
});

async function main() {
const orch = new Orchestrator({ store, leases });
const done = Experiment.parse({
  id: "exp_deadbeef", targetUrl: "https://example.com/", goal: "find pricing",
  status: "complete", createdAt: "2026-11-15T00:00:00.000Z", configuration: {},
});
const running = Experiment.parse({ ...done, status: "simulating" });
await store.save(done);
await store.save(running);

async function poll(exp: Experiment, gated: boolean) {
  counts.store = 0; counts.lease = 0; calls.length = 0;
  await orch.get(exp.id);
  if (!gated || runNeedsWatchdog(exp)) await orch.resume(exp.id, { inline: true });
  console.log("  calls:", calls.join(", "));
  return counts.store + counts.lease;
}

console.log("before (finished exp):", await poll(done, false), "storage ops/poll");
console.log("after  (finished exp):", await poll(done, true), "storage ops/poll");
console.log("after  (running exp):", await poll(running, true), "storage ops/poll — watchdog kept");
}
void main();
