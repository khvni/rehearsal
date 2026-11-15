import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { Experiment, type LlmClient } from "../../src/lib/contracts";
import { extractPage } from "../../src/lib/browser/extract";
import { decodeCloudflareEmail } from "../../src/lib/site-links";
import {
  buildPage,
  deterministicPlan,
  lintRebuiltPage,
  planSite,
  renderSiteDocument,
  rewriteSiteLinks,
  sitemapFromGraph,
} from "../../src/lib/rebuild/site";
import { rollupBrand } from "../../src/lib/rebuild/brand";

const origin = "https://example.com";
const base = "/experiments/exp_email/rb";
const email = "team+contact@example.com";
const encode = (text: string) =>
  [0x42, ...Buffer.from(text).map((byte) => byte ^ 0x42)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const encoded = encode(email);
const protection = `/cdn-cgi/l/email-protection#${encoded}`;
const opts = { origin, base };
const links = (html: string) => [
  ...parseHTML(`<html><body>${html}</body></html>`).document.querySelectorAll(
    "a",
  ),
];
const fake = (output = ""): LlmClient => ({
  name: "openrouter",
  complete: vi.fn(async () => output),
});
function fixture() {
  return Experiment.parse({
    configuration: {},
    id: "exp_email",
    targetUrl: origin,
    goal: "Contact team",
    createdAt: "2026-01-01T00:00:00Z",
    status: "complete",
    graph: {
      states: [
        {
          stateId: "s0",
          stateHash: "h0",
          url: origin + "/",
          pageTitle: "Contact",
          visibleText: "Contact the team for more information.",
          viewport: { name: "desktop", width: 1280, height: 900 },
          actions: [],
        },
      ],
      edges: [],
    },
  });
}

describe("Cloudflare email facts and rebuilt links", () => {
  it("decodes CF XOR bytes including UTF-8 and never accepts malformed or unsafe addresses", () => {
    expect(decodeCloudflareEmail(encoded)).toBe(email);
    expect(decodeCloudflareEmail(encode("tést@example.com"))).toBe(
      "tést@example.com",
    );
    for (const value of [
      undefined,
      "",
      "42",
      "123",
      "zzzz",
      "42ff",
      encode("not an email"),
      encode("team@example.com?subject=injected"),
      encode("team@example.com\r\nBcc:evil@example.com"),
      "42".repeat(2000),
    ])
      expect(decodeCloudflareEmail(value)).toBeUndefined();
  });
  it("extracts real mailto actions and readable text from href fragments and data-cfemail spans", () => {
    const result = extractPage(
      `<h1>Contact</h1><p><a href="${protection}">[email&nbsp;protected]</a></p><a href="/cdn-cgi/l/email-protection"><span class="__cf_email__" data-cfemail="${encoded}">[email protected]</span></a><p><span class="__cf_email__" data-cfemail="${encoded}">[email protected]</span></p><a href="${protection}">Contact team</a>`,
      origin,
    );
    expect(result.visibleText).toContain(email);
    expect(result.visibleText).not.toMatch(/email\s*protected/);
    expect(result.actions.map((a) => a.href)).toEqual([
      `mailto:${email}`,
      `mailto:${email}`,
    ]);
    expect(result.actions.map((a) => a.label)).toEqual([email, "Contact team"]);
    expect(result.actions.every((a) => !a.safeToExecute)).toBe(true);
    const heading = extractPage(
      `<h1><a href="/cdn-cgi/l/email-protection#bad">[email protected]</a> and <a href="${protection}">[email protected]</a></h1>`,
      origin,
    );
    expect(heading.headings[0]).toBe(`[email protected] and ${email}`);
    expect(
      extractPage(
        '<a href="/cdn-cgi/l/email-protection#bad">Email us</a>',
        origin,
      ).actions,
    ).toEqual([]);
    expect(
      extractPage('<span data-cfemail="bad">[email protected]</span>', origin)
        .visibleText,
    ).toBe("[email protected]");
    expect(extractPage("", origin).actions).toEqual([]);
  });
  it("decodes links and markup, strips only undecodable email hrefs and preserves readable labels", () => {
    const output = rewriteSiteLinks(
      `<a href="${protection}">Contact team</a><a href="${base}${protection}">Email us</a><a href="/cdn-cgi/l/email-protection"><span data-cfemail="${encoded}">[email protected]</span></a><a href="/cdn-cgi/l/email-protection#invalid">Keep this text</a>`,
      opts,
    );
    expect(links(output).map((a) => a.getAttribute("href"))).toEqual([
      `mailto:${email}`,
      `mailto:${email}`,
      `mailto:${email}`,
      null,
    ]);
    expect(output).toContain("Keep this text");
    expect(output).not.toContain("[email protected]");
    expect(
      rewriteSiteLinks(
        `<a href="${protection}"><em>[email protected]</em></a>`,
        opts,
      ),
    ).toContain(`<em>${email}</em>`);
    expect(rewriteSiteLinks(output, opts)).toBe(output);
    expect(rewriteSiteLinks("", opts)).toBe("");
  });
  it("keeps infrastructure and non-page assets on their original absolute URLs, including old rebuilt paths", () => {
    for (const path of [
      "/cdn-cgi/challenge-platform/script",
      "/guide.md",
      "/guide%2Emd",
      "/guide.PDF",
      "/logo.png",
      "/photo.avif",
      "/data.json",
      "/file.zip",
      "/style.css",
      "/font.woff2",
    ]) {
      for (const prefix of ["", base]) {
        const html = rewriteSiteLinks(
          `<a href="${prefix}${path}?download=1#part">Download</a>`,
          opts,
        );
        expect(links(html)[0].getAttribute("href")).toBe(
          `${origin}${path}?download=1#part`,
        );
        expect(lintRebuiltPage(html, opts)).not.toContain(
          "internal link outside rebuild",
        );
      }
    }
    expect(
      links(
        rewriteSiteLinks('<a href="/resources">Read</a>', opts),
      )[0].getAttribute("href"),
    ).toBe(base + "/resources");
    expect(
      lintRebuiltPage(`<a href="${base}/cdn-cgi/l/email-protection">Bad</a>`),
    ).toContain("cdn-cgi link inside rebuild");
    expect(
      lintRebuiltPage('<a href="https://example.com/guide.pdf">PDF</a>', opts),
    ).toEqual([]);
  });
  it("normalizes cached actions for planner/implementer facts, template fallback and the footer", async () => {
    const exp = fixture();
    const state = exp.graph!.states[0];
    state.actions = [protection, "/cdn-cgi/l/email-protection"].map(
      (href, i) => ({
        actionId: `a${i}`,
        stateId: state.stateId,
        type: "click",
        label: i ? "Broken contact" : "[email protected]",
        href,
        enabled: true,
        safeToExecute: true,
      }),
    );
    const site = deterministicPlan(exp);
    expect(site.footer.links).toEqual([
      { label: email, href: `mailto:${email}` },
    ]);
    const planner = fake(JSON.stringify(site));
    await planSite(exp, planner);
    const prompt = vi.mocked(planner.complete).mock.calls[0][0];
    expect(prompt).toContain(`mailto:${email}`);
    expect(prompt).not.toContain("cdn-cgi");
    expect(prompt).not.toContain("[email protected]");
    site.footer.links = [];
    const implementer = fake();
    const page = await buildPage(exp, site, site.pages[0], implementer);
    expect(page.source).toBe("template");
    expect(vi.mocked(implementer.complete).mock.calls[0][0]).toContain(
      `mailto:${email}`,
    );
    expect(vi.mocked(implementer.complete).mock.calls[0][0]).not.toContain(
      "cdn-cgi",
    );
    expect(page.html).toContain(`href="mailto:${email}"`);
    expect(page.html).not.toContain("cdn-cgi");
  });
  it("decodes implementer markup before sanitizer removes data attributes and repairs stored pages/nav/footer on serving", async () => {
    const exp = fixture();
    const site = deterministicPlan(exp);
    const page = await buildPage(
      exp,
      site,
      site.pages[0],
      fake(
        `<h1>Contact</h1><a href="/cdn-cgi/l/email-protection"><span data-cfemail="${encoded}">[email protected]</span></a>`,
      ),
    );
    expect(page.html).toContain(`href="mailto:${email}"`);
    expect(page.html).toContain(email);
    site.pages[0] = {
      ...page,
      html: `<h1>Stored</h1><a href="${base}/cdn-cgi/l/email-protection">Contact team</a>`,
    };
    site.nav = [
      { label: "Markdown", path: "/guide.md" },
      { label: "Contact", path: protection },
    ];
    site.footer.links = [{ label: "Email us", href: protection }];
    exp.rebuild = {
      site,
      brand: rollupBrand(exp.graph!.states),
      generatedAt: exp.createdAt,
      goals: [],
      pages: [],
      llm: "fixture",
    };
    const doc = renderSiteDocument(exp);
    expect(doc).not.toContain("/rb/cdn-cgi/");
    expect(doc).not.toContain("/rb/guide.md");
    expect(doc).toContain(`href="${origin}/guide.md"`);
    expect(doc).toContain(`href="mailto:${email}"`);
    expect(doc).toContain("Contact team");
  });
  it("does not resurrect captured non-page states or brand navigation as site pages", () => {
    const exp = fixture();
    const state = exp.graph!.states[0];
    state.brand = {
      cssVars: {},
      colors: [],
      fonts: [],
      navItems: [
        { label: "Email", href: protection },
        { label: "Markdown", href: "/guide.md" },
      ],
    };
    for (const path of [
      "/cdn-cgi/l/email-protection",
      "/guide.md",
      "/file.pdf",
    ])
      exp.graph!.states.push({ ...state, url: origin + path });
    expect(sitemapFromGraph(exp).map((p) => p.path)).toEqual(["/"]);
    expect(deterministicPlan(exp).nav).toEqual([
      { label: "Contact", path: "/" },
    ]);
  });
});
