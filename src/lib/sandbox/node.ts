import { SandboxRunArgs, type CodeSandbox, type SandboxRunResult, type SandboxTarget } from "../contracts";
import { assertPublicUrl, fetchPublic } from "../fetch/guards";

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 5_000_000;
const MAX_CONSOLE = 200;
const MAX_CONSOLE_CHARS = 500;

/** Resolve a target to `{html, url}` in this process; sandboxed code never gets network. */
export async function resolveTarget(target: SandboxTarget): Promise<{ html: string; url: string }> {
  if (target.kind === "html") return { html: target.html, url: target.url ?? "about:blank" };
  await assertPublicUrl(target.url);
  const res = await fetchPublic(target.url, { headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} for ${target.url}`);
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw new Error(`Page too large: ${html.length} bytes`);
  return { html, url: res.url || target.url };
}

type HarnessOutput = Omit<SandboxRunResult, "success" | "durationMs">;

/** Normalise raw harness output: collapse vm timeouts, derive `success`. */
export function toResult(out: HarnessOutput, timeoutMs: number, durationMs: number): SandboxRunResult {
  const errors = out.errors.some((e) => /timed out/i.test(e)) ? [`Sandbox timed out after ${timeoutMs}ms`] : out.errors;
  const success = errors.length === 0 && out.assertions.every((a) => a.passed);
  return { ...out, errors, success, durationMs: Math.max(0, Math.round(durationMs)) };
}

export function failedResult(errors: string[], durationMs = 0): SandboxRunResult {
  return { success: false, assertions: [], console: [], errors, durationMs: Math.max(0, Math.round(durationMs)) };
}

// Runs inside the worker. Host functions never cross into the vm realm: user code only sees
// closures compiled inside the context (string codegen off), and the bridge returns JSON
// strings, so `x.constructor.constructor` cannot reach the worker's Function/process.
const HARNESS_CORE = String.raw`
const vm = require("node:vm");
const { html, url, code, timeoutMs, maxConsole, maxChars } = workerData;
const out = { assertions: [], console: [], errors: [], output: undefined };
try {
  const { parseHTML } = require("linkedom");
  const { document } = parseHTML(html);
  const first = (sel) => document.querySelector(sel);
  const ops = {
    url: () => url,
    title: () => document.title || "",
    text: (sel) => (sel ? first(sel)?.textContent ?? "" : document.body?.textContent ?? document.documentElement?.textContent ?? ""),
    count: (sel) => document.querySelectorAll(sel).length,
    exists: (sel) => first(sel) !== null,
    attr: (sel, name) => first(sel)?.getAttribute(name) ?? null,
    assert: (name, passed, error) => { out.assertions.push(error ? { name, passed, error } : { name, passed }); return null; },
    log: (level, text) => { if (out.console.length < maxConsole) out.console.push({ level, text: text.slice(0, maxChars) }); return null; },
    report: (json) => { out.output = json === undefined ? undefined : JSON.parse(json); return null; },
  };
  const host = (op, a, b, c) => {
    try { return JSON.stringify({ v: ops[op](a, b, c) }); } catch (e) { return JSON.stringify({ e: String(e && e.message || e) }); }
  };
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
  ctx.__host = host;
  vm.runInContext(BOOTSTRAP, ctx);
  vm.runInContext(code, ctx, { timeout: timeoutMs, filename: "sandbox-test.js" });
} catch (e) {
  out.errors.push(String(e && e.message || e).slice(0, 2000));
}
emit(out);
`;

/** CommonJS harness source; `prelude` must define `workerData` and `emit(result)`. */
export function harnessSource(prelude: string): string {
  return `${prelude}\nconst BOOTSTRAP = ${JSON.stringify(BOOTSTRAP)};\n${HARNESS_CORE}`;
}

export const SANDBOX_LIMITS = { maxConsole: MAX_CONSOLE, maxChars: MAX_CONSOLE_CHARS } as const;

const WORKER_PRELUDE = `const { parentPort, workerData } = require("node:worker_threads");
const emit = (o) => parentPort.postMessage(o);`;

const BOOTSTRAP = String.raw`
(() => {
  const host = globalThis.__host;
  delete globalThis.__host;
  const call = (op, a, b, c) => {
    const r = JSON.parse(host(op, a, b, c));
    if ("e" in r) throw new Error(r.e);
    return r.v;
  };
  const fmt = (args) => args.map((x) => {
    if (typeof x === "string") return x;
    try { return JSON.stringify(x) ?? String(x); } catch { return String(x); }
  }).join(" ");
  const page = Object.freeze({
    url: () => call("url"),
    title: () => call("title"),
    text: (sel) => call("text", sel === undefined ? undefined : String(sel)),
    count: (sel) => call("count", String(sel)),
    exists: (sel) => call("exists", String(sel)),
    attr: (sel, name) => call("attr", String(sel), String(name)) ?? undefined,
  });
  const assert = (name, cond) => {
    let passed = false, error;
    try { passed = typeof cond === "function" ? !!cond() : !!cond; } catch (e) { error = String(e && e.message || e); }
    call("assert", String(name), passed, error);
    return passed;
  };
  const console = Object.freeze({
    log: (...a) => { call("log", "log", fmt(a)); },
    warn: (...a) => { call("log", "warn", fmt(a)); },
    error: (...a) => { call("log", "error", fmt(a)); },
  });
  const report = (value) => { call("report", JSON.stringify(value)); };
  Object.assign(globalThis, { page, assert, console, report });
})();
`;

/** Runs agent-generated test code in a `node:vm` context inside a terminable worker thread. */
export class NodeCodeSandbox implements CodeSandbox {
  readonly name = "node-vm-worker";

  async run(raw: SandboxRunArgs): Promise<SandboxRunResult> {
    const started = performance.now();
    const elapsed = () => performance.now() - started;
    const parsed = SandboxRunArgs.safeParse(raw);
    if (!parsed.success) return failedResult([`Invalid sandbox args: ${parsed.error.message}`]);
    const { code, target, timeoutMs = DEFAULT_TIMEOUT_MS } = parsed.data;

    let page: { html: string; url: string };
    try {
      page = await resolveTarget(target);
    } catch (e) {
      return failedResult([`Target rejected: ${(e as Error).message}`], elapsed());
    }

    let Worker: typeof import("node:worker_threads").Worker;
    try {
      ({ Worker } = await import("node:worker_threads"));
      if (typeof Worker !== "function") throw new Error("Worker missing");
    } catch {
      return failedResult(["node:worker_threads is unavailable on this runtime; node sandbox cannot run"], elapsed());
    }

    const source = harnessSource(WORKER_PRELUDE);
    return new Promise<SandboxRunResult>((resolve) => {
      let settled = false;
      const finish = (out: HarnessOutput) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(toResult(out, timeoutMs, elapsed()));
      };
      const fail = (error: string) => finish({ assertions: [], console: [], errors: [error] });
      const worker = new Worker(source, {
        eval: true,
        env: {},
        workerData: { ...page, code, timeoutMs, ...SANDBOX_LIMITS },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      // Backstop for anything vm's timeout can't interrupt; 1s grace covers worker + linkedom startup.
      const timer = setTimeout(() => fail(`Sandbox timed out after ${timeoutMs}ms`), timeoutMs + 1000);
      worker.once("message", finish);
      worker.once("error", (e) => fail(`Sandbox worker error: ${e.message}`));
      worker.once("exit", (c) => fail(`Sandbox worker exited (code ${c})`));
    });
  }
}
