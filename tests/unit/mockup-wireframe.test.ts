import { describe, expect, it } from "vitest";
import { enforceMockupWireframe } from "@/lib/mockup/render";

describe("enforceMockupWireframe", () => {
  it("rewrites every color to a luminance gray — hex, rgb(), hsl(), named", () => {
    const html = `<style>
      .a { color: #008a2e; background: rgb(10, 40, 200); border: 1px solid hsl(200, 80%, 50%); }
      .b { color: red; outline-color: rgba(255, 0, 0, 0.5); }
    </style>
    <p style="color: #ff8800; background-color: rebeccapurple">x</p>`;
    const out = enforceMockupWireframe(html);
    const colors = out.match(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(red|green|blue|purple|orange|yellow|pink|teal|cyan|magenta|brown)\b/g) ?? [];
    for (const token of colors) {
      const m = token.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (m) {
        expect(m[1]).toBe(m[2]);
        expect(m[2]).toBe(m[3]);
      } else if (token.startsWith("rgb")) {
        const nums = token.match(/\d+/g)!.map(Number);
        expect(nums[0]).toBe(nums[1]);
        expect(nums[1]).toBe(nums[2]);
      } else expect(token).toBe("#888888");
    }
  });

  it("collapses font-family to the generic sans stack", () => {
    const out = enforceMockupWireframe(
      `<style>body { font-family: "Brand Sans", serif }</style><div style="font-family: Inter, Arial">x</div>`,
    );
    expect(out).not.toMatch(/Brand Sans|Inter/);
    expect(out).toMatch(/font-family:ui-sans-serif/);
  });

  it("strips the source brand name from markup", () => {
    const out = enforceMockupWireframe(
      `<title>MTC — Muslim Tech Council · mockup</title><header>MTC</header><p>Join MTC today.</p>`,
      "MTC",
    );
    expect(out).not.toContain("MTC");
    expect(out).toContain("Preview");
  });

  it("strips the brand acronym too — 'Join MTC' has no full name in it", () => {
    const out = enforceMockupWireframe(
      `<nav><a href="/experiments/e1/preview/join">Join MTC ↗</a></nav><p>Explain MTC&#39;s unique value.</p>`,
      "Muslim Tech Collaborative",
      ["MTC"],
    );
    expect(out).toContain("Join Preview");
    expect(out).toContain("Explain Preview&#39;s unique value.");
    expect(out).not.toContain("MTC");
    // Case-sensitive: a lowercase 'mtc' inside a path is not the acronym.
    const kebab = enforceMockupWireframe(`<p>mtc-tools</p>`, "Muslim Tech Collaborative", ["MTC"]);
    expect(kebab).toContain("mtc-tools");
  });

  it("strips punctuated and non-ASCII brand names — they have no \\b edge", () => {
    const out = enforceMockupWireframe(
      `<h1>Welcome to Yahoo!</h1><p>Café hours</p><p>日本</p><p>aYahoo!b</p>`,
      undefined,
      ["Yahoo!", "Café", "日本"],
    );
    expect(out).toContain("<h1>Welcome to Preview</h1>");
    expect(out).toContain("Preview hours");
    expect(out).toContain(">Preview<");
    expect(out).toContain("aYahoo!b");
  });

  it("keeps legacy color attributes grayscale too", () => {
    const out = enforceMockupWireframe(`<td bgcolor="#008a2e">x</td>`);
    const hex = out.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)!;
    expect(hex[1]).toBe(hex[2]);
    expect(hex[2]).toBe(hex[3]);
  });

  it("never rewrites the brand name inside link targets", () => {
    const out = enforceMockupWireframe(
      `<a href="/preview/acme-products">acme products</a><a href='https://acme.example/x'>x</a>`,
      "acme",
    );
    expect(out).toContain(`href="/preview/acme-products"`);
    expect(out).toContain(`href='https://acme.example/x'`);
    expect(out).toContain(">Preview products<");
  });

  it("collapses inline fonts without breaking the style attribute", () => {
    const out = enforceMockupWireframe(`<div style="font-family: Inter, Arial; display:none">x</div>`);
    expect(out).toMatch(/style="[^"]*display:none[^"]*"/);
    expect(out).not.toContain("Inter");
  });

  it("leaves ordinary digits in markup and styles untouched", () => {
    const out = enforceMockupWireframe(
      `<h2>Event 2026</h2><p style="width: 240px">x</p><a href="/preview/acme">acme</a>`,
      "acme",
    );
    expect(out).toContain("Event 2026");
    expect(out).toContain("width: 240px");
    expect(out).toContain(`href="/preview/acme"`);
  });

  it("keeps link targets safe when an earlier attribute contains a >", () => {
    const out = enforceMockupWireframe(
      `<a title="a > b" href="/preview/acme-products">acme</a>`,
      "acme",
    );
    expect(out).toContain(`href="/preview/acme-products"`);
  });

  it("collapses fonts in single-quoted styles without breaking the attribute", () => {
    const out = enforceMockupWireframe(`<div style='font-family: Inter; display:none'>x</div>`);
    expect(out).toMatch(/style='[^']*display:none[^']*'/);
  });

  it("keeps grayscale stable — a second pass does not darken", () => {
    const once = enforceMockupWireframe(`<style>a{color:#00aa88}</style>`);
    const twice = enforceMockupWireframe(once);
    expect(twice).toBe(once);
  });

  it("restyles only declarations — selectors are not colors", () => {
    const out = enforceMockupWireframe(
      `<style>.blue-button { display:none; color:#008a2e } #abc { background: red }</style>`,
    );
    expect(out).toContain(".blue-button");
    expect(out).toContain("#abc");
  });

  it("keeps fully transparent colors transparent — alpha 0 is not an opaque gray", () => {
    const out = enforceMockupWireframe(
      `<style>.a { color: rgba(0,0,0,0) } .b { color: hsla(200,50%,50%,0) } .c { border-color: #11223300 } .d { background: linear-gradient(to right, rgba(255,255,255,0), #fff) }</style>` +
        `<div style="background: rgba(0,0,0,0)">x</div>`,
    );
    expect(out).toContain("rgba(0,0,0,0)");
    expect(out).toContain("rgba(255,255,255,0)");
    expect(out).toContain("rgba(67,67,67,0)"); // hsla → gray at alpha 0
    expect(out).toContain("rgba(4,4,4,0)"); // #11223300 → gray at alpha 0
    expect(out).not.toMatch(/color:\s*#[0-9a-f]{6}/i);
  });

  it("maps mid-tone colors to a stable luminance gray — they don't decay to black", () => {
    // restyleCss re-passes declarations until a fixpoint, so the gray must be
    // idempotent: before the fix every color darkened on each pass until it
    // converged to #000000.
    const out = enforceMockupWireframe(
      `<style>.x { color: #1a73e8 } .y { background: #d97706 } .z { color: #888888 }</style>`,
    );
    expect(out).toContain("#2f2f2f");
    expect(out).toContain("#474747");
    expect(out).toContain("#888888");
  });
});
