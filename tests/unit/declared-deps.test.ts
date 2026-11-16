import { describe, expect, it } from "vitest";
import { builtinModules } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const SRC = path.join(root, "src");

/** A package's own name from a bare specifier: `entities` or `@scope/name`, minus any subpath. */
const packageName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) yield p;
  }
}

/** Bare module specifiers imported by a source file (`from "x"`, `import "x"`, `import("x")`). */
function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec.startsWith(".") || spec.startsWith("@/") || BUILTINS.has(spec)) continue;
    out.push(packageName(spec));
  }
  return out;
}

describe("declared dependencies", () => {
  it("every package imported by src/ is declared in package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const missing = new Map<string, string[]>();
    for (const file of sources(SRC)) {
      for (const name of imports(file)) {
        if (declared.has(name)) continue;
        const files = missing.get(name) ?? [];
        files.push(path.relative(root, file));
        missing.set(name, files);
      }
    }
    expect(
      [...missing.entries()].map(([name, files]) => `${name} (imported by ${files.join(", ")})`),
      "these imports resolve only because another package happens to pull them in transitively",
    ).toEqual([]);
  });
});
