import { afterEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { extractPage, isSameOrigin } from "../../src/lib/browser/extract";
import { executeTrajectory, withTimeout } from "../../src/lib/browser/playwright";
import { StagehandRunner } from "../../src/lib/browser/stagehand";
import { PlainFetcher } from "../../src/lib/fetch";
import { fetchPublic, parseRobots, robotsAllowsPath } from "../../src/lib/fetch/guards";

const PAGE = "https://example.com/pricing";

describe("extractPage on real-world link shapes", () => {
  const html = `<title>Pricing</title>
    <a href="#plans">Plans</a>
    <a href="/pricing#faq">FAQ</a>
    <a href="/docs#install">Docs</a>
    <a href="/whitepaper.pdf">Whitepaper</a>
    <a href="mailto:sales@example.com">Email sales</a>
    <a href="tel:+15550100">Call us</a>
    <a href="https://other.example.org/x">Partner</a>`;
  const { actions } = extractPage(html, PAGE);
  const byLabel = new Map(actions.map((a) => [a.label, a]));

  it("drops same-page anchors and strips fragments from crawlable links", () => {
    expect(byLabel.has("Plans")).toBe(false);
    expect(byLabel.has("FAQ")).toBe(false);
    expect(byLabel.get("Docs")).toMatchObject({ type: "click", href: "https://example.com/docs", safeToExecute: true });
  });

  it("never marks downloads, mailto/tel or off-origin links as crawlable", () => {
    for (const label of ["Whitepaper", "Email sales", "Call us", "Partner"]) {
      expect(byLabel.get(label)).toMatchObject({ type: "navigate", safeToExecute: false });
    }
  });

  it("caps giant documents instead of scanning them whole", () => {
    const giant = `<title>Big</title>${"<p>x</p>".repeat(400_000)}<a href="/late">Late</a>`;
    expect(extractPage(giant, PAGE).actions.some((a) => a.label === "Late")).toBe(false);
  });

  it.each([
    ["unclosed <head", "<head".repeat(200_000)],
    ["unclosed <head>", "<head>".repeat(300_000)],
    ["deep <div> nesting with stray closes", "<div>".repeat(200_000) + "</span>".repeat(200_000)],
    ["unclosed anchors", '<a href="/x">'.repeat(150_000)],
    ["unclosed headings", "<h1>x".repeat(300_000)],
  ])("stays linear on hostile markup: %s", (_name, hostile) => {
    const started = performance.now();
    extractPage(hostile, PAGE);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("decodes entities and keeps unclosed anchors and buttons", () => {
    const page = extractPage(
      `<title>A &amp; B</title><h2>Don&#x27;t</h2><a href="/q?a=1&amp;b=2">Go`,
      PAGE,
    );
    expect(page.title).toBe("A & B");
    expect(page.headings).toEqual(["Don't"]);
    expect(page.actions[0]).toMatchObject({ label: "Go", href: "https://example.com/q?a=1&b=2" });
  });

  it("keeps SVG and script text out of labels and the page title", () => {
    const page = extractPage(
      `<body><a href="/docs"><svg><title>Arrow icon</title></svg>Docs<script>x()</script></a>` +
        `<button><svg><title>Close icon</title></svg></button><title>Real</title>`,
      PAGE,
    );
    expect(page.title).toBe("Real");
    expect(page.actions.map((a) => a.label)).toEqual(["Docs", "button"]);
  });
});

describe("robots.txt rules", () => {
  const rules = parseRobots(`User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /api/
Disallow: /*?session=
Disallow: /*.json$
Allow: /api/public/
`);

  it("applies only the * group with longest-match Allow/Disallow", () => {
    expect(robotsAllowsPath(rules, "/")).toBe(true);
    expect(robotsAllowsPath(rules, "/api/keys")).toBe(false);
    expect(robotsAllowsPath(rules, "/api/public/docs")).toBe(true);
  });

  it("supports * and $ wildcards", () => {
    expect(robotsAllowsPath(rules, "/pricing?session=1")).toBe(false);
    expect(robotsAllowsPath(rules, "/data.json")).toBe(false);
    expect(robotsAllowsPath(rules, "/data.json.html")).toBe(true);
  });
});

describe("redirect re-validation", () => {
  afterEach(() => vi.restoreAllMocks());

  const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });

  it("PlainFetcher refuses a redirect to a private address without fetching it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(redirectTo("http://127.0.0.1/"));
    await expect(new PlainFetcher().fetchHtml("http://93.184.216.34/robots.txt")).rejects.toThrow(/private IP/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("follows public redirects and caps the hop count", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(redirectTo("http://93.184.216.35/next"))
      .mockResolvedValueOnce(new Response("ok"));
    const res = await fetchPublic("http://93.184.216.34/");
    expect(await res.text()).toBe("ok");
    expect(String(fetchMock.mock.calls[1][0])).toBe("http://93.184.216.35/next");

    fetchMock.mockImplementation(async () => redirectTo("http://93.184.216.34/loop"));
    await expect(fetchPublic("http://93.184.216.34/")).rejects.toThrow(/Too many redirects/);
  });
});

describe("withTimeout", () => {
  it("rejects a hung page call", async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, "page.content")).rejects.toThrow(/renderer unresponsive/);
  });
});

describe("same-origin checks parse URLs instead of prefix-matching", () => {
  const PUBLIC = "http://93.184.215.14";
  const USERINFO = `${PUBLIC}@127.0.0.1/admin`;

  it("treats a userinfo link as off-origin", () => {
    expect(isSameOrigin(`${PUBLIC}/docs`, PUBLIC)).toBe(true);
    expect(isSameOrigin(USERINFO, PUBLIC)).toBe(false);
    expect(isSameOrigin("https://example.com@169.254.169.254/", "https://example.com")).toBe(false);
  });

  it("extractPage never marks a userinfo link as a crawlable click", () => {
    const { actions } = extractPage(`<title>T</title><a href="https://example.com@169.254.169.254/x">Meta</a>`, PAGE);
    expect(actions.find((a) => a.label === "Meta")).toMatchObject({ type: "navigate", safeToExecute: false });
  });

  function fakePage(initialUrl: string) {
    let current = initialUrl;
    const gotos: string[] = [];
    const locator = { count: async () => 0, first: () => ({ click: async () => Promise.reject(new Error("no element")) }) };
    const page = {
      gotos,
      setUrl: (u: string) => (current = u),
      goto: async (u: string) => {
        gotos.push(u);
        if (!u.includes("@")) current = u;
        return null;
      },
      url: () => current,
      title: async () => "Page",
      waitForTimeout: async () => undefined,
      waitForLoadState: async () => undefined,
      screenshot: async () => Buffer.from(""),
      getByRole: () => locator,
      locator: () => locator,
    };
    return page;
  }

  it("executeTrajectory refuses to goto a userinfo href", async () => {
    const page = fakePage(`${PUBLIC}/`);
    const action = { actionId: "a1", label: "Docs", role: "link" as const, href: USERINFO };
    const { steps } = await executeTrajectory(
      page as unknown as Parameters<typeof executeTrajectory>[0],
      { runId: "r", url: `${PUBLIC}/`, viewport: { name: "desktop", width: 1280, height: 800 }, actions: [action], assertions: [] } as unknown as Parameters<typeof executeTrajectory>[1],
      tmpdir(),
      { navTimeoutMs: 1000, preferClick: false },
    );
    expect(page.gotos).toEqual([`${PUBLIC}/`]);
    expect(steps[0].ok).toBe(false);
  });

  it("StagehandRunner.step refuses a userinfo href", async () => {
    const runner = new StagehandRunner({ env: "local", evidenceDir: tmpdir() });
    const page = fakePage(`${PUBLIC}/`);
    const step = (runner as unknown as { step: (sh: unknown, p: unknown, a: unknown) => Promise<void> }).step.bind(runner);
    await expect(step({}, page, { actionId: "a1", label: "Docs", role: "link", href: USERINFO })).rejects.toThrow();
    expect(page.gotos).toEqual([]);
  });

  it("StagehandRunner.openPage rejects a redirect onto a private address", async () => {
    const runner = new StagehandRunner({ env: "local", evidenceDir: tmpdir() });
    const page = fakePage(`${PUBLIC}/`);
    page.goto = async (u: string) => {
      page.gotos.push(u);
      page.setUrl("http://127.0.0.1/admin");
      return null;
    };
    Object.assign(runner, { withSession: async (_vp: unknown, _p: unknown, fn: (sh: unknown, p: unknown) => unknown) => fn({}, page) });
    await expect(runner.openPage(`${PUBLIC}/`, { name: "desktop", width: 1280, height: 800 } as never)).rejects.toThrow(/off-origin/);
  });
});
