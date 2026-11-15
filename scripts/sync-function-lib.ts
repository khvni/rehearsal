/**
 * Function lib sync: functions/rehearsal-browser/src/lib is a vendored copy of
 * src/lib, so the self-contained Browserbase Function bundle runs the same code.
 *
 *   tsx scripts/sync-function-lib.ts           mirror src/lib into the Function
 *   tsx scripts/sync-function-lib.ts --check   exit 1 if the copy has drifted
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "lib");
const target = path.join(root, "functions", "rehearsal-browser", "src", "lib");
const check = process.argv.includes("--check");

const files = (dir: string): Set<string> =>
  new Set(
    existsSync(dir)
      ? readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
      : [],
  );

const want = files(source);
const have = files(target);
const stale = [...want].filter(
  (f) => have.has(f) && !readFileSync(path.join(source, f)).equals(readFileSync(path.join(target, f))),
);
const missing = [...want].filter((f) => !have.has(f));
const extra = [...have].filter((f) => !want.has(f));
const drift = [
  ...stale.map((f) => `changed: ${f}`),
  ...missing.map((f) => `missing: ${f}`),
  ...extra.map((f) => `extra:   ${f}`),
].sort((a, b) => a.slice(9).localeCompare(b.slice(9)));

if (check) {
  if (drift.length === 0) {
    console.log(`function-lib OK: functions/rehearsal-browser/src/lib matches src/lib (${want.size} files)`);
    process.exit(0);
  }
  console.error(`function-lib drift: ${drift.length} file(s) differ from src/lib\n${drift.map((d) => `  ${d}`).join("\n")}`);
  console.error("\nRun `npm run functions:sync` and commit the result.");
  process.exit(1);
}

for (const f of [...stale, ...missing]) {
  mkdirSync(path.dirname(path.join(target, f)), { recursive: true });
  copyFileSync(path.join(source, f), path.join(target, f));
}
for (const f of extra) rmSync(path.join(target, f));
console.log(
  `function-lib synced: ${stale.length} updated, ${missing.length} added, ${extra.length} removed (${want.size} files)`,
);
