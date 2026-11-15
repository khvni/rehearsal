import { describe, expect, it } from "vitest";
import { extractPage } from "../../src/lib/browser/extract";

describe("persona button extraction safety", () => {
  it.each([
    ['<form><button>Confirm purchase</button></form>', false],
    ['<form id="checkout"></form><button form="checkout">Confirm purchase</button>', false],
    ['<button type="button" form="checkout">Confirm purchase</button>', true],
    ['<button form="missing">Confirm purchase</button>', false],
    ['<form><button type="invalid">Confirm purchase</button></form>', false],
    ['<button>Confirm purchase</button>', true],
  ])("classifies %s as safe=%s", (html, safe) => {
    expect(extractPage(html, "https://example.com/").actions[0].safeToExecute).toBe(safe);
  });
});
