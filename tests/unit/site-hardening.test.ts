import { describe, expect, it } from "vitest";
import { extractPage } from "../../src/lib/browser/extract";
import { withTimeout } from "../../src/lib/browser/playwright";
import { parseRobots, robotsAllowsPath } from "../../src/lib/fetch/guards";

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

describe("withTimeout", () => {
  it("rejects a hung page call", async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, "page.content")).rejects.toThrow(/renderer unresponsive/);
  });
});
