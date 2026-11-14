/**
 * Fixture-site loading for the bench harness.
 *
 * A site is `tests/evals/fixtures/<id>.manifest.json` plus its HTML pages
 * (single file or a directory). `serveSite` mounts the pages on a loopback
 * origin so the pipeline sees real, same-origin URLs; unmapped paths either
 * 404 or get a deterministic stub page (manifest.stubMissing), matching the
 * spec-delta convention.
 */
import { createServer, type Server } from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { FixtureSiteManifest } from "@/lib/contracts";

export const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures");

/** A parsed manifest with its page HTML resolved. */
export interface FixtureSite {
  manifest: FixtureSiteManifest;
  /** Manifest directory — page files resolve relative to it. */
  dir: string;
  /** URL path -> page HTML. */
  pages: Map<string, string>;
}

export function loadManifests(fixturesDir: string = FIXTURES_DIR): FixtureSiteManifest[] {
  if (!existsSync(fixturesDir)) return [];
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".manifest.json"))
    .sort()
    .map((f) =>
      FixtureSiteManifest.parse(
        JSON.parse(readFileSync(path.join(fixturesDir, f), "utf8")),
      ),
    );
}

export function loadSite(manifest: FixtureSiteManifest, fixturesDir: string = FIXTURES_DIR): FixtureSite {
  const pages = new Map<string, string>();
  for (const [urlPath, file] of Object.entries(manifest.pages)) {
    const abs = path.join(fixturesDir, file);
    if (!existsSync(abs)) throw new Error(`${manifest.id}: missing page file ${file}`);
    pages.set(normalizePath(urlPath), readFileSync(abs, "utf8"));
  }
  if (!pages.has(normalizePath(manifest.mountPath))) {
    throw new Error(`${manifest.id}: no page mapped at mountPath ${manifest.mountPath}`);
  }
  return { manifest, dir: fixturesDir, pages };
}

/** Default bench config — small enough for evals, large enough to be meaningful. */
export const BENCH_DEFAULTS = {
  maxStates: 12,
  maxDepth: 3,
  trajectories: 200,
  verifyCount: 2,
  viewports: ["desktop" as const],
};

export const BENCH_SEED = 1337;

function normalizePath(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Deterministic stub for unmapped subpaths (spec-delta convention). */
function stubPage(site: FixtureSite, urlPath: string): string {
  const slug = urlPath
    .slice(normalizePath(site.manifest.mountPath).length + 1)
    .split("/")
    .filter(Boolean)
    .join(" / ")
    .replace(/-/g, " ");
  const name = escapeHtml(slug || "page");
  return (
    `<!doctype html><html><head><title>${name} — ${escapeHtml(site.manifest.name)}</title></head>` +
    `<body><nav><a href="${site.manifest.mountPath}">${escapeHtml(site.manifest.name)}</a></nav>` +
    `<main><h1>${name}</h1><p>${name} — ${escapeHtml(site.manifest.name)}.</p></main></body></html>`
  );
}

/** Page HTML for a request path; null when unmapped and stubs are off. */
export function pageFor(site: FixtureSite, urlPath: string): string | null {
  const p = normalizePath(urlPath);
  const html = site.pages.get(p);
  if (html !== undefined) return html;
  if (site.manifest.stubMissing && p.startsWith(normalizePath(site.manifest.mountPath))) {
    return stubPage(site, p);
  }
  return null;
}

export interface ServedSite {
  server: Server;
  origin: string;
  /** Absolute URL of the site's start page. */
  targetUrl: string;
  close: () => Promise<void>;
}

/**
 * Mounts the site on 127.0.0.1 with a self-only response shape:
 * mapped paths -> fixture HTML, /robots.txt -> allow-all, else 404.
 */
export function serveSite(site: FixtureSite): Promise<ServedSite> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    const html = pageFor(site, url.pathname);
    if (html !== null) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html);
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const origin = `http://127.0.0.1:${port}`;
      resolve({
        server,
        origin,
        targetUrl: `${origin}${site.manifest.mountPath}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    }),
  );
}
