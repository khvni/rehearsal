/**
 * Factory-as-code sync: factory/branch-protection.json is the source of truth
 * for the `main` ruleset on GitHub.
 *
 *   tsx scripts/factory-sync.ts --check   validate factory/** and diff against the live ruleset
 *   tsx scripts/factory-sync.ts --apply   create/update the live ruleset (needs repo admin)
 *
 * --check exits 1 on drift (FACTORY_DRIFT_MODE=warn downgrades drift to a warning).
 * Missing gh auth/permissions never fail --check: it prints a notice and skips.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const root = process.cwd();
const factoryDir = path.join(root, "factory");
const repo = process.env.GITHUB_REPOSITORY ?? "khvni/rehearsal";
const rulesetPath = "factory/branch-protection.json";
const inActions = process.env.GITHUB_ACTIONS === "true";

const RuleSchema = z.object({
  type: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
const RulesetSchema = z.object({
  name: z.string().min(1),
  target: z.literal("branch"),
  enforcement: z.enum(["active", "evaluate", "disabled"]),
  conditions: z.object({
    ref_name: z.object({ include: z.array(z.string()).min(1), exclude: z.array(z.string()) }),
  }),
  bypass_actors: z.array(z.record(z.string(), z.unknown())),
  rules: z.array(RuleSchema).min(1),
});
type Ruleset = z.infer<typeof RulesetSchema>;

const Severity = z.enum(["bug", "security", "code_quality", "style"]);
const ReviewPolicySchema = z
  .object({
    blocking_severities: z.array(Severity).min(1),
    non_blocking_severities: z.array(Severity),
    max_review_rounds: z.number().int().positive(),
    escalate_to: z.string().min(1),
  })
  .passthrough()
  .refine((p) => !p.blocking_severities.some((s) => p.non_blocking_severities.includes(s)), {
    message: "a severity cannot be both blocking and non-blocking",
  });

const REQUIRED_FILES = ["branch-protection.json", "review-policy.json", "automations.yaml", "blueprint.yaml"];

function notice(msg: string): void {
  console.log(inActions ? `::notice title=factory::${msg}` : `notice: ${msg}`);
}
function warn(msg: string): void {
  console.log(inActions ? `::warning title=factory::${msg}` : `warning: ${msg}`);
}
function summary(md: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) execFileSync("sh", ["-c", 'cat >> "$1"', "sh", file], { input: `${md}\n` });
}

function loadFactory(): Ruleset {
  const errors: string[] = [];
  for (const f of REQUIRED_FILES) {
    if (!existsSync(path.join(factoryDir, f))) errors.push(`factory/${f} is missing`);
  }
  const parse = <T>(file: string, schema: z.ZodType<T>): T | undefined => {
    try {
      const result = schema.safeParse(JSON.parse(readFileSync(path.join(factoryDir, file), "utf8")));
      if (result.success) return result.data;
      errors.push(`factory/${file}: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    } catch (err) {
      errors.push(`factory/${file}: ${(err as Error).message}`);
    }
    return undefined;
  };
  const ruleset = parse("branch-protection.json", RulesetSchema);
  parse("review-policy.json", ReviewPolicySchema);
  if (errors.length || !ruleset) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  return ruleset;
}

class GhError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
  ) {
    super(message);
  }
}

function gh(args: string[], input?: string): unknown {
  try {
    const out = execFileSync("gh", ["api", ...args], {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() ? JSON.parse(out) : null;
  } catch (err) {
    const e = err as { code?: string; stderr?: string; stdout?: string; message: string };
    if (e.code === "ENOENT") throw new GhError("gh CLI not installed", 401);
    const text = (e.stderr?.trim().split("\n")[0] ?? "") || e.stdout?.trim() || e.message;
    const unauthenticated = /gh auth login|not logged in/i.test(`${e.stderr ?? ""}`);
    const status = Number(text.match(/HTTP (\d{3})/)?.[1]) || (unauthenticated ? 401 : undefined);
    throw new GhError(text, status);
  }
}

const isPermissionError = (err: unknown): boolean =>
  err instanceof GhError && err.status !== undefined && [401, 403, 404].includes(err.status);

function fetchLive(name: string): (Ruleset & { id: number }) | null {
  const pages = gh(["--paginate", "--slurp", `repos/${repo}/rulesets?includes_parents=false&per_page=100`]);
  const list = (pages as { id: number; name: string }[][]).flat();
  const match = list.find((r) => r.name === name);
  return match ? (gh([`repos/${repo}/rulesets/${match.id}`]) as Ruleset & { id: number }) : null;
}

/** Every key in `want` must match `have`; arrays match order-insensitively. */
function diff(want: unknown, have: unknown, at: string, out: string[]): void {
  if (Array.isArray(want)) {
    if (have === undefined && want.length === 0) return;
    if (!Array.isArray(have) || have.length !== want.length) {
      out.push(`${at}: want ${JSON.stringify(want)}, live ${JSON.stringify(have)}`);
      return;
    }
    for (const [i, w] of want.entries()) {
      if (!have.some((h) => matches(w, h))) out.push(`${at}[${i}]: ${JSON.stringify(w)} not found live`);
    }
    return;
  }
  if (want !== null && typeof want === "object") {
    if (have === null || typeof have !== "object") {
      out.push(`${at}: want object, live ${JSON.stringify(have)}`);
      return;
    }
    for (const [k, v] of Object.entries(want)) diff(v, (have as Record<string, unknown>)[k], `${at}.${k}`, out);
    return;
  }
  if (want !== have) out.push(`${at}: want ${JSON.stringify(want)}, live ${JSON.stringify(have)}`);
}
function matches(want: unknown, have: unknown): boolean {
  const out: string[] = [];
  diff(want, have, "", out);
  return out.length === 0;
}

function drift(desired: Ruleset, live: Ruleset | null): string[] {
  if (!live) return [`ruleset "${desired.name}" does not exist on ${repo}`];
  const out: string[] = [];
  const { rules, ...rest } = desired;
  diff(rest, live, "ruleset", out);
  const liveRules = live.rules ?? [];
  for (const rule of rules) {
    const have = liveRules.find((r) => r.type === rule.type);
    if (!have) out.push(`rules: missing "${rule.type}"`);
    else diff(rule, have, `rules.${rule.type}`, out);
  }
  for (const r of liveRules) {
    if (!rules.some((d) => d.type === r.type)) out.push(`rules: live has extra "${r.type}"`);
  }
  return out;
}

function ownerCommands(name: string): string {
  return [
    `# Run as the repo owner (needs admin on ${repo}):`,
    `id=$(gh api --paginate "repos/${repo}/rulesets?includes_parents=false&per_page=100" --jq '.[] | select(.name=="${name}") | .id')`,
    `if [ -n "$id" ]; then`,
    `  gh api --method PUT "repos/${repo}/rulesets/$id" --input ${rulesetPath}`,
    `else`,
    `  gh api --method POST "repos/${repo}/rulesets" --input ${rulesetPath}`,
    `fi`,
    `npm run factory:check`,
  ].join("\n");
}

function check(desired: Ruleset): void {
  let live: Ruleset | null;
  try {
    live = fetchLive(desired.name);
  } catch (err) {
    if (!isPermissionError(err)) throw err;
    notice(`factory files valid; skipped live ruleset diff (gh cannot read rulesets: ${(err as Error).message})`);
    return;
  }
  const problems = drift(desired, live);
  if (problems.length === 0) {
    console.log(`factory: ${rulesetPath} matches live ruleset "${desired.name}" on ${repo}`);
    summary(`factory: \`${rulesetPath}\` matches the live ruleset.`);
    return;
  }
  const report = problems.map((p) => `- ${p}`).join("\n");
  console.log(`factory drift (${rulesetPath} vs live):\n${report}`);
  summary(`### Factory drift\n\n${report}\n\nApply after merge:\n\n\`\`\`sh\n${ownerCommands(desired.name)}\n\`\`\``);
  if (process.env.FACTORY_DRIFT_MODE === "warn") {
    warn(`${problems.length} difference(s) between ${rulesetPath} and the live ruleset; apply after merge`);
    return;
  }
  console.error("Run `npm run factory:sync -- --apply` (repo admin) to apply.");
  process.exit(1);
}

function apply(desired: Ruleset): void {
  const body = JSON.stringify(desired);
  try {
    const live = fetchLive(desired.name);
    const res = live
      ? gh(["--method", "PUT", `repos/${repo}/rulesets/${live.id}`, "--input", "-"], body)
      : gh(["--method", "POST", `repos/${repo}/rulesets`, "--input", "-"], body);
    console.log(`factory: ${live ? "updated" : "created"} ruleset "${desired.name}" (id ${(res as { id: number }).id})`);
  } catch (err) {
    if (!isPermissionError(err)) throw err;
    console.error(`factory: cannot write rulesets on ${repo}: ${(err as Error).message}\n`);
    console.log(ownerCommands(desired.name));
    process.exit(2);
  }
  check(desired);
}

const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--check") ? "check" : null;
if (!mode) {
  console.error("usage: tsx scripts/factory-sync.ts --check | --apply");
  process.exit(64);
}
const desired = loadFactory();
try {
  if (mode === "apply") apply(desired);
  else check(desired);
} catch (err) {
  console.error(`factory: ${(err as Error).message}`);
  process.exit(1);
}
