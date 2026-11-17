/** No paid models or browser services: exercise the real builder and shell. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Experiment, type LlmClient } from "../src/lib/contracts";
import { rollupBrand } from "../src/lib/rebuild/brand";
import { buildPage, deterministicPlan, renderSiteDocument, siteStylesheet } from "../src/lib/rebuild/site";

async function main() {
  const origin = "https://fixture.example";
  const exp = Experiment.parse({
    id: "exp_wireframe_design", targetUrl: origin,
    goal: "Find a workshop, compare the available sessions and read the preparation guide.",
    createdAt: "2026-01-01T00:00:00.000Z", status: "complete", configuration: {},
    graph: { edges: [], states: [
      { stateId: "home", stateHash: "home", url: origin, pageTitle: "Workshop directory", visibleText: "Find a practical workshop. Choose a session and read what to prepare.", actions: [] },
      { stateId: "sessions", stateHash: "sessions", url: `${origin}/sessions`, pageTitle: "Compare sessions", visibleText: "Morning and afternoon workshops cover different tasks. Choose the one that matches your experience.", actions: [] },
      { stateId: "guide", stateHash: "guide", url: `${origin}/guide`, pageTitle: "Preparation guide", visibleText: "Bring a laptop and a page you want to improve. Read the preparation steps before your workshop.", actions: [] },
    ].map(state => ({ ...state, viewport: { name: "desktop", width: 1280, height: 800 } })) },
  });
  const documents = [
    `<section class="rb-section rb-hero"><div class="rb-container rb-stack"><h1>Workshop directory</h1><p class="rb-lede">Choose a session and read what to prepare.</p><a class="rb-btn rb-btn--primary" href="${origin}/sessions">Compare sessions</a></div></section><section class="rb-section"><div class="rb-container"><h2>Before you arrive</h2><ul class="rb-index"><li class="rb-index-item"><a class="rb-index-title" href="${origin}/guide">Preparation guide</a><p>What to bring and how to choose a page to work on.</p></li></ul></div></section>`,
    `<section class="rb-section"><div class="rb-container rb-stack"><h1>Compare sessions</h1><p>Choose the workshop that matches your experience.</p><table class="rb-table"><caption>Workshop options</caption><thead><tr><th scope="col">Session</th><th scope="col">Focus</th><th scope="col">Preparation</th></tr></thead><tbody><tr><th scope="row">Morning</th><td>Navigation and page hierarchy</td><td>A page to improve</td></tr><tr><th scope="row">Afternoon</th><td>Forms and feedback</td><td>A laptop</td></tr></tbody></table><details class="rb-faq"><summary>What should I bring?</summary><p>Bring a laptop and a page you want to improve.</p></details><a href="${origin}/guide">Read the preparation guide</a></div></section>`,
    `<section class="rb-section"><div class="rb-container rb-narrow rb-stack"><h1>Preparation guide</h1><article class="rb-prose"><p>Bring a laptop and a page you want to improve. Choose a page where a visitor has a specific task to complete.</p><h2>Choose a task</h2><p>Write down the task in the words a visitor would use. Keep it specific enough that you can tell when it is complete.</p><h2>Bring an example</h2><p>Open the page before the workshop. You will use it to compare the original layout with a proposed alternative.</p><a href="${origin}/sessions">Compare workshop sessions</a></article></div></section>`,
  ];
  const site = deterministicPlan(exp);
  for (const [index, page] of site.pages.entries()) {
    const llm: LlmClient = { name: "gemini-fixture", complete: async () => documents[index] };
    const built = await buildPage(exp, site, page, llm);
    if (built.source === "template" || built.issues?.length)
      throw new Error(`Design fixture rejected: ${page.path}: ${built.issues?.join(", ")}`);
    site.pages[index] = built;
  }
  exp.rebuild = { site, brand: rollupBrand(exp.graph!.states), generatedAt: exp.createdAt, goals: [], pages: [], llm: "gemini-fixture" };

  const directory = resolve("data/design-check/rebuild");
  mkdirSync(directory, { recursive: true });
  const files = site.pages.map((page, index) => {
    const file = resolve(directory, `${index}.html`);
    const html = renderSiteDocument(exp, page.path).replace(/<link rel="stylesheet"[^>]+>/, `<style>${siteStylesheet(site.tokens)}</style>`);
    writeFileSync(file, html);
    return file;
  });
  // Include the actual deterministic fallback in the same design gate.
  site.pages[0] = await buildPage(exp, site, site.pages[0], { name: "gemini-fixture", complete: async () => "" });
  const fallbackFile = resolve(directory, "fallback.html");
  writeFileSync(fallbackFile, renderSiteDocument(exp).replace(/<link rel="stylesheet"[^>]+>/, `<style>${siteStylesheet(site.tokens)}</style>`));
  files.push(fallbackFile);
  console.log(`Generated ${files.length} synthetic wireframe documents in ${directory}`);

  if (!process.argv.includes("--generate-only")) {
    const rendered = process.argv.includes("--rendered");
    for (const viewport of rendered ? ["1280x800", "390x844"] : [undefined]) {
      const result = spawnSync("sh", [".devin/skills/impeccable/scripts/impeccable", "detect",
        ...(viewport ? ["--viewport", viewport] : []),
        ...files.map(file => rendered ? pathToFileURL(file).href : file),
      ], { stdio: "inherit", env: process.env });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
