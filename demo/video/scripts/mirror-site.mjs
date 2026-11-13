// Saves rendered HTML + a screenshot of every ai.engineer/code/2026 subpage, plus the static assets they load.
// Usage: node scripts/mirror-site.mjs <outDir>
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const out = process.argv[2] ?? "../aie-snapshot";
const root = "https://ai.engineer/code/2026";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const assets = new Map();
ctx.on("response", async (res) => {
  const u = new URL(res.url());
  if (u.hostname !== "ai.engineer" || res.request().resourceType() === "document" || !res.ok()) return;
  if (assets.has(u.pathname)) return;
  try { assets.set(u.pathname, await res.body()); } catch {}
});
const seen = new Set();
const queue = [root];
const pages = [];
while (queue.length && seen.size < 60) {
  const url = queue.shift();
  const key = url.replace(/#.*$/, "");
  if (seen.has(key)) continue;
  seen.add(key);
  const page = await ctx.newPage();
  try {
    await page.goto(key, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(800);
    const u = new URL(page.url());
    const rel = (u.pathname.replace(/^\/+|\/+$/g, "") || "index") + (u.search ? "/" + u.search.slice(1).replace(/[^\w=-]+/g, "_") : "");
    const file = join(out, "pages", rel, "index.html");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await page.content());
    await page.screenshot({ path: join(out, "pages", rel, "screenshot.png") });
    pages.push({ url: page.url(), file: join("pages", rel, "index.html"), title: await page.title() });
    console.log("saved", page.url());
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    for (const l of links) {
      const lu = new URL(l);
      if (lu.hostname === "ai.engineer" && lu.pathname.startsWith("/code/2026")) queue.push(lu.origin + lu.pathname + lu.search);
    }
  } catch (e) { console.log("fail", key, String(e).slice(0, 120)); }
  await page.close();
}
for (const [p, body] of assets) {
  const file = join(out, "assets", p.replace(/^\/+/, ""));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
}
await writeFile(join(out, "pages.json"), JSON.stringify({ capturedFrom: root, pages, assetCount: assets.size }, null, 2));
console.log("pages", pages.length, "assets", assets.size);
await browser.close();
