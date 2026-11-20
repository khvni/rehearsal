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

  it("keeps legacy color attributes grayscale too", () => {
    const out = enforceMockupWireframe(`<td bgcolor="#008a2e">x</td>`);
    const hex = out.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)!;
    expect(hex[1]).toBe(hex[2]);
    expect(hex[2]).toBe(hex[3]);
  });
});
