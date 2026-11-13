/**
 * Layer 1 verification — deterministic facts, checked by a script instead of an LLM or a
 * reviewer (docs/verification.md). Each check compares two sources of truth that must agree:
 *
 *   contracts  stored experiments / run summaries parse with the zod contracts (no unknown keys)
 *   env        process.env reads ↔ .env.example ↔ README/docs ↔ terraform variables
 *   catalog    Krug principle ids in code ↔ docs/krug-principles.md ↔ contract enum;
 *              every stable finding rule id is referenced by a test
 *   api        src/app/api/** routes + methods ↔ docs/api.md
 *
 *   tsx scripts/verify-facts.ts                    compact report, exit 1 on drift
 *   tsx scripts/verify-facts.ts --json             machine-readable results
 *   tsx scripts/verify-facts.ts --write-fixtures   regenerate tests/fixtures/experiments/*.json
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import type { z } from "zod";
import { Experiment, KrugDimension, KrugPrinciple, SpecReport } from "../src/lib/contracts";

const root = process.cwd();
const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

interface Issue {
  path: string;
  message: string;
}
interface CheckResult {
  name: string;
  ok: boolean;
  checked: number;
  issues: Issue[];
}

function walk(dir: string, match: (file: string) => boolean): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs).sort()) {
    const p = path.join(abs, entry);
    if (statSync(p).isDirectory()) out.push(...walk(rel(p), match));
    else if (match(rel(p))) out.push(rel(p));
  }
  return out;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

// ── 1. Contract drift ───────────────────────────────────────────────────────

function formatPath(segments: PropertyKey[]): string {
  return segments.reduce<string>(
    (acc, s) => (typeof s === "number" ? `${acc}[${s}]` : acc ? `${acc}.${String(s)}` : String(s)),
    "",
  );
}

/** Keys present in the stored JSON that the contract strips — fields the schema no longer knows. */
function unknownKeys(input: unknown, parsed: unknown, at: PropertyKey[] = []): string[] {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    return input.flatMap((v, i) => unknownKeys(v, parsed[i], [...at, i]));
  }
  if (input && parsed && typeof input === "object" && typeof parsed === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(input)) {
      if (!(k in parsed)) out.push(formatPath([...at, k]));
      else out.push(...unknownKeys(v, (parsed as Record<string, unknown>)[k], [...at, k]));
    }
    return out;
  }
  return [];
}

function contractFor(file: string, json: unknown): { name: string; schema: z.ZodType } | null {
  if (!file.startsWith("docs/runs/")) return { name: "Experiment", schema: Experiment };
  const o = (json ?? {}) as Record<string, unknown>;
  if ("targetUrl" in o && "configuration" in o) return { name: "Experiment", schema: Experiment };
  if ("changes" in o && "rebuildPhases" in o) return { name: "SpecReport", schema: SpecReport };
  return null;
}

function checkContracts(): CheckResult {
  const files = [
    ...walk("data/experiments", (f) => f.endsWith(".json")),
    ...walk("tests/fixtures/experiments", (f) => f.endsWith(".json")),
    ...walk("docs/runs", (f) => path.basename(f) === "summary.json"),
  ];
  const issues: Issue[] = [];
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(read(file));
    } catch (e) {
      issues.push({ path: file, message: `invalid JSON: ${(e as Error).message}` });
      continue;
    }
    const contract = contractFor(file, json);
    if (!contract) {
      issues.push({ path: file, message: "no contract matches (expected an Experiment or SpecReport)" });
      continue;
    }
    const result = contract.schema.safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ path: `${file}#${formatPath(issue.path) || "(root)"}`, message: `${contract.name}: ${issue.message}` });
      }
      continue;
    }
    for (const key of unknownKeys(json, result.data)) {
      issues.push({ path: `${file}#${key}`, message: `${contract.name}: unknown key (not in src/lib/contracts)` });
    }
  }
  return { name: "contracts", ok: issues.length === 0, checked: files.length, issues };
}

// ── 2. Env drift ────────────────────────────────────────────────────────────

/** Set by the runtime/framework, never configured by us. */
const FRAMEWORK_ENV = new Set(["NODE_ENV", "NEXT_RUNTIME"]);

/** Keys the deploy stacks must provision (variable + env mapping), unless exempted per stack. */
const DEPLOYED_ENV = ["GEMINI_API_KEY", "JEV_API_KEY", "BRIGHTDATA_API_KEY", "BRIGHTDATA_ZONE", "SENTRY_DSN", "DATABASE_URL"];
const STACK_EXEMPT: Record<string, Record<string, string>> = {
  cloudflare: { DATABASE_URL: "Postgres persistence is provisioned only on the primary DigitalOcean stack" },
};

/** Keys deliberately not provisioned by terraform (docs/verification.md mirrors this list). */
const NOT_DEPLOYED: Record<string, string> = {
  GEMINI_MODEL_FAST: "has a code default",
  GEMINI_MODEL_DEEP: "has a code default",
  JEV_BASE_URL: "has a code default",
  JEV_MODEL: "has a code default",
  OPENROUTER_API_KEY: "alias of JEV_API_KEY",
  TIGERDATA_URL: "alias of DATABASE_URL",
  BRIGHTDATA_BROWSER_WS: "optional browser backend, not provisioned yet",
  BRIGHTDATA_BROWSER_USER: "optional browser backend, not provisioned yet",
  BRIGHTDATA_BROWSER_PASSWORD: "optional browser backend, not provisioned yet",
  BROWSERBASE_API_KEY: "optional browser backend, not provisioned yet",
  BROWSERBASE_PROJECT_ID: "optional browser backend, not provisioned yet",
  STAGEHAND_MODEL: "optional browser backend, not provisioned yet",
  STAGEHAND_MODEL_API_KEY: "optional browser backend, not provisioned yet",
  STAGEHAND_CHROME_PATH: "local-only (stagehand-local)",
  REHEARSAL_BROWSER: "defaults to auto",
  SENTRY_TRACES_SAMPLE_RATE: "has a code default",
  SNOWFLAKE_ACCOUNT_URL: "optional knowledge base, not provisioned yet",
  SNOWFLAKE_TOKEN: "optional knowledge base, not provisioned yet",
  SNOWFLAKE_CORTEX_SERVICE: "optional knowledge base, not provisioned yet",
};

/** Must never reach a deployment (disables the SSRF guard). */
const NEVER_DEPLOYED = ["REHEARSAL_ALLOW_PRIVATE"];

function envReads(): Map<string, string> {
  const files = [
    ...walk("src", (f) => /\.(ts|tsx|js|mjs)$/.test(f)),
    ...readdirSync(root).filter((f) => /^(next\.config|instrumentation[\w-]*|sentry\.[\w.-]+)\.(ts|js|mjs)$/.test(f)),
  ];
  const reads = new Map<string, string>();
  const patterns = [
    /\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)\b/g,
    /\b(?:process\.)?env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
  ];
  for (const file of files) {
    const text = read(file);
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        if (!reads.has(m[1])) reads.set(m[1], `${file}:${lineOf(text, m.index!)}`);
      }
    }
    for (const m of text.matchAll(/\{([^}]*)\}\s*=\s*process\.env\b/g)) {
      for (const name of m[1].split(",").map((s) => s.split(":")[0].trim())) {
        if (/^[A-Z][A-Z0-9_]*$/.test(name) && !reads.has(name)) reads.set(name, `${file}:${lineOf(text, m.index!)}`);
      }
    }
  }
  for (const k of FRAMEWORK_ENV) reads.delete(k);
  return reads;
}

function checkEnv(): CheckResult {
  const issues: Issue[] = [];
  const reads = envReads();
  const example = new Set(
    [...read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
  );
  const docText = ["README.md", ...walk("docs", (f) => f.endsWith(".md")).filter((f) => f !== "docs/verification.md")]
    .map(read)
    .join("\n");

  for (const [name, where] of reads) {
    if (!example.has(name)) issues.push({ path: where, message: `${name} is read but missing from .env.example` });
    if (!new RegExp(`\\b${name}\\b`).test(docText)) {
      issues.push({ path: where, message: `${name} is read but not documented in README.md or docs/` });
    }
  }
  for (const name of example) {
    if (!reads.has(name)) issues.push({ path: ".env.example", message: `${name} is never read in src/` });
  }

  // terraform: variables.tf declares it and some *.tf maps ENV = var.env
  const stacks = readdirSync(path.join(root, "terraform")).filter((d) => existsSync(path.join(root, "terraform", d, "variables.tf")));
  const classified = new Set([...DEPLOYED_ENV, ...Object.keys(NOT_DEPLOYED), ...NEVER_DEPLOYED]);
  for (const name of example) {
    if (!classified.has(name)) {
      issues.push({ path: "scripts/verify-facts.ts", message: `${name}: classify it as DEPLOYED_ENV or NOT_DEPLOYED (with a reason)` });
    }
  }
  for (const name of classified) {
    if (!example.has(name)) issues.push({ path: "scripts/verify-facts.ts", message: `${name} is classified but not in .env.example (stale entry)` });
  }
  for (const stack of stacks) {
    const dir = `terraform/${stack}`;
    const tf = walk(dir, (f) => f.endsWith(".tf")).map((f) => ({ file: f, text: read(f) }));
    const declared = new Set([...read(`${dir}/variables.tf`).matchAll(/^variable\s+"([^"]+)"/gm)].map((m) => m[1]));
    const mapped = new Map<string, { file: string; varName: string }>();
    for (const { file, text } of tf) {
      for (const m of text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*var\.([a-z0-9_]+)/gm)) mapped.set(m[1], { file, varName: m[2] });
    }
    for (const name of DEPLOYED_ENV) {
      if (STACK_EXEMPT[stack]?.[name]) continue;
      const varName = name.toLowerCase();
      if (!declared.has(varName)) issues.push({ path: `${dir}/variables.tf`, message: `missing variable "${varName}" for ${name}` });
      if (mapped.get(name)?.varName !== varName) issues.push({ path: dir, message: `${name} is not mapped to var.${varName} in the app env` });
    }
    for (const [name, { file }] of mapped) {
      if (NEVER_DEPLOYED.includes(name)) issues.push({ path: file, message: `${name} must never be deployed` });
      else if (!example.has(name)) issues.push({ path: file, message: `${name} is deployed but not in .env.example` });
      else if (!DEPLOYED_ENV.includes(name)) issues.push({ path: file, message: `${name} is deployed but classified NOT_DEPLOYED` });
    }
  }
  return { name: "env", ok: issues.length === 0, checked: new Set([...reads.keys(), ...example]).size, issues };
}

// ── 3. Catalog drift ────────────────────────────────────────────────────────

function checkCatalog(): CheckResult {
  const issues: Issue[] = [];
  const doc = read("docs/krug-principles.md");
  const docPrinciples = new Map<string, string>(); // slug -> K id
  for (const m of doc.matchAll(/^###\s+(K\d+)\s+`([a-z-]+)`/gm)) docPrinciples.set(m[2], m[1]);
  const docIds = new Set(docPrinciples.values());
  const enumSlugs = new Set<string>(KrugPrinciple.options);

  for (const slug of enumSlugs) {
    if (!docPrinciples.has(slug)) issues.push({ path: "src/lib/contracts/index.ts#KrugPrinciple", message: `"${slug}" has no "### Kn \`${slug}\`" heading in docs/krug-principles.md` });
  }
  for (const slug of docPrinciples.keys()) {
    if (!enumSlugs.has(slug)) issues.push({ path: "docs/krug-principles.md", message: `"${slug}" is not in the KrugPrinciple contract enum` });
  }
  for (const dim of KrugDimension.options) {
    const row = doc.match(new RegExp(`^\\|\\s*\`${dim}\`\\s*\\|([^|]*)\\|`, "m"));
    if (!row) {
      issues.push({ path: "docs/krug-principles.md", message: `KrugDimension "${dim}" missing from the eval dimensions table` });
      continue;
    }
    for (const k of row[1].match(/K\d+/g) ?? []) {
      if (!docIds.has(k)) issues.push({ path: "docs/krug-principles.md", message: `dimension "${dim}" cites unknown principle ${k}` });
    }
  }

  const sources = [...walk("src/lib/analysis", (f) => f.endsWith(".ts")), ...walk("src/lib/intents", (f) => f.endsWith(".ts"))];
  const ruleIds = new Map<string, string>();
  let principleRefs = 0;
  for (const file of sources) {
    const text = read(file);
    for (const m of text.matchAll(/krugPrinciple\b[^"\n]*?"([a-z][a-z-]*)"/g)) {
      principleRefs++;
      if (!docPrinciples.has(m[1])) issues.push({ path: `${file}:${lineOf(text, m.index!)}`, message: `Krug principle "${m[1]}" not in docs/krug-principles.md` });
    }
    for (const m of text.matchAll(/\bK(\d+)\b/g)) {
      principleRefs++;
      if (!docIds.has(`K${m[1]}`)) issues.push({ path: `${file}:${lineOf(text, m.index!)}`, message: `K${m[1]} is not a principle in docs/krug-principles.md` });
    }
    // Stable rule ids: findingId: `f_<rule>_...` templates and the metric finding("<rule>", ...) helper.
    for (const m of text.matchAll(/findingId:\s*`f_([a-z][a-z0-9-]*)_/g)) ruleIds.set(m[1], `${file}:${lineOf(text, m.index!)}`);
    for (const m of text.matchAll(/\bfinding\(\s*"([a-z][a-z0-9-]*)"/g)) ruleIds.set(m[1], `${file}:${lineOf(text, m.index!)}`);
  }
  ruleIds.delete("metric"); // namespace prefix of f_metric_<rule>_, not a rule
  const tests = walk("tests", (f) => /\.(ts|json)$/.test(f) && !f.startsWith("tests/fixtures/")).map(read).join("\n");
  for (const [rule, where] of ruleIds) {
    if (!new RegExp(`(^|[^a-z0-9-])${rule}([^a-z0-9-]|$)`, "m").test(tests)) {
      issues.push({ path: where, message: `finding rule "${rule}" is not referenced by any eval or unit test` });
    }
  }
  return { name: "catalog", ok: issues.length === 0, checked: enumSlugs.size + principleRefs + ruleIds.size, issues };
}

// ── 4. API catalog ──────────────────────────────────────────────────────────

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function checkApi(): CheckResult {
  const issues: Issue[] = [];
  const routes = new Map<string, string>(); // "METHOD /api/path" -> file
  for (const file of walk("src/app/api", (f) => /\/route\.(ts|js)$/.test(f))) {
    const urlPath = "/" + path.posix.dirname(file).replace(/^src\/app\//, "").replace(/\[([^\]]+)\]/g, ":$1");
    const text = read(file);
    for (const m of text.matchAll(/export\s+(?:async\s+function|function|const)\s+([A-Z]+)\b/g)) {
      if (METHODS.includes(m[1])) routes.set(`${m[1]} ${urlPath}`, file);
    }
  }
  const docFile = "docs/api.md";
  const doc = existsSync(path.join(root, docFile)) ? read(docFile) : "";
  if (!doc) issues.push({ path: docFile, message: "missing" });
  const documented = new Set(
    [...doc.matchAll(new RegExp(`^\\|\\s*(${METHODS.join("|")})\\s*\\|\\s*\`(/api/[^\`]+)\``, "gm"))].map((m) => `${m[1]} ${m[2]}`),
  );
  for (const [route, file] of routes) {
    if (!documented.has(route)) issues.push({ path: file, message: `${route} is not listed in ${docFile}` });
  }
  for (const route of documented) {
    if (!routes.has(route)) issues.push({ path: docFile, message: `${route} is documented but no route exports it` });
  }

  // Stage endpoint: every pipeline stage is routable and every routable stage is documented.
  const stageRoute = "src/app/api/experiments/[id]/[stage]/route.ts";
  const stageMatch = read("src/lib/orchestrator.ts").match(/PIPELINE_STAGES\s*=\s*\[([\s\S]*?)\]/);
  const stages = stageMatch ? [...stageMatch[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]) : [];
  if (existsSync(path.join(root, stageRoute))) {
    const cases = new Set([...read(stageRoute).matchAll(/case\s+"([a-z]+)"/g)].map((m) => m[1]));
    for (const s of stages) if (!cases.has(s)) issues.push({ path: stageRoute, message: `pipeline stage "${s}" has no case` });
    for (const c of cases) {
      if (!new RegExp(`\`${c}\``).test(doc)) issues.push({ path: docFile, message: `stage "${c}" accepted by ${stageRoute} is not documented` });
    }
  }
  return { name: "api", ok: issues.length === 0, checked: routes.size + stages.length, issues };
}

// ── Fixture generation (hermetic pipeline run on the AIE fixture) ───────────

const FIXTURE_NOW = "2026-11-13T12:00:00.000Z";

async function writeFixtures(): Promise<void> {
  // Deterministic ids + clock before the pipeline modules load.
  const req = createRequire(path.join(root, "package.json"));
  const nodeCrypto = req("node:crypto") as typeof import("node:crypto");
  let n = 0;
  nodeCrypto.randomUUID = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  syncBuiltinESMExports();
  const RealDate = Date;
  const fixed = new RealDate(FIXTURE_NOW).getTime();
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed);
      else super(...(args as [string]));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // fixture origin: skip DNS, never fetched

  const html = read("tests/evals/fixtures/aie-code-2026.html"); // read() resolves from root, not cwd
  const targetUrl = "https://ai.engineer/code/2026";
  const pages: Record<string, string> = {
    [targetUrl]: html,
    [`${targetUrl}/talks`]:
      "<html><head><title>Sessions — AIE Code 2026</title></head><body><h1>Schedule</h1><p>Wednesday November 11 talks</p></body></html>",
  };

  type Exp = z.infer<typeof Experiment>;
  const mem = new Map<string, Exp>();
  const work = mkdtempSync(path.join(os.tmpdir(), "rehearsal-fixture-"));
  const cwd = process.cwd();
  // Before importing: telemetry resolves its log dir at module load. Events + spec.md go to scratch.
  process.chdir(work);
  try {
    const { Orchestrator } = await import("../src/lib/orchestrator");
    const { FixtureJevClient } = await import("../src/lib/decisions/jev");
    const { FixtureLlmClient } = await import("../src/lib/analysis/gemini");
    const orch = new Orchestrator({
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
      store: {
        name: "memory",
        async save(e) { mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
        async get(id) { return mem.get(id) ?? null; },
        async list() { return [...mem.values()]; },
      },
      runner: {
        name: "fixture-runner",
        async openPage(url) {
          const page = pages[url];
          if (!page) throw new Error(`no fixture for ${url}`);
          return { html: page, screenshotPath: "" };
        },
        async runTrajectory(args) {
          return {
            runId: args.runId, viewport: args.viewport, success: true,
            steps: args.actions.map((a) => ({ actionId: a.actionId, label: a.label, ok: true })),
            assertions: args.assertions.map((assertion) => ({ assertion, passed: true })),
            errors: [], screenshotPaths: [], durationMs: 0,
          };
        },
        async close() {},
      },
    });
    const created = await orch.createExperiment(targetUrl, "find the conference schedule", {
      viewports: ["desktop"], trajectories: 40, verifyCount: 2, maxStates: 5,
    });
    const exp = await orch.runAll(created.id);
    const stable = (key: string, value: unknown) =>
      key === "durationMs" ? 0 : (key === "createdAt" || key === "at") && typeof value === "string" ? FIXTURE_NOW : value;
    const out = "tests/fixtures/experiments/aie-code-2026.json";
    writeFileSync(path.join(root, out), JSON.stringify(Experiment.parse(exp), stable, 2) + "\n");
    console.log(`wrote ${out} (${exp.findings.length} findings, ${exp.simulations.length} trajectories)`);
  } finally {
    process.chdir(cwd);
    rmSync(work, { recursive: true, force: true });
    globalThis.Date = RealDate;
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--write-fixtures")) {
    await writeFixtures();
    return;
  }
  const started = performance.now();
  const results = [checkContracts(), checkEnv(), checkCatalog(), checkApi()];
  const ok = results.every((r) => r.ok);
  const durationMs = Math.round(performance.now() - started);
  if (args.has("--json")) {
    console.log(JSON.stringify({ ok, durationMs, checks: results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name.padEnd(9)} ${r.checked} checked${r.ok ? "" : `, ${r.issues.length} issue(s)`}`);
      for (const i of r.issues) console.log(`     ${i.path}: ${i.message}`);
    }
    console.log(ok ? `facts OK (${durationMs}ms)` : `\nfacts check FAILED (${durationMs}ms) — see docs/verification.md`);
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
