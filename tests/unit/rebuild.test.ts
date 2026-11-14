import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Experiment, RebuildResult, type LlmClient, type SiteState } from "@/lib/contracts";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import {
  MAX_REBUILD_GOALS,
  brandSignalsFromHtml,
  captureBrand,
  generateRebuild,
  inferGoals,
  mergeSignals,
  renderGoalPage,
  rollupBrand,
  sanitizeRebuildHtml,
  seedPageContent,
} from "@/lib/rebuild";

const AIE_URL = "https://ai.engineer/code/2026";
const aieHtml = readFileSync(path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html"), "utf8");
const URL0 = "https://example.com/";

const SYNTH_HTML = `<!doctype html><html><head><title>Pricing | Acme</title>
<meta name="theme-color" content="#0055FF"><meta property="og:site_name" content="Acme">
<link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/touch.png">
<style>:root{--brand:#0055ff;--bg:#ffffff;--fg:#111}body{font-family:"Inter", sans-serif;color:#111}
h1{font-family:"Inter", sans-serif;color:rgb(0, 85, 255)}code{font-family:Menlo, monospace}</style></head>
<body><header><a href="/"><img class="site-logo" src="/logo.svg" alt="Acme logo"></a>
<nav><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="https://evil.com/x">Off-site</a><a href="javascript:alert(1)">JS</a><a href="#">Hash</a></nav></header>
<h1>Acme</h1><button>Book a demo</button></body></html>`;

function state(id: string, url: string, title: string, text: string, actions: SiteState["actions"], brand?: SiteState["brand"]): SiteState {
  return { stateId: id, url, viewport: { name: "desktop", width: 1440, height: 900 }, pageTitle: title, visibleText: text, actions, stateHash: id, brand };
}

function action(stateId: string, n: number, label: string, href?: string, role = "link"): SiteState["actions"][number] {
  return { actionId: `${stateId}_a${n}`, stateId, type: "click", label, role, href, enabled: true, safeToExecute: true };
}

function synthExperiment(): Experiment {
  const brand = brandSignalsFromHtml(SYNTH_HTML, URL0);
  const home = state(
    "s0",
    URL0,
    "Acme — ship faster",
    "Acme helps engineering teams ship reliable software every single week.\nRegistration is now open for the spring cohort.\nOur platform connects your repositories, tests and deploys in one place.\nThe 2024 launch event recap is available for everyone who missed it live.\nTrusted by teams building production systems at every scale today.",
    [
      action("s0", 1, "Book a demo", "https://example.com/demo", "button"),
      action("s0", 2, "Sign up", "https://example.com/signup"),
      action("s0", 3, "Pricing", "https://example.com/pricing"),
      action("s0", 4, "Docs", "https://example.com/docs"),
    ],
    brand,
  );
  const pricing = state(
    "s1",
    "https://example.com/pricing",
    "Pricing | Acme",
    "Plans scale with your team, from a free tier to enterprise contracts.\nEvery plan includes unlimited repositories and community support access.",
    [action("s1", 1, "Book a demo", "https://example.com/demo", "button"), action("s1", 2, "Contact sales", "https://example.com/contact")],
    brand,
  );
  return Experiment.parse({
    id: "exp_rebuild",
    targetUrl: URL0,
    goal: "Book a demo",
    status: "complete",
    createdAt: "2026-01-01T00:00:00.000Z",
    configuration: {},
    graph: { states: [home, pricing], edges: [] },
    endpoints: [
      { endpointId: "e1", class: "contact-form", url: "https://example.com/demo", label: "Book a demo", weight: 0.9, intent: ["proposal"] },
      { endpointId: "e2", class: "pricing", url: "https://example.com/pricing", label: "Pricing", weight: 0.8, intent: ["quotation"] },
      { endpointId: "e3", class: "docs-answers", url: "https://example.com/docs", label: "Docs", weight: 0.5, intent: ["information"] },
    ],
    findings: [
      {
        findingId: "f1", title: "Stale date on the homepage", category: "clarity", severity: "medium", evidenceType: "reproducible-concern",
        description: "Homepage references an outdated 2024 event.", affectedStates: ["s0"], recommendation: "Remove outdated dates.",
        verificationStatus: "reproduced", krugPrinciple: "dont-make-me-think",
      },
    ],
    spec: {
      targetUrl: URL0, goal: "Book a demo", generatedAt: "2026-01-01T00:00:00.000Z", summary: "s",
      changes: [{ rank: 1, title: "Remove stale dates", change: "Drop the 2024 recap", rationale: "r", effort: "S" }],
      rebuildPhases: [],
    },
  });
}

describe("brandSignalsFromHtml", () => {
  it("parses declared signals from a small page", () => {
    const s = brandSignalsFromHtml(SYNTH_HTML, URL0);
    expect(s.cssVars).toEqual({ "--brand": "#0055ff", "--bg": "#ffffff", "--fg": "#111" });
    expect(s.themeColor).toBe("#0055FF");
    expect(s.siteName).toBe("Acme");
    expect(s.faviconUrl).toBe("https://example.com/favicon.png");
    expect(s.logoUrl).toBe("https://example.com/logo.svg");
    expect(s.logoAlt).toBe("Acme logo");
    expect(s.navItems).toEqual([
      { label: "Pricing", href: "https://example.com/pricing" },
      { label: "Docs", href: "https://example.com/docs" },
    ]);
    expect(s.colors.slice(0, 2)).toEqual(["#0055ff", "#111111"]);
    expect(s.fonts[0]).toBe('"Inter", sans-serif');
    expect(s.fonts).toContain("Menlo, monospace");
  });

  it("extracts the AIE fixture's design language within caps and never throws", () => {
    const s = brandSignalsFromHtml(aieHtml, AIE_URL);
    expect(s.faviconUrl).toBe("https://ai.engineer/favicon.ico");
    expect(s.themeColor).toBe("#ffffff");
    expect(s.colors).toContain("#f8df8c");
    expect(s.colors.length).toBeLessThanOrEqual(24);
    expect(s.navItems.length).toBeGreaterThan(3);
    expect(s.navItems.length).toBeLessThanOrEqual(20);
    expect(s.navItems.every((n) => n.href.startsWith("https://ai.engineer/"))).toBe(true);
    expect(Object.keys(s.cssVars).length).toBeLessThanOrEqual(64);
    expect(brandSignalsFromHtml(undefined as unknown as string, "not a url")).toMatchObject({ colors: [], navItems: [] });
  });
});

describe("captureBrand + mergeSignals", () => {
  it("never throws and validates the evaluate result", async () => {
    expect(await captureBrand({ evaluate: async () => { throw new Error("boom"); } })).toBeUndefined();
    expect(await captureBrand({ evaluate: async () => "nope" })).toBeUndefined();
    const got = await captureBrand({ evaluate: async () => ({ cssVars: {}, colors: ["rgb(17, 17, 17)", "rgba(0, 0, 0, 0)"], fonts: ["Inter, sans-serif"], navItems: [] }) });
    expect(got?.colors).toEqual(["#111111"]);
  });

  it("computed layer wins per field and unions lists", () => {
    const base = brandSignalsFromHtml(SYNTH_HTML, URL0);
    const merged = mergeSignals(base, { cssVars: { "--brand": "#ff0000" }, colors: ["#ff0000"], fonts: [], navItems: [{ label: "Blog", href: "https://example.com/blog" }], siteName: "Acme Inc" });
    expect(merged.cssVars["--brand"]).toBe("#ff0000");
    expect(merged.siteName).toBe("Acme Inc");
    expect(merged.faviconUrl).toBe(base.faviconUrl);
    expect(merged.colors).toContain("#ff0000");
    expect(merged.colors).toContain("#0055ff");
    expect(merged.navItems.map((n) => n.label)).toEqual(["Blog", "Pricing", "Docs"]);
    expect(mergeSignals(base, undefined)).toBe(base);
  });
});

describe("rollupBrand", () => {
  it("dedupes across states and is deterministic", () => {
    const exp = synthExperiment();
    const a = rollupBrand(exp.graph!.states);
    const b = rollupBrand(structuredClone(exp.graph!.states));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.name).toBe("Acme");
    expect(a.navItems).toHaveLength(2);
    expect(a.colors).toMatchObject({ ink: "#111111", surface: "#ffffff", accent: "#0055ff" });
    expect(a.fonts.sans).toContain("Inter");
    expect(a.fonts.mono).toContain("Menlo");
    expect(a.ctaLabels).toEqual(expect.arrayContaining(["Book a demo", "Sign up", "Contact sales"]));
    expect(a.ctaLabels.filter((l) => l === "Book a demo")).toHaveLength(1);
    expect(a.ctaLabels).not.toContain("Docs");
    expect(a.ctaLabels.length).toBeLessThanOrEqual(12);
  });

  it("falls back to title, hostname and a neutral palette without signals", () => {
    const bare = rollupBrand([state("s", "https://www.foo.dev/", "Home | Foo", "", [])]);
    expect(bare.name).toBe("Foo");
    expect(bare.colors).toMatchObject({ ink: "#111111", surface: "#ffffff", muted: "#6b6b6b", line: "#ededed" });
    expect(bare.fonts.sans).toContain("system-ui");
    expect(rollupBrand([]).name).toBe("Site");
  });
});

describe("inferGoals", () => {
  it("puts the experiment goal first, maps CTAs, dedupes and slugs uniquely", () => {
    const goals = inferGoals(synthExperiment());
    expect(goals[0]).toMatchObject({ source: "experiment-goal", goal: "Book a demo", weight: 1, targetUrl: "https://example.com/demo" });
    expect(goals.length).toBeLessThanOrEqual(MAX_REBUILD_GOALS);
    expect(goals.filter((g) => g.goal.toLowerCase() === "book a demo")).toHaveLength(1);
    expect(goals.find((g) => g.source === "cta" && g.sourceLabel === "Sign up")?.targetUrl).toBe("https://example.com/signup");
    const slugs = goals.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of goals) {
      expect(g.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(g.goalId).toMatch(/^goal_[0-9a-f]{8}$/);
      expect(g.weight).toBeGreaterThanOrEqual(0);
      expect(g.weight).toBeLessThanOrEqual(1);
    }
    const rest = goals.slice(1).map((g) => g.weight);
    expect([...rest].sort((x, y) => y - x)).toEqual(rest);
    expect(JSON.stringify(inferGoals(synthExperiment()))).toBe(JSON.stringify(goals));
  });

  it("adds implied goals when the crawl is empty", () => {
    const exp = Experiment.parse({ id: "e", targetUrl: URL0, goal: "Find the schedule", status: "created", createdAt: "x", configuration: {} });
    const goals = inferGoals(exp);
    expect(goals[0].source).toBe("experiment-goal");
    expect(goals.some((g) => g.source === "implied")).toBe(true);
  });
});

describe("renderGoalPage + sanitize", () => {
  const exp = synthExperiment();
  const brand = rollupBrand(exp.graph!.states);
  const goal = inferGoals(exp)[0];

  it("escapes every string and emits no script", () => {
    const content = seedPageContent(exp, goal);
    content.hero.heading = '<script>alert("x")</script>';
    content.hero.lede = '"><img src=x onerror=alert(1)>';
    content.sections.push({ heading: "<b>bold</b>", bullets: ["a & b"], links: [{ label: "bad", url: "javascript:alert(1)" }] });
    const html = renderGoalPage({ brand: { ...brand, name: "</title><script>x</script>" }, goal, experiment: exp, content });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/class="cta"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="icon" href="https://example.com/favicon.png">');
    expect(html).toContain('src="https://example.com/logo.svg"');
  });

  it("drops off-origin brand assets and caps nav at 6", () => {
    const content = seedPageContent(exp, goal);
    content.nav = Array.from({ length: 9 }, (_, i) => ({ label: `N${i}`, url: `https://example.com/n${i}` }));
    const html = renderGoalPage({ brand: { ...brand, logoUrl: "https://cdn.evil.com/logo.png", faviconUrl: "https://evil.com/f.ico" }, goal, experiment: exp, content });
    expect(html).not.toContain("evil.com");
    expect(html.match(/<nav[\s\S]*?<\/nav>/)?.[0].match(/<li>/g)).toHaveLength(6);
  });

  it("sanitizer strips scripts, handlers, js: hrefs and off-origin resources", () => {
    const dirty = `<p onclick="x()">hi</p><script>bad()</script><iframe src="https://a.com"></iframe><object data="x"></object><embed src="y">
<a href=" jav&#x61;script:alert(1)">x</a><img src="https://cdn.other.com/a.png"><img src="https://example.com/ok.png" srcset="https://o.com/b.png 2x">
<link rel="stylesheet" href="https://fonts.other.com/x.css"><scr<script>x</script>ipt>y</script><div style="background:url(https://t.com/p.gif)">z</div>`;
    const out = sanitizeRebuildHtml(dirty, { imageOrigins: ["https://example.com"] });
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|onclick|javascript|jav&#x61;|other\.com|o\.com|t\.com/i);
    expect(out).toContain('<img src="https://example.com/ok.png">');
    expect(out).toContain("<p>hi</p>");
  });
});

describe("generateRebuild", () => {
  it("is deterministic with the fixture LLM and uses templates", async () => {
    const exp = synthExperiment();
    const a = await generateRebuild(exp, new FixtureLlmClient());
    const b = await generateRebuild(synthExperiment(), new FixtureLlmClient());
    expect(RebuildResult.safeParse(a).success).toBe(true);
    expect(a.llm).toBe("gemini-fixture");
    expect(a.pages).toHaveLength(a.goals.length);
    expect(a.pages.every((p) => p.source === "template")).toBe(true);
    expect(JSON.stringify(a.pages)).toBe(JSON.stringify(b.pages));
    expect(JSON.stringify(a.goals)).toBe(JSON.stringify(b.goals));
    for (const p of a.pages) {
      expect(p.bytes).toBe(p.html.length);
      expect(p.html).not.toMatch(/<script/i);
    }
    const first = a.pages[0].html;
    expect(first).toContain('href="https://example.com/demo"');
    expect(first).toContain("Registration is now open");
    // stale-date finding: lines citing a year before the experiment's are dropped
    expect(first).not.toContain("2024 launch event");
  });

  it("uses valid LLM copy (source gemini) and ignores invented URLs", async () => {
    const exp = synthExperiment();
    const goals = inferGoals(exp);
    let calls = 0;
    const llm: LlmClient = {
      name: "gemini",
      async complete(_prompt, opts) {
        calls++;
        expect(opts).toMatchObject({ deep: true, json: true });
        return JSON.stringify({
          pages: [
            {
              slug: goals[0].slug,
              hero: { heading: "See Acme in 20 minutes", lede: "A walkthrough with an engineer.", ctaLabel: "Book your demo", ctaUrl: "https://invented.example.org/x" },
              sections: [{ heading: "What you get", bullets: ["Live walkthrough"], links: [{ label: "Fake", url: "https://invented.example.org/y" }] }],
              nav: [{ label: "Pricing", url: "https://example.com/pricing" }],
            },
            { slug: "bogus", hero: { heading: "" } },
          ],
        });
      },
    };
    const res = await generateRebuild(exp, llm);
    expect(calls).toBe(1);
    expect(res.llm).toBe("gemini");
    const page = res.pages[0];
    expect(page.source).toBe("gemini");
    expect(page.html).toContain("See Acme in 20 minutes");
    expect(page.html).toContain("Book your demo");
    expect(page.html).toContain('class="cta" href="https://example.com/demo"');
    expect(page.html).not.toContain("invented.example.org");
    expect(res.pages.slice(1).every((p) => p.source === "template")).toBe(true);
  });

  it("falls back to templates on invalid JSON or a throwing client", async () => {
    const bad: LlmClient = { name: "gemini", complete: async () => "not json {" };
    const throws: LlmClient = { name: "gemini", complete: async () => { throw new Error("429"); } };
    const fixture = await generateRebuild(synthExperiment(), new FixtureLlmClient());
    for (const llm of [bad, throws]) {
      const res = await generateRebuild(synthExperiment(), llm);
      expect(res.pages.every((p) => p.source === "template")).toBe(true);
      expect(res.pages.map((p) => p.html)).toEqual(fixture.pages.map((p) => p.html));
    }
  });
});
