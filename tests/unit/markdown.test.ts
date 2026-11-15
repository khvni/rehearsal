import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/app/_components/markdown";
import { SpecReport } from "@/lib/contracts";
import { specToMarkdown } from "@/lib/analysis/spec";

function render(source: string) {
  return parseHTML(renderToStaticMarkup(createElement(Markdown, { source }))).document;
}

describe("dashboard markdown lists", () => {
  it("keeps generated implementation steps inside their Steps item", () => {
    const spec = SpecReport.parse({
      targetUrl: "https://example.com", goal: "Find recordings", generatedAt: "2026-01-01T00:00:00Z",
      summary: "Make recordings easy to find.", baselineRunIds: [],
      changes: [{ rank: 1, title: "Clarify the recording link", change: "Replace the stale apply link.",
        steps: ["Rename **Apply** to **Watch recordings**.", "Point the link to `/recordings`."],
        rationale: "The event has ended.", effort: "S", evidencePaths: [] }],
      rebuildPhases: [{ name: "Navigation", goal: "Expose recordings", items: ["Update the primary link"] }],
    });
    const source = specToMarkdown(spec);
    expect(source).toContain("- Steps:\n  - Rename");
    const doc = render(source);
    const list = doc.querySelector("ul")!;
    expect(list.children).toHaveLength(3);
    const steps = list.children[1];
    expect(steps.firstChild?.textContent).toBe("Steps:");
    expect(steps.querySelectorAll("ul > li")).toHaveLength(2);
    expect(steps.querySelector("strong")?.textContent).toBe("Apply");
    expect(steps.querySelector("code")?.textContent).toBe("/recordings");
  });

  it("handles multiple depths, dedents and separate lists", () => {
    const doc = render("- Parent\n  * Child\n    - Grandchild\n  - Sibling\n- Next\n\nParagraph\n\n- Separate");
    expect(doc.querySelector(".prose > ul")?.children).toHaveLength(2);
    expect(doc.querySelector("ul ul")?.children).toHaveLength(2);
    expect(doc.querySelector("ul ul ul li")?.textContent).toBe("Grandchild");
    expect(doc.querySelectorAll(".prose > ul")).toHaveLength(2);
  });

  it("renders empty input and treats malformed markers as text", () => {
    expect(render("").querySelector(".prose")?.children).toHaveLength(0);
    const doc = render("-\n*no space\n  - Indented root");
    expect(doc.querySelector("p")?.textContent).toBe("-*no space");
    expect(doc.querySelector("ul > li")?.textContent).toBe("Indented root");
  });
});
